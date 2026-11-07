// SPDX-License-Identifier: Apache-2.0
// Paths as guards must see them. On Windows a path can be spelled with 8.3 short names, as
// C:\Users\JRGEN~1 for C:\Users\Jürgen, so a guard compares targets only after resolving them.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isAscii = text => /^[\x20-\x7e]*$/.test(text);

// Resolves a path to the one its target has: links and, on Windows, short names are resolved
// in the part that exists, and the rest is appended unchanged.
function resolveTarget(target) {
  let existing = path.resolve(target);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(existing), ...rest);
    } catch (error) {
      const parent = path.dirname(existing);
      if (error.code !== 'ENOENT' || parent === existing) {
        throw error;
      }
      rest.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

// The 8.3 short form of an existing folder on Windows, or undefined where it has none, since
// short names can be switched off for each drive.
function shortPath(folder) {
  if (process.platform !== 'win32' || /["%]/.test(folder)) {
    return undefined;
  }
  let short;
  try {
    short = execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"for %I in ("${folder}") do @echo %~sI"`],
      { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true }).trim();
  } catch {
    return undefined;
  }
  try {
    return isAscii(short) && resolveTarget(short) === resolveTarget(folder) ? short : undefined;
  } catch {
    return undefined;
  }
}

module.exports = { isAscii, resolveTarget, shortPath };
