// SPDX-License-Identifier: Apache-2.0
// Runs the tests of the projects in corpus.json three ways: on the clone
// without Seatbelt (the baseline), in the sandbox with no network, and in the
// sandbox with loopback only. Each project's setup, which fetches its
// dependencies, runs first with the network, outside the sandbox.
//   node corpus.mjs <work folder> <results folder>

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { detect } from './detect.mjs';
import { runInSandbox } from './sandbox.mjs';

const exec = promisify(execFile);
const [work, results] = process.argv.slice(2).map((dir) => path.resolve(dir));
const corpus = JSON.parse(fs.readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(results, { recursive: true });

const MODES = [
  ['baseline', { sandbox: false }],
  ['no network', { network: 'none' }],
  ['loopback', { network: 'loopback' }],
];

function logTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Seatbelt logs each refusal; the distinct operations explain a failure.
function denials(start, end) {
  try {
    const log = execFileSync('/usr/bin/log', ['show', '--style', 'compact', '--start', logTime(start), '--end', logTime(new Date(end.getTime() + 2000)), '--predicate', 'eventMessage CONTAINS "deny("'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const counts = new Map();
    for (const match of log.matchAll(/deny\(\d+\) (\S+)(?: (\S+))?/g)) {
      const key = `${match[1]} ${(match[2] ?? '').replace(/\/planish-run-[^/]+/, '/RUN').slice(0, 100)}`.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, n]) => `${key} (${n})`);
  } catch (error) {
    return [`log show failed: ${error.message.split('\n')[0]}`];
  }
}

function cell(run) {
  if (!run) return 'not run';
  const seconds = `${(run.durationMs / 1000).toFixed(1)} s`;
  if (run.reason !== 'exit') return `stopped (${run.reason}) ${seconds}`;
  return run.code === 0 ? `pass ${seconds}` : `fail (exit ${run.code ?? run.signal}) ${seconds}`;
}

const rows = [];
for (const entry of corpus) {
  const name = entry.repo.replace('/', '-');
  const dir = path.join(work, name);
  const row = { ...entry, runs: {} };
  rows.push(row);
  console.log(`::group::${entry.repo}`);
  try {
    if (!fs.existsSync(dir)) {
      await exec('git', ['clone', '--quiet', '--filter=blob:none', `https://github.com/${entry.repo}.git`, dir]);
      await exec('git', ['-C', dir, 'checkout', '--quiet', entry.commit]);
    }
    await exec('/bin/sh', ['-c', entry.setup], { cwd: dir, timeout: 20 * 60_000, maxBuffer: 256 * 1024 * 1024 });
  } catch (error) {
    row.setupError = `${error.message}\n${error.stderr ?? ''}`.slice(-2000);
    console.log(row.setupError);
    console.log('::endgroup::');
    continue;
  }
  const detected = detect(dir);
  row.detected = detected.found;
  row.confirm = detected.confirm;
  row.detectionMatches = Boolean(detected.found) && `${detected.found.test} `.startsWith(`${entry.expect} `.replace(/^cargo test /, 'cargo test --offline '));
  const command = detected.found ? [detected.found.build, detected.found.test].filter(Boolean).join(' && ') : entry.expect;
  row.command = command;
  for (const [mode, options] of MODES) {
    const start = new Date();
    try {
      const run = await runInSandbox({ source: dir, command, ecosystem: detected.found?.ecosystem, timeoutMs: 15 * 60_000, memoryMb: 4096, ...options });
      row.runs[mode] = { code: run.code, signal: run.signal, reason: run.reason, durationMs: run.durationMs, cloneMs: run.cloneMs, peakRssMb: run.peakRssMb, output: `${run.stdout}\n${run.stderr}`.slice(-4000) };
      if (options.sandbox !== false && run.code !== 0) row.runs[mode].denials = denials(start, new Date());
      console.log(`${mode}: ${cell(row.runs[mode])}`);
      if (run.code !== 0) console.log(row.runs[mode].output);
    } catch (error) {
      row.runs[mode] = { error: error.message };
      console.log(`${mode}: ${error.message}`);
    }
  }
  console.log('::endgroup::');
}

fs.writeFileSync(path.join(results, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`);
const lines = [
  '| Project | Detected command | Matches | Clone | Baseline | No network | Loopback | Peak memory |',
  '|---|---|---|---|---|---|---|---|',
];
for (const row of rows) {
  if (row.setupError) {
    lines.push(`| [${row.repo}](https://github.com/${row.repo}/tree/${row.commit}) | setup failed | | | | | | |`);
    continue;
  }
  const clone = row.runs.baseline?.cloneMs;
  const peak = Math.max(...Object.values(row.runs).map((run) => run.peakRssMb ?? 0));
  lines.push(`| [${row.repo}](https://github.com/${row.repo}/tree/${row.commit}) | \`${row.command}\` | ${row.detectionMatches ? 'yes' : 'no'}${row.confirm ? ', confirm' : ''} | ${clone === undefined ? '' : `${(clone / 1000).toFixed(1)} s`} | ${cell(row.runs.baseline)} | ${cell(row.runs['no network'])} | ${cell(row.runs.loopback)} | ${peak} MB |`);
}
const notes = rows.flatMap((row) => Object.entries(row.runs)
  .filter(([, run]) => run.denials?.length)
  .map(([mode, run]) => `- ${row.repo}, ${mode}: ${run.denials.join('; ')}`));
const markdown = `${lines.join('\n')}\n${notes.length ? `\nRefusals Seatbelt logged in failed sandboxed runs:\n\n${notes.join('\n')}\n` : ''}`;
fs.writeFileSync(path.join(results, 'results.md'), markdown);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
