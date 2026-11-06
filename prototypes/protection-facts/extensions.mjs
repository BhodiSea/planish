// SPDX-License-Identifier: Apache-2.0
// Downloads the agent extensions pinned in extensions.json from Open VSX and checks that the
// code each README answer rests on is there, printing it so that a reader can judge it.
// Usage: node extensions.mjs <folder>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const folder = process.argv[2];
const pins = JSON.parse(readFileSync(new URL("extensions.json", import.meta.url)));
const WINDOW = 200;
let missing = 0;

for (const { id, version, platform, file, evidence } of pins) {
  const [ns, name] = id.split(".");
  const dir = join(folder, `${id}-${version}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    const target = platform === "universal" ? "" : `${platform}/`;
    const suffix = platform === "universal" ? "" : `@${platform}`;
    const url = `https://open-vsx.org/api/${ns}/${name}/${target}${version}/file/${id}-${version}${suffix}.vsix`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(`${dir}.vsix`, Buffer.from(await res.arrayBuffer()));
    execFileSync("unzip", ["-q", `${dir}.vsix`, file, "-d", dir]);
  }
  const text = readFileSync(join(dir, file), "utf8");
  console.log(`\n# ${id} ${version}, ${file}`);
  for (const [claim, pattern] of Object.entries(evidence)) {
    const m = new RegExp(pattern).exec(text);
    if (!m) {
      missing++;
      console.log(`\n## MISSING: ${claim}\n/${pattern}/`);
      continue;
    }
    const excerpt = text.slice(Math.max(0, m.index - WINDOW), m.index + m[0].length + WINDOW);
    console.log(`\n## ${claim} (at ${m.index})\n${excerpt}`);
  }
}
process.exit(missing ? 1 : 0);
