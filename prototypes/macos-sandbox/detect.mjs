// SPDX-License-Identifier: Apache-2.0
// Detects a project's build and test commands from its own files. A result
// with confident: false, or more than one candidate, is for the learner to
// confirm or replace.

import fs from 'node:fs';
import path from 'node:path';

const NPM_DEFAULT_TEST = 'echo "Error: no test specified" && exit 1';

function read(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8');
  } catch {
    return null;
  }
}

function exists(dir, name) {
  return fs.existsSync(path.join(dir, name));
}

function node(dir) {
  const text = read(dir, 'package.json');
  if (text === null) return null;
  let scripts;
  try {
    scripts = JSON.parse(text).scripts ?? {};
  } catch {
    return null;
  }
  if (!scripts.test || scripts.test === NPM_DEFAULT_TEST) return null;
  const manager = exists(dir, 'pnpm-lock.yaml') ? 'pnpm'
    : exists(dir, 'yarn.lock') ? 'yarn'
    : exists(dir, 'bun.lock') || exists(dir, 'bun.lockb') ? 'bun'
    : 'npm';
  return {
    ecosystem: 'node',
    build: scripts.build ? `${manager} run build` : null,
    test: `${manager} test`,
    evidence: `package.json's test script: ${scripts.test}`,
    confident: true,
  };
}

function rust(dir) {
  if (!exists(dir, 'Cargo.toml')) return null;
  return {
    ecosystem: 'rust',
    build: null,
    test: 'cargo test --offline',
    evidence: 'Cargo.toml',
    confident: true,
  };
}

function go(dir) {
  if (!exists(dir, 'go.mod')) return null;
  return {
    ecosystem: 'go',
    build: null,
    test: 'go test ./...',
    evidence: 'go.mod',
    confident: true,
  };
}

function python(dir) {
  const pyproject = read(dir, 'pyproject.toml') ?? '';
  const markers = ['pyproject.toml', 'setup.py', 'setup.cfg'].filter((name) => exists(dir, name));
  if (markers.length === 0) return null;
  const venv = ['.venv', 'venv'].find((name) => exists(dir, path.join(name, 'bin', 'python')));
  const interpreter = venv ? `${venv}/bin/python` : 'python3';
  const pytest = /^\[tool\.pytest/m.test(pyproject)
    || exists(dir, 'pytest.ini')
    || exists(dir, 'conftest.py')
    || /^\[(tool:)?pytest\]/m.test(read(dir, 'setup.cfg') ?? '')
    || /^\[pytest\]/m.test(read(dir, 'tox.ini') ?? '');
  return {
    ecosystem: 'python',
    build: null,
    test: pytest ? `${interpreter} -m pytest` : `${interpreter} -m unittest`,
    evidence: [...markers, ...(venv ? [venv] : []), pytest ? 'pytest configuration' : 'no pytest configuration'].join(', '),
    confident: pytest && Boolean(venv),
  };
}

function make(dir) {
  const text = read(dir, 'Makefile') ?? read(dir, 'makefile');
  if (text === null || !/^test:/m.test(text)) return null;
  return {
    ecosystem: 'make',
    build: /^all:/m.test(text) ? 'make' : null,
    test: 'make test',
    evidence: 'Makefile with a test target',
    confident: true,
  };
}

export function detect(dir) {
  const candidates = [node, rust, go, python, make].map((rule) => rule(dir)).filter(Boolean);
  if (candidates.length === 0) return { found: null, candidates, confirm: true };
  return {
    found: candidates[0],
    candidates,
    confirm: candidates.length > 1 || !candidates[0].confident,
  };
}
