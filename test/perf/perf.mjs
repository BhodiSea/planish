// SPDX-License-Identifier: Apache-2.0
//
// Measures a build's startup and typing against a baseline build of the same VS Code release,
// with VS Code's own instruments: the `ellapsed` startup mark that --prof-append-timers writes, as
// vscode-perf reads it, and the `inputlatency` measures that the editor records for each key press,
// from keydown to the frame that shows it. The baseline is measured twice, so each report also shows
// the run-to-run spread of identical builds. Startup runs and typing sessions take turns between
// the three, so that a slower spell on the runner falls on all of them.
//
// Usage: node test/perf/perf.mjs <baseline> <candidate> [--runs N] [--keys N] [--rounds N] [--out FILE]
// A build is VSCode-darwin-arm64 (or its .app), VSCode-linux-x64 or VSCode-win32-x64.
// Linux needs a display: xvfb-run -a node test/perf/perf.mjs ...
// The candidate is compared with the mean of the two baseline measures. A round in which it
// differs by more than LIMITS is repeated once, and
// the script exits 1 when the repeat differs too.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Percent: the run-to-run spread measured on GitHub's macOS runners, in docs/spec/fork.md#performance.
const LIMITS = { startup: 15, typing: 12 };

const options = { runs: 10, keys: 300, rounds: 1, out: '' };
const builds = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const name = arg.slice(2);
    if (!(name in options)) { throw new Error(`Unknown option ${arg}`); }
    options[name] = typeof options[name] === 'number' ? Number(process.argv[++i]) : process.argv[++i];
  } else {
    builds.push(arg);
  }
}
if (builds.length !== 2) {
  console.error('Usage: node test/perf/perf.mjs <baseline> <candidate> [--runs N] [--keys N] [--rounds N] [--out FILE]');
  process.exit(2);
}

const WARM_UP_KEYS = 20;
const KEY_GAP_MS = 80;
const SETTLE_MS = 10_000;
const TEXT = 'the quick brown fox jumps over the lazy dog ';

function resolveBuild(folder) {
  let root = path.resolve(folder);
  if (process.platform === 'darwin' && !root.endsWith('.app')) {
    const apps = fs.readdirSync(root).filter(name => name.endsWith('.app'));
    if (apps.length !== 1) { throw new Error(`${root} holds ${apps.length} apps, not one`); }
    root = path.join(root, apps[0]);
  }
  const resources = process.platform === 'darwin' ? path.join(root, 'Contents/Resources/app') : path.join(root, 'resources/app');
  const product = JSON.parse(fs.readFileSync(path.join(resources, 'product.json'), 'utf8'));
  const exe = process.platform === 'darwin' ? path.join(root, 'Contents/MacOS', product.nameShort)
    : process.platform === 'win32' ? path.join(root, `${product.nameShort}.exe`)
      : path.join(root, product.applicationName);
  const { version } = JSON.parse(fs.readFileSync(path.join(resources, 'package.json'), 'utf8'));
  return { name: product.nameShort, version, commit: (product.commit || '').slice(0, 10), exe };
}

// A TypeScript file of about 22,000 lines, with a comment near the middle where the typing goes.
function writeWorkspace(folder) {
  const lines = [];
  let typeLine = 0;
  for (let i = 0; i < 1000; i++) {
    if (i === 500) {
      lines.push('// Typed here: ');
      typeLine = lines.length;
    }
    lines.push(
      `export interface Record${i} {`,
      '  readonly id: number;',
      '  name: string;',
      '  tags: readonly string[];',
      '}',
      '',
      `export class Store${i}<T extends Record${i}> {`,
      '  private readonly items = new Map<number, T>();',
      '',
      '  add(item: T): void {',
      '    this.items.set(item.id, item);',
      '  }',
      '',
      '  find(id: number): T | undefined {',
      '    return this.items.get(id);',
      '  }',
      '',
      '  names(): string[] {',
      '    return [...this.items.values()].map(item => `${item.name} (${item.tags.join(\', \')})`);',
      '  }',
      '}',
      '',
    );
  }
  fs.mkdirSync(path.join(folder, 'src'), { recursive: true });
  const file = path.join(folder, 'src', 'large.ts');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return { folder, file, typeLine, typeColumn: lines[typeLine - 1].length + 1 };
}

function appArgs(profile) {
  return [
    `--user-data-dir=${profile}/user-data`, `--extensions-dir=${profile}/extensions`,
    '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-telemetry',
    '--disable-workspace-trust', '--use-inmemory-secretstorage',
    // Chromium will not start as root without it, as in a container.
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
  ];
}

function launch(build, args) {
  const env = { ...process.env, VSCODE_CLI: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(build.exe, args, { env, stdio: 'ignore' });
  child.exited = new Promise(resolve => child.on('exit', resolve));
  return child;
}

async function stop(child) {
  child.kill();
  if (await Promise.race([child.exited.then(() => true), sleep(15_000).then(() => false)])) { return; }
  child.kill('SIGKILL');
  await child.exited;
}

// One start, with --prof-append-timers: the app writes its marks 15 seconds after it is ready and quits.
async function startup(build, profile, workspace) {
  const timers = path.join(profile, 'timers.txt');
  fs.rmSync(timers, { force: true });
  const child = launch(build, [...appArgs(profile), `--prof-append-timers=${timers}`, workspace.folder, workspace.file]);
  if (!await Promise.race([child.exited.then(() => true), sleep(120_000).then(() => false)])) {
    await stop(child);
    throw new Error(`${build.name} did not quit within 2 minutes of starting`);
  }
  const fields = fs.readFileSync(timers, 'utf8').trim().split('\t');
  return { ms: Number(fields[0]), standard: fields[4] };
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function devtools(port) {
  for (const deadline = Date.now() + 60_000; Date.now() < deadline; await sleep(250)) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json(), () => []);
    const page = targets.find(target => target.type === 'page' && /workbench/.test(target.url));
    if (page) { return connect(page.webSocketDebuggerUrl); }
  }
  throw new Error('The window did not open within a minute');
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  let next = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const call = pending.get(message.id);
    if (!call) { return; }
    pending.delete(message.id);
    if (message.error) { call.reject(new Error(message.error.message)); } else { call.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) { throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text); }
    return result.value;
  };
  return { send, evaluate, close: () => socket.close() };
}

async function until(page, expression, what) {
  for (const deadline = Date.now() + 60_000; Date.now() < deadline; await sleep(250)) {
    if (await page.evaluate(expression).catch(() => false)) { return; }
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function press(page, char) {
  const upper = char.toUpperCase();
  const key = char === ' '
    ? { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }
    : { key: char, code: `Key${upper}`, windowsVirtualKeyCode: upper.charCodeAt(0) };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char, ...key });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

// One session: opens the large file at the comment, waits for the window to settle, types and
// returns each key press's `inputlatency` measure, in milliseconds.
async function typing(build, profile, workspace, keys) {
  fs.rmSync(profile, { recursive: true, force: true });
  const port = await freePort();
  const child = launch(build, [...appArgs(profile), `--remote-debugging-port=${port}`,
    workspace.folder, '--goto', `${workspace.file}:${workspace.typeLine}:${workspace.typeColumn}`]);
  let page;
  try {
    page = await devtools(port);
    const editor = '.part.editor .monaco-editor';
    await until(page, `!!document.querySelector('${editor} .view-line')`, 'the editor');
    await page.evaluate(`globalThis.planishLatencies = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'inputlatency') { globalThis.planishLatencies.push(entry.duration); }
        }
      }).observe({ type: 'measure' }); true`);
    await sleep(SETTLE_MS);
    // The runner's window may not have the system's focus.
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.evaluate(`document.querySelector('${editor} .native-edit-context, ${editor} textarea.inputarea').focus(); true`);
    for (let i = 0; i < WARM_UP_KEYS + keys; i++) {
      await press(page, TEXT[i % TEXT.length]);
      await sleep(KEY_GAP_MS);
    }
    await sleep(1000);
    const latencies = await page.evaluate('globalThis.planishLatencies');
    if (latencies.length < keys) {
      throw new Error(`${build.name} recorded ${latencies.length} input latencies for ${WARM_UP_KEYS + keys} key presses`);
    }
    return latencies.slice(-keys);
  } finally {
    page?.close();
    await stop(child);
  }
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(p / 100 * values.length) - 1];
const change = (value, base) => 100 * (value / base - 1);

const [baseline, candidate] = builds.map(resolveBuild);
const subjects = [
  { label: 'Baseline', build: baseline },
  { label: 'Baseline again', build: baseline },
  { label: 'Candidate', build: candidate },
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planish-perf-'));
const workspace = writeWorkspace(path.join(tmp, 'workspace'));
subjects.forEach((subject, i) => { subject.profile = path.join(tmp, `profile-${i}`); });

const beyond = round => Object.entries(LIMITS)
  .filter(([measure, limit]) => Math.abs(round.difference[measure]) > limit)
  .map(([measure, limit]) => `${measure} is ${Math.abs(round.difference[measure]).toFixed(1)}% ${round.difference[measure] > 0 ? 'slower' : 'faster'} than the baseline, beyond ${limit}%`);

const rounds = [];
for (let round = 0; round < options.rounds || (round === options.rounds && beyond(rounds.at(-1)).length); round++) {
  console.log(round < options.rounds ? `Round ${round + 1} of ${options.rounds}` : `Round ${round + 1}, repeating round ${round}`);
  for (const subject of subjects) {
    subject.starts = [];
    if (round === 0) {
      // A first start writes V8's code cache, so it is not a standard start.
      const { ms, standard } = await startup(subject.build, subject.profile, workspace);
      console.log(`  ${subject.label}: warm-up start ${ms} ms (${standard})`);
    }
  }
  for (let run = 0; run < options.runs; run++) {
    for (let turn = 0; turn < subjects.length; turn++) {
      const subject = subjects[(run + turn) % subjects.length];
      const start = await startup(subject.build, subject.profile, workspace);
      subject.starts.push(start);
      console.log(`  ${subject.label}: start ${start.ms} ms${start.standard === 'standard_start' ? '' : ` (${start.standard})`}`);
    }
  }
  for (let turn = 0; turn < subjects.length; turn++) {
    const subject = subjects[(round + turn) % subjects.length];
    subject.latencies = await typing(subject.build, path.join(tmp, 'typing'), workspace, options.keys);
    console.log(`  ${subject.label}: typing, 95th percentile ${percentile(subject.latencies, 95).toFixed(1)} ms`);
  }
  const results = Object.fromEntries(subjects.map(subject => [subject.label, {
    startup: median(subject.starts.map(start => start.ms)),
    nonStandardStarts: subject.starts.filter(start => start.standard !== 'standard_start').length,
    typing: percentile(subject.latencies, 95),
    typingMedian: median(subject.latencies),
    starts: subject.starts.map(start => start.ms),
    latencies: subject.latencies.map(latency => Math.round(latency * 100) / 100),
  }]));
  const base = results.Baseline;
  rounds.push({
    results,
    spread: { startup: change(results['Baseline again'].startup, base.startup), typing: change(results['Baseline again'].typing, base.typing) },
    difference: Object.fromEntries(['startup', 'typing'].map(measure =>
      [measure, change(results.Candidate[measure], (base[measure] + results['Baseline again'][measure]) / 2)])),
  });
}
fs.rmSync(tmp, { recursive: true, force: true });

const failures = beyond(rounds.at(-1)).map(failure => `Round ${rounds.length}: ${failure}`);

const percent = value => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const summary = [
  `## Startup and typing on ${os.platform()} ${os.arch()}`,
  '',
  `${candidate.name} ${candidate.version} (${candidate.commit}) against ${baseline.name} ${baseline.version} (${baseline.commit}); startup is the median of ${options.runs} starts, typing the 95th percentile of ${options.keys} key presses.`,
  '',
  '| Round | Measure | Baseline | Baseline again | Candidate | Spread | Difference | Limit |',
  '|---|---|---|---|---|---|---|---|',
  ...rounds.flatMap((round, i) => [['startup', 'Startup (ms)', 0], ['typing', 'Typing (ms)', 1]].map(([measure, label, digits]) =>
    `| ${i + 1} | ${label} | ${['Baseline', 'Baseline again', 'Candidate'].map(name => round.results[name][measure].toFixed(digits)).join(' | ')} | ${percent(round.spread[measure])} | ${percent(round.difference[measure])} | ±${LIMITS[measure]}% |`)),
  '',
  ...(rounds.some(round => Object.values(round.results).some(result => result.nonStandardStarts))
    ? ['Some starts were not standard starts; the log names why.', ''] : []),
  failures.length ? failures.map(failure => `- ${failure}`).join('\n') : 'Within the limits.',
  '',
].join('\n');
console.log(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary); }
if (options.out) {
  fs.writeFileSync(options.out, JSON.stringify({ platform: `${os.platform()}-${os.arch()}`, baseline, candidate, options, limits: LIMITS, rounds }, null, 2) + '\n');
}
process.exit(failures.length ? 1 : 0);
