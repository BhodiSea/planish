// SPDX-License-Identifier: Apache-2.0
'use strict';

const path = require('node:path');

// Each editor keeps VS Code's layout under its own names: a User folder, holding settings.json,
// keybindings.json, tasks.json, snippets/ and profiles/, and an extensions folder in the home folder.
const EDITORS = [
  { id: 'vscode', name: 'VS Code', folder: 'Code', extensions: '.vscode' },
  { id: 'cursor', name: 'Cursor', folder: 'Cursor', extensions: '.cursor' },
  { id: 'antigravity', name: 'Antigravity', folder: 'Antigravity', extensions: '.antigravity' },
];

// Where each editor keeps its setup on this platform, as VS Code chooses its own folders.
function editors(platform, env, home) {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  const config = {
    darwin: join(home, 'Library', 'Application Support'),
    win32: env.APPDATA || join(home, 'AppData', 'Roaming'),
  }[platform] || env.XDG_CONFIG_HOME || join(home, '.config');
  return EDITORS.map(({ id, name, folder, extensions }) => ({
    id,
    name,
    user: join(config, folder, 'User'),
    extensions: join(home, extensions, 'extensions'),
  }));
}

module.exports = { editors };
