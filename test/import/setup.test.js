// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const EXTENSION = '../../src/stable/extensions/planish-import';
const { editors } = require(`${EXTENSION}/src/editors.js`);
const { readSetup } = require(`${EXTENSION}/src/setup.js`);

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
};

const entry = (id, version) => ({ identifier: { id }, version, relativeLocation: `${id.toLowerCase()}-${version}` });

test('each editor\'s folders on each platform', () => {
  const at = (platform, env, home) => Object.fromEntries(editors(platform, env, home).map(e => [e.id, [e.user, e.extensions]]));
  assert.deepEqual(at('darwin', {}, '/Users/a'), {
    vscode: ['/Users/a/Library/Application Support/Code/User', '/Users/a/.vscode/extensions'],
    cursor: ['/Users/a/Library/Application Support/Cursor/User', '/Users/a/.cursor/extensions'],
    antigravity: ['/Users/a/Library/Application Support/Antigravity/User', '/Users/a/.antigravity/extensions'],
  });
  assert.deepEqual(at('linux', {}, '/home/a').cursor, ['/home/a/.config/Cursor/User', '/home/a/.cursor/extensions']);
  assert.deepEqual(at('linux', { XDG_CONFIG_HOME: '/x' }, '/home/a').vscode, ['/x/Code/User', '/home/a/.vscode/extensions']);
  assert.deepEqual(at('win32', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'C:\\Users\\a').antigravity,
    ['C:\\Users\\a\\AppData\\Roaming\\Antigravity\\User', 'C:\\Users\\a\\.antigravity\\extensions']);
});

test('reads the default profile and the others, as VS Code keeps them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planish-import-'));
  const editor = { user: path.join(root, 'User'), extensions: path.join(root, 'extensions') };
  write(path.join(editor.user, 'settings.json'), '{ "editor.fontSize": 14 }');
  write(path.join(editor.user, 'keybindings.json'), '[]');
  write(path.join(editor.user, 'snippets', 'js.json'), '{}');
  write(path.join(editor.user, 'snippets', 'all.code-snippets'), '{ "a": {} }');
  write(path.join(editor.user, 'snippets', 'notes.txt'), 'not a snippets file');
  write(path.join(editor.user, 'mcp.json'), '{}');
  write(path.join(editor.extensions, 'extensions.json'), [entry('EditorConfig.EditorConfig', '0.18.2'), entry('ms-python.vscode-pylance', '1.0.0'), entry('old.one', '1.0.0')]);
  write(path.join(editor.extensions, '.obsolete'), { 'old.one-1.0.0': true });
  write(path.join(editor.user, 'globalStorage', 'storage.json'), {
    userDataProfiles: [
      { location: '-1a2b3c', name: 'Python' },
      { location: '4d5e6f', name: 'Shared', useDefaultFlags: { settings: true, extensions: true } },
    ],
  });
  const python = path.join(editor.user, 'profiles', '-1a2b3c');
  write(path.join(python, 'settings.json'), '{ "python.analysis.typeCheckingMode": "strict" }');
  write(path.join(python, 'tasks.json'), '{ "version": "2.0.0" }');
  write(path.join(python, 'extensions.json'), [entry('redhat.vscode-yaml', '1.0.0')]);
  write(path.join(editor.user, 'profiles', '4d5e6f', 'keybindings.json'), '[{ "key": "f1", "command": "-a" }]');

  const [defaults, profile, shared] = await readSetup(editor);
  assert.deepEqual(defaults, {
    name: 'Default', isDefault: true,
    settings: '{ "editor.fontSize": 14 }', keybindings: '[]', tasks: undefined,
    snippets: { 'all.code-snippets': '{ "a": {} }', 'js.json': '{}' },
    extensions: ['EditorConfig.EditorConfig', 'ms-python.vscode-pylance'],
    mcp: true,
  });
  assert.deepEqual(profile, {
    name: 'Python', isDefault: false,
    settings: '{ "python.analysis.typeCheckingMode": "strict" }', keybindings: undefined, tasks: '{ "version": "2.0.0" }',
    snippets: {}, extensions: ['redhat.vscode-yaml'], mcp: false,
  });
  assert.equal(shared.settings, defaults.settings);
  assert.deepEqual(shared.extensions, defaults.extensions);
  assert.equal(shared.keybindings, '[{ "key": "f1", "command": "-a" }]');
});

test('an editor with only an extensions folder has an empty default profile', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planish-import-'));
  const profiles = await readSetup({ user: path.join(root, 'User'), extensions: path.join(root, 'extensions') });
  assert.deepEqual(profiles, [{ name: 'Default', isDefault: true, settings: undefined, keybindings: undefined, tasks: undefined, snippets: {}, extensions: [], mcp: false }]);
});
