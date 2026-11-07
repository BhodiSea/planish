// SPDX-License-Identifier: Apache-2.0
// Runs a command on an APFS clone of a working tree, inside Seatbelt, with no
// network, writes only to the run's folder, and time and memory limits. The
// run's folder, clone included, is deleted afterwards.

import { execFile, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const PROFILE = fs.readFileSync(new URL('./profile.sbpl', import.meta.url), 'utf8');
// Codex's rules for local binding (codex-rs/sandboxing/src/seatbelt.rs,
// copyright 2025 OpenAI, Apache License 2.0): listen on any address, accept
// and connect only through loopback, which also reaches the device's other
// servers.
const LOOPBACK = `
(allow network-bind (local ip "*:*"))
(allow network-inbound (local ip "localhost:*"))
(allow network-outbound (remote ip "localhost:*"))
`;
const TAIL = 64 * 1024;
const POLL_MS = 200;

// Where credentials usually live, relative to the home folder. A run's output
// reaches the learner's agent and its model provider, so a run must not read
// them. The list cannot be complete.
export const SECRETS = [
  '.ssh', '.gnupg', '.aws', '.azure', '.kube', '.netrc', '.npmrc', '.pypirc', '.git-credentials',
  '.docker/config.json', '.cargo/credentials', '.cargo/credentials.toml',
  '.config/gh', '.config/gcloud', '.config/hub', '.claude', '.claude.json', '.codex',
  'Library/Keychains', 'Library/Cookies', 'Library/Application Support/Google/Chrome',
  'Library/Application Support/Firefox', 'Library/Safari',
];

const quote = (text) => `"${text.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

export function profile(network, home = fs.realpathSync(os.homedir())) {
  if (network !== 'none' && network !== 'loopback') throw new Error(`unknown network mode ${network}`);
  const secrets = SECRETS.map((name) => `(deny file-read* file-write* (subpath ${quote(path.join(home, name))}))`).join('\n');
  return `${PROFILE}${network === 'loopback' ? LOOPBACK : ''}\n${secrets}\n`;
}

// cp -c clones each file with clonefile(2). Node's fs.cp with
// COPYFILE_FICLONE copied the data instead when tried on macOS 15.
export function cloneTree(source, target) {
  execFileSync('/bin/cp', ['-c', '-R', '-P', '-p', source, target], { stdio: ['ignore', 'ignore', 'pipe'] });
}

export function removeTree(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Go's module cache and some test fixtures are read-only.
    fs.chmodSync(dir, 0o700);
    for (const entry of fs.readdirSync(dir, { recursive: true })) {
      const file = path.join(dir, entry);
      try {
        if (!fs.lstatSync(file).isSymbolicLink()) fs.chmodSync(file, 0o700);
      } catch {}
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const PASS_THROUGH = ['PATH', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'GOROOT', 'GOPATH', 'GOMODCACHE', 'JAVA_HOME'];

// Only named variables reach the project's code, so API keys and tokens in
// Planish's environment do not. Caches and temporary files go to the run's
// folder; package managers are told they are offline.
async function environment(runDir, ecosystem) {
  const tmp = path.join(runDir, 'tmp');
  const cache = path.join(runDir, 'cache');
  fs.mkdirSync(tmp);
  fs.mkdirSync(cache);
  const env = { HOME: os.homedir(), TERM: 'dumb', CI: 'true', NO_COLOR: '1' };
  for (const name of PASS_THROUGH) if (process.env[name] !== undefined) env[name] = process.env[name];
  Object.assign(env, {
    TMPDIR: `${tmp}/`,
    XDG_CACHE_HOME: cache,
    npm_config_cache: path.join(cache, 'npm'),
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    COREPACK_HOME: process.env.COREPACK_HOME ?? path.join(os.homedir(), '.cache', 'node', 'corepack'),
    PIP_NO_INDEX: '1',
    GOPROXY: 'off',
    GOFLAGS: '-mod=readonly',
    GOTOOLCHAIN: 'local',
    GOTMPDIR: tmp,
    CARGO_NET_OFFLINE: 'true',
  });
  if (ecosystem === 'go') {
    // Go writes its build cache as it reads it, so the run gets a clone.
    const goCache = await goEnv('GOCACHE');
    env.GOCACHE = path.join(cache, 'go-build');
    if (goCache && fs.existsSync(goCache)) cloneTree(goCache, env.GOCACHE);
  }
  if (ecosystem === 'rust') {
    // Cargo locks a file in CARGO_HOME even offline; the registry is read only.
    const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo');
    env.CARGO_HOME = path.join(cache, 'cargo');
    fs.mkdirSync(env.CARGO_HOME);
    for (const name of ['registry', 'git', 'config.toml', 'bin']) {
      if (fs.existsSync(path.join(cargoHome, name))) fs.symlinkSync(path.join(cargoHome, name), path.join(env.CARGO_HOME, name));
    }
  }
  if (ecosystem === 'python') {
    // An editable install points at the original tree, not the clone.
    const src = path.join(runDir, 'tree', 'src');
    const roots = [path.join(runDir, 'tree'), ...(fs.existsSync(src) ? [src] : [])];
    env.PYTHONPATH = roots.join(':');
  }
  return env;
}

export async function fileSystem(dir) {
  const { stdout } = await run('/bin/df', [dir]);
  const mount = stdout.trim().split('\n').at(-1).split(/\s+/).at(-1);
  const table = (await run('/sbin/mount')).stdout;
  return table.split('\n').find((line) => line.includes(` on ${mount} (`))?.match(/ \((\w+),/)?.[1] ?? null;
}

async function goEnv(name) {
  try {
    return (await run('go', ['env', name])).stdout.trim();
  } catch {
    return null;
  }
}

// With -E, ps shows each process's environment after its command, which
// finds a run's processes that have left its process group.
async function processTable() {
  const { stdout } = await run('/bin/ps', ['-A', '-E', '-ww', '-o', 'pid=,ppid=,pgid=,rss=,command='], { maxBuffer: 256 * 1024 * 1024 });
  return stdout.trim().split('\n').map((line) => {
    const [pid, ppid, pgid, rss, ...command] = line.trim().split(/\s+/);
    return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), rss: Number(rss), command: command.join(' ') };
  });
}

// The run's processes: the root's process group, processes carrying the run's
// marker in their environment, and their descendants.
function members(table, root, seen, marker) {
  const children = new Map();
  for (const row of table) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row);
  }
  const found = new Map();
  const queue = table.filter((row) => row.pid === root || row.pgid === root || seen.has(row.pid) || row.command.includes(marker));
  while (queue.length) {
    const row = queue.pop();
    if (found.has(row.pid)) continue;
    found.set(row.pid, row);
    queue.push(...(children.get(row.pid) ?? []));
  }
  return [...found.values()];
}

function keepTail(chunks, chunk) {
  chunks.push(chunk);
  let size = chunks.reduce((sum, c) => sum + c.length, 0);
  while (size > TAIL && chunks.length > 1) size -= chunks.shift().length;
}

// options: source (the working tree), command (a shell command), ecosystem,
// network ('none' or 'loopback'), sandbox (false runs the same clone and
// environment without Seatbelt, as a baseline), timeoutMs, memoryMb.
export async function runInSandbox(options) {
  const { source, command, ecosystem = null, network = 'none', sandbox = true, timeoutMs = 10 * 60_000, memoryMb = 4096 } = options;
  const base = fs.realpathSync(os.tmpdir());
  if (fs.statSync(base).dev !== fs.statSync(source).dev) {
    throw new Error(`${source} is on another volume than ${base}, so it cannot be cloned there`);
  }
  if (await fileSystem(base) !== 'apfs') throw new Error(`${base} is not on APFS, so it cannot be cloned`);
  const runDir = fs.mkdtempSync(path.join(base, 'planish-run-'));
  const tree = path.join(runDir, 'tree');
  const started = Date.now();
  try {
    cloneTree(source, tree);
    const cloneMs = Date.now() - started;
    const env = await environment(runDir, ecosystem);
    env.PLANISH_RUN = randomUUID();
    const [file, args] = sandbox
      ? [SANDBOX_EXEC, ['-p', profile(network), '-D', `RUN=${runDir}`, '/bin/sh', '-c', command]]
      : ['/bin/sh', ['-c', command]];
    const result = await supervise(file, args, { cwd: tree, env }, timeoutMs, memoryMb, `PLANISH_RUN=${env.PLANISH_RUN}`);
    return { ...result, cloneMs, runDir };
  } finally {
    removeTree(runDir);
  }
}

function supervise(file, args, spawnOptions, timeoutMs, memoryMb, marker) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(file, args, { ...spawnOptions, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const closed = new Promise((done) => child.on('close', done));
    child.stdout.on('data', (chunk) => keepTail(stdout, chunk));
    child.stderr.on('data', (chunk) => keepTail(stderr, chunk));
    const seen = new Set();
    let reason = 'exit';
    let peakKb = 0;
    let polling = false;

    const killAll = () => {
      for (const pid of [child.pid, ...seen]) {
        try {
          process.kill(pid === child.pid ? -pid : pid, 'SIGKILL');
        } catch {}
      }
    };
    // Kills until a scan finds none, since a process may fork while dying.
    const sweep = async () => {
      for (let round = 0; round < 20; round++) {
        killAll();
        const left = members(await processTable(), child.pid, new Set(), marker).filter((row) => row.pid !== process.pid);
        if (left.length === 0) return;
        for (const row of left) seen.add(row.pid);
      }
    };
    const stop = (why) => {
      if (reason === 'exit') reason = why;
      killAll();
    };
    const timer = setTimeout(() => stop('time'), timeoutMs);
    const poll = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const rows = members(await processTable(), child.pid, seen, marker);
        for (const row of rows) seen.add(row.pid);
        const kb = rows.reduce((sum, row) => sum + row.rss, 0);
        peakKb = Math.max(peakKb, kb);
        if (kb > memoryMb * 1024) stop('memory');
      } catch {}
      polling = false;
    }, POLL_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      clearInterval(poll);
      reject(error);
    });
    child.on('exit', async (code, signal) => {
      clearTimeout(timer);
      clearInterval(poll);
      const durationMs = Date.now() - started;
      // Background processes the command left behind die with it.
      await sweep().catch(() => killAll());
      const finish = () => resolve({
        code,
        signal,
        reason,
        durationMs,
        peakRssMb: Math.round(peakKb / 1024),
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
      // A process the sweep missed may still hold the pipes open.
      const grace = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish();
      }, 2000);
      closed.then(() => {
        clearTimeout(grace);
        finish();
      });
    });
  });
}
