// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { detect } from '../detect.mjs';

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planish-detect-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

const commands = (result) => result.found && { build: result.found.build, test: result.found.test, confirm: result.confirm };

test('npm, pnpm and yarn projects use their test and build scripts', () => {
  const scripts = JSON.stringify({ scripts: { test: 'mocha', build: 'tsc' } });
  assert.deepEqual(commands(detect(project({ 'package.json': scripts }))), { build: 'npm run build', test: 'npm test', confirm: false });
  assert.deepEqual(commands(detect(project({ 'package.json': scripts, 'pnpm-lock.yaml': '' }))), { build: 'pnpm run build', test: 'pnpm test', confirm: false });
  assert.deepEqual(commands(detect(project({ 'package.json': scripts, 'yarn.lock': '' }))), { build: 'yarn run build', test: 'yarn test', confirm: false });
});

test('npm\'s placeholder test script is not a test command', () => {
  const result = detect(project({ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }));
  assert.equal(result.found, null);
  assert.equal(result.confirm, true);
});

test('Cargo and Go projects use their own test commands', () => {
  assert.deepEqual(commands(detect(project({ 'Cargo.toml': '[package]\n' }))), { build: null, test: 'cargo test --offline', confirm: false });
  assert.deepEqual(commands(detect(project({ 'go.mod': 'module x\n' }))), { build: null, test: 'go test ./...', confirm: false });
});

test('a Python project with pytest and a virtual environment is detected with confidence', () => {
  const dir = project({ 'pyproject.toml': '[tool.pytest.ini_options]\n', '.venv/bin/python': '' });
  assert.deepEqual(commands(detect(dir)), { build: null, test: '.venv/bin/python -m pytest', confirm: false });
});

test('a Python project without a virtual environment or pytest needs confirming', () => {
  assert.deepEqual(commands(detect(project({ 'setup.py': '' }))), { build: null, test: 'python3 -m unittest', confirm: true });
});

test('a Makefile with a test target is used', () => {
  assert.deepEqual(commands(detect(project({ Makefile: 'all:\n\tcc x.c\ntest:\n\t./x\n' }))), { build: 'make', test: 'make test', confirm: false });
});

test('a project with two ecosystems needs confirming', () => {
  const result = detect(project({ 'package.json': JSON.stringify({ scripts: { test: 'jest' } }), 'Cargo.toml': '' }));
  assert.equal(result.candidates.length, 2);
  assert.equal(result.confirm, true);
});

test('a project with nothing to detect needs confirming', () => {
  const result = detect(project({ 'README.md': '' }));
  assert.equal(result.found, null);
  assert.equal(result.confirm, true);
});
