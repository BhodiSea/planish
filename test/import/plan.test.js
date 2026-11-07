// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const EXTENSION = '../../src/stable/extensions/planish-import';
const { plan, report, toLookUp } = require(`${EXTENSION}/src/plan.js`);
const STAND_INS = require(`${EXTENSION}/stand-ins.json`);
const PRODUCT = require('../../patches/user/json/product.json');

const on = (id, verified = true) => [id.toLowerCase(), { id, displayName: id.split('.')[1], verified }];

test('the stand-ins table lists lowercase IDs, each once', () => {
  const ids = STAND_INS.flatMap(row => [...row.ids, ...row.standIns]);
  assert.deepEqual(ids, ids.map(id => id.toLowerCase()));
  assert.equal(new Set(ids).size, ids.length);
});

test('product.json recommends, for each file type, the stand-ins the table gives it, and nothing else', () => {
  const expected = Object.fromEntries(STAND_INS.filter(row => row.languages)
    .flatMap(row => row.standIns.map(id => [id, { onFileOpen: [{ languages: row.languages, important: true }] }])));
  assert.deepEqual(PRODUCT.extensionRecommendations, expected);
  assert.ok(expected['detachhead.basedpyright'] && expected['llvm-vs-code-extensions.vscode-clangd']);
});

const profiles = [
  { name: 'Default', isDefault: true, extensions: ['EditorConfig.EditorConfig', 'ms-python.vscode-pylance', 'anysphere.cursorpyright', 'GitHub.copilot'] },
  { name: 'C', isDefault: false, extensions: ['ms-vscode.cpptools', 'vadimcn.vscode-lldb'] },
];

test('looks up each extension and the stand-ins for Microsoft\'s, not Microsoft\'s own', () => {
  assert.deepEqual(toLookUp(profiles, STAND_INS).sort(), [
    'anthropic.claude-code', 'anysphere.cursorpyright', 'detachhead.basedpyright', 'editorconfig.editorconfig',
    'llvm-vs-code-extensions.vscode-clangd', 'openai.chatgpt', 'vadimcn.vscode-lldb',
  ]);
});

test('offers what Open VSX holds, and only verified stand-ins', () => {
  const found = new Map([on('EditorConfig.EditorConfig'), on('detachhead.basedpyright'), on('anthropic.claude-code'),
    on('openai.chatgpt', false), on('llvm-vs-code-extensions.vscode-clangd'), on('vadimcn.vscode-lldb')]);
  const [defaults, c] = plan(profiles, found, STAND_INS);
  assert.deepEqual(defaults.install.map(e => e.id), ['EditorConfig.EditorConfig']);
  assert.deepEqual(defaults.standIns.map(e => [e.id, e.for]), [['detachhead.basedpyright', 'Pylance'], ['anthropic.claude-code', 'Copilot']]);
  assert.deepEqual(defaults.missing, [
    { id: 'ms-python.vscode-pylance', microsoft: 'Pylance', standIns: ['basedpyright'] },
    { id: 'anysphere.cursorpyright' },
    { id: 'GitHub.copilot', microsoft: 'Copilot', standIns: ['claude-code'] },
  ]);
  // A stand-in the profile already has is installed, not offered again.
  assert.deepEqual(c.install.map(e => e.id), ['vadimcn.vscode-lldb']);
  assert.deepEqual(c.standIns.map(e => e.id), ['llvm-vs-code-extensions.vscode-clangd']);
});

test('the report lists what was not carried over, and why', () => {
  const text = report('VS Code', [
    { name: 'Planish', isDefault: true, created: true, installed: ['EditorConfig.EditorConfig'], left: ['a.b'], failed: ['c.d'], mcp: true,
      missing: [{ id: 'ms-python.vscode-pylance', microsoft: 'Pylance', standIns: ['basedpyright'] }, { id: 'ms-vscode.vscode-speech', microsoft: 'VS Code Speech', standIns: [] }, { id: 'x.y' }] },
    { name: 'C', isDefault: false, created: false },
  ]);
  for (const line of [
    '# Imported from VS Code',
    '## Default profile, into Planish',
    'Settings, keyboard shortcuts, tasks and snippets came over.',
    'Extensions installed: EditorConfig.EditorConfig.',
    '- ms-python.vscode-pylance: Pylance is licensed only for Microsoft\'s products. Open stand-in: basedpyright.',
    '- ms-vscode.vscode-speech: VS Code Speech is licensed only for Microsoft\'s products. There is no open stand-in.',
    '- x.y: not on Open VSX.',
    '- a.b: left out of the list.',
    '- c.d: did not install.',
    '- MCP servers (mcp.json): not imported.',
    '## Profile C',
    'Not created.',
  ]) {
    assert.ok(text.split('\n').includes(line), `missing: ${line}\n${text}`);
  }
});
