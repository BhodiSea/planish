// SPDX-License-Identifier: Apache-2.0
// Measures what a snapshot before every command costs on a large generated project, with the
// ways the protections spec names: a full copy, a copy-on-write clone where the file system has
// one, and a shadow git repository like Cline's checkpoints.
// Usage: node snapshot.mjs <work folder> [--scale <n>] [--runs <n>]
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

const args = process.argv.slice(2);
const work = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : Number(args[i + 1]);
};
const SCALE = opt("--scale", 1);
const RUNS = opt("--runs", 5);
const GIT = process.env.SNAPSHOT_GIT || "git";

// A project the size of a mid-sized web app with its dependencies installed, at scale 1:
// 20,000 source files, 80,000 files under node_modules and 20 binary assets, about 1.2 GB.
const SHAPE = [
  { dir: "src", files: 20_000 * SCALE, size: 8_192 },
  { dir: "node_modules", files: 80_000 * SCALE, size: 4_096 },
  { dir: "assets", files: 20 * SCALE, size: 20_000_000 },
];
const IGNORED = ["node_modules"];

function fill(size, seed) {
  // Text that compresses about as well as source code (about 3 to 1), unlike zeros or random bytes.
  let x = seed + 1;
  const words = [];
  for (let n = 0; n < size; ) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const r = x >>> 12;
    const word = (r % 8 === 0 ? "\n  " : " ") + ["const", "return", "value", "if", "=", "(", ")"][r % 7] + (r % 3 ? (r % 4096).toString(36) : "");
    words.push(word);
    n += word.length;
  }
  return words.join("").slice(0, size);
}

function generate(root) {
  let n = 0;
  for (const { dir, files, size } of SHAPE) {
    for (let i = 0; i < files; i++) {
      const sub = join(root, dir, `d${Math.floor(i / 100)}`);
      if (i % 100 === 0) mkdirSync(sub, { recursive: true });
      writeFileSync(join(sub, `f${i}.${dir === "assets" ? "bin" : "js"}`), fill(size, n++));
    }
  }
  writeFileSync(join(root, ".gitignore"), IGNORED.map((d) => `/${d}/\n`).join(""));
  return n;
}

function time(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e9;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function size(path) {
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .reduce((sum, e) => sum + statSync(join(e.parentPath, e.name)).size, 0);
}

function used(path) {
  const s = statfsSync(path);
  return (s.blocks - s.bfree) * s.bsize;
}

// A typical command's footprint: a few edited sources and one new file.
let edits = 0;
function command(root) {
  edits++;
  for (let i = 0; i < 10; i++) {
    const f = join(root, "src", `d${i}`, `f${i * 100}.js`);
    writeFileSync(f, readFileSync(f, "utf8") + `// edit ${edits}\n`);
  }
  writeFileSync(join(root, "src", `new${edits}.js`), fill(4_096, edits));
}

const run = (cmd, argv, env) => {
  const r = spawnSync(cmd, argv, { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(" ")}: ${r.status} ${r.stderr}`);
};

function cloneCommand(from, to) {
  if (platform() === "darwin") return ["/bin/cp", ["-c", "-R", from, to]];
  if (platform() === "linux") return ["cp", ["-R", "--reflink=always", from, to]];
  return null;
}

const project = join(work, "project");
const snaps = join(work, "snapshots");
rmSync(work, { recursive: true, force: true });
mkdirSync(snaps, { recursive: true });

const results = [];
const record = (way, first, perCommand, unchanged, bytes) =>
  results.push({ way, first, perCommand, unchanged, bytes });

const count = generate(project);
const before = used(work);

// Full copy, as on a file system without copy-on-write.
{
  const first = time(() => cpSync(project, join(snaps, "copy0"), { recursive: true }));
  const bytes = used(work) - before;
  const per = [];
  for (let i = 1; i <= RUNS; i++) {
    command(project);
    per.push(time(() => cpSync(project, join(snaps, `copy${i}`), { recursive: true })));
    rmSync(join(snaps, `copy${i}`), { recursive: true, force: true });
  }
  rmSync(join(snaps, "copy0"), { recursive: true, force: true });
  record("Full copy", first, median(per), null, bytes);
}

// Copy-on-write clone: clonefile on APFS, reflink on file systems that have it.
{
  const clone = cloneCommand(project, join(snaps, "clone0"));
  const probe = clone && spawnSync(clone[0], clone[1], { stdio: "ignore" }).status === 0;
  if (probe) {
    rmSync(join(snaps, "clone0"), { recursive: true, force: true });
    const start = used(work);
    const first = time(() => run(...cloneCommand(project, join(snaps, "clone0"))));
    const bytes = used(work) - start;
    const per = [];
    for (let i = 1; i <= RUNS; i++) {
      command(project);
      per.push(time(() => run(...cloneCommand(project, join(snaps, `clone${i}`)))));
      rmSync(join(snaps, `clone${i}`), { recursive: true, force: true });
    }
    rmSync(join(snaps, "clone0"), { recursive: true, force: true });
    record("Copy-on-write clone", first, median(per), null, bytes);
  } else {
    rmSync(join(snaps, "clone0"), { recursive: true, force: true });
    record("Copy-on-write clone", null, null, null, null);
  }
}

// Shadow git repository outside the project, once honouring .gitignore and once taking everything.
for (const [way, exclude] of [["Shadow git, ignored folders left out", true], ["Shadow git, everything", false]]) {
  const gitDir = join(snaps, exclude ? "shadow-src.git" : "shadow-all.git");
  const env = {
    GIT_DIR: gitDir,
    GIT_WORK_TREE: project,
    GIT_AUTHOR_NAME: "snapshot",
    GIT_AUTHOR_EMAIL: "",
    GIT_COMMITTER_NAME: "snapshot",
    GIT_COMMITTER_EMAIL: "",
  };
  const git = (...a) => run(GIT, a, env);
  git("init", "-q");
  git("config", "core.autocrlf", "false");
  git("config", "core.untrackedCache", "true");
  git("config", "core.fsmonitor", "false");
  if (!exclude) git("config", "core.excludesFile", platform() === "win32" ? "NUL" : "/dev/null");
  const snapshot = () => {
    git("add", "-A", ...(exclude ? [] : ["--force", "."]));
    git("commit", "-q", "--allow-empty", "--no-verify", "-m", "snapshot");
  };
  const first = time(snapshot);
  const bytes = size(gitDir);
  const per = [];
  const same = [];
  for (let i = 0; i < RUNS; i++) {
    command(project);
    per.push(time(snapshot));
    same.push(time(snapshot));
  }
  record(way, first, median(per), median(same), bytes);
}

const fs = (() => {
  try {
    if (platform() === "linux") return execFileSync("findmnt", ["-no", "FSTYPE", "-T", work]).toString().trim();
    if (platform() === "darwin") {
      const mount = execFileSync("df", ["-P", work]).toString().trim().split("\n").pop().split(/\s+/).pop();
      return execFileSync("/usr/sbin/diskutil", ["info", mount]).toString().match(/Type \(Bundle\):\s*(\S+)/)?.[1];
    }
    return execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Volume -FilePath '${work}').FileSystemType`]).toString().trim();
  } catch {
    return "unknown";
  }
})();

const s = (x) => (x == null ? "n/a" : `${x.toFixed(2)} s`);
const mb = (x) => (x == null ? "n/a" : `${Math.max(0, x / 1e6).toFixed(0)} MB`);
const out = [
  `### Snapshots on ${platform()} (${fs}), ${count.toLocaleString("en-GB")} files, ${execFileSync(GIT, ["--version"]).toString().trim()}`,
  "",
  `Median of ${RUNS} runs after each command; "unchanged" is a snapshot with nothing changed since the last.`,
  "",
  "| Way | First snapshot | Per command | Unchanged | Space for the first |",
  "|---|---|---|---|---|",
  ...results.map((r) => `| ${r.way} | ${s(r.first)} | ${s(r.perCommand)} | ${s(r.unchanged)} | ${mb(r.bytes)} |`),
  "",
].join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n", { flag: "a" });
rmSync(work, { recursive: true, force: true });
