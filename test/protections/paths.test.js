// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { isAscii, resolveTarget, shortPath } = require('../../src/stable/extensions/planish-protections/src/paths.js');
const { tempRoot } = require('../../src/stable/extensions/planish-protections/src/temp.js');

const windows = process.platform === 'win32';
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'protections-')));

// A folder with a non-ASCII name, as a user's profile folder can have, and its short name,
// which the test sets where the drive did not make one.
function nonAscii() {
  const folder = path.join(base, 'Jürgen Öztürk');
  fs.mkdirSync(folder, { recursive: true });
  let short = shortPath(folder);
  if (!short) {
    execFileSync('fsutil', ['file', 'setshortname', folder, 'JURGEN~1']);
    short = shortPath(folder);
  }
  return { folder, short };
}

test('ASCII is printable ASCII only', () => {
  assert.ok(isAscii('C:\\Users\\runner\\AppData\\Local\\Temp'));
  assert.ok(!isAscii('C:\\Users\\Jürgen'));
  assert.ok(!isAscii('a\tb'));
});

test('a target resolves through links, and its missing part is kept', () => {
  fs.mkdirSync(path.join(base, 'real'), { recursive: true });
  fs.symlinkSync(path.join(base, 'real'), path.join(base, 'link'), windows ? 'junction' : 'dir');
  assert.equal(resolveTarget(path.join(base, 'link', 'not', 'there')), path.join(base, 'real', 'not', 'there'));
  assert.equal(resolveTarget(path.join(base, 'link', '..', 'real')), path.join(base, 'real'));
});

test('short names resolve to the long name', { skip: !windows }, () => {
  const { folder, short } = nonAscii();
  assert.ok(short && isAscii(short), `no short name for ${folder}`);
  assert.equal(resolveTarget(short), folder);
  assert.equal(resolveTarget(path.join(short, 'missing.txt')), path.join(folder, 'missing.txt'));
});

test('a non-ASCII temp folder gives an ASCII root, through its short name', { skip: !windows }, () => {
  const { folder, short } = nonAscii();
  const { root, ascii } = tempRoot(folder);
  assert.ok(ascii);
  assert.equal(root, path.join(short, 'planish'));
  assert.equal(resolveTarget(root), path.join(folder, 'planish'));
});

test('there is no short name off Windows', { skip: windows }, () => {
  assert.equal(shortPath(base), undefined);
});

test('with no ASCII form, the root is the user\'s own folder in PlanishTemp', { skip: !windows }, () => {
  // shortPath gives no short name for a path holding %, as for a drive with short names off.
  const folder = path.join(base, 'Jürgen%');
  fs.mkdirSync(folder, { recursive: true });
  const drive = path.join(base, 'drive');
  const { root, ascii } = tempRoot(folder, drive);
  assert.ok(ascii);
  assert.match(root, /\\PlanishTemp\\S-1-[0-9-]+$/);
  assert.equal(path.dirname(path.dirname(root)), drive);
  const entries = execFileSync('icacls', [root], { encoding: 'utf8' }).split(/\r?\n/).filter(line => /:\(/.test(line));
  assert.equal(entries.length, 1, entries.join('; '));
  assert.equal(tempRoot(folder, drive).root, root);
});
