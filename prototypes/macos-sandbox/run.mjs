// SPDX-License-Identifier: Apache-2.0
// Runs a project's tests in the sandbox:
//   node run.mjs <project> [--test <command>] [--build <command>]
//     [--network none|loopback] [--no-sandbox] [--time <seconds>] [--memory <MB>]
// Without --test it uses the detected commands, and stops for confirmation
// when detection is unsure.

import path from 'node:path';
import { parseArgs } from 'node:util';
import { detect } from './detect.mjs';
import { runInSandbox } from './sandbox.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    test: { type: 'string' },
    build: { type: 'string' },
    network: { type: 'string', default: 'none' },
    'no-sandbox': { type: 'boolean', default: false },
    time: { type: 'string', default: '600' },
    memory: { type: 'string', default: '4096' },
  },
});
if (positionals.length !== 1) {
  console.error('usage: node run.mjs <project> [--test <command>] [--build <command>] [--network none|loopback] [--no-sandbox] [--time <seconds>] [--memory <MB>]');
  process.exit(2);
}
const source = path.resolve(positionals[0]);
const detected = detect(source);
if (!values.test) {
  for (const candidate of detected.candidates) console.error(`detected ${candidate.ecosystem}: build ${candidate.build ?? '(none)'}, test ${candidate.test} (${candidate.evidence})`);
  if (!detected.found || detected.confirm) {
    console.error('confirm the commands with --test and --build');
    process.exit(2);
  }
}
const test = values.test ?? detected.found.test;
const build = values.build ?? (values.test ? null : detected.found.build);
const result = await runInSandbox({
  source,
  command: build ? `${build} && ${test}` : test,
  ecosystem: detected.found?.ecosystem ?? null,
  network: values.network,
  sandbox: !values['no-sandbox'],
  timeoutMs: Number(values.time) * 1000,
  memoryMb: Number(values.memory),
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
console.error(`exit ${result.code ?? result.signal}, stopped by ${result.reason}, ${result.durationMs} ms, clone ${result.cloneMs} ms, peak ${result.peakRssMb} MB`);
process.exit(result.code === 0 ? 0 : 1);
