// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { MARKER, createSession, measure, release, sweep, tempRoot } = require('../../src/stable/extensions/planish-protections/src/temp.js');

const base = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'protections-')));

function write(file, text = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('the root is under the temp folder, ASCII, and on Unix the user\'s alone', () => {
  const { root, ascii } = tempRoot(base());
  assert.ok(ascii);
  assert.ok(fs.statSync(root).isDirectory());
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(root).mode & 0o777, 0o700);
  }
});

test('a root another user could write to is refused', { skip: process.platform === 'win32' }, () => {
  const dir = base();
  fs.mkdirSync(path.join(dir, `planish-${os.userInfo().uid}`), { mode: 0o777 });
  fs.chmodSync(path.join(dir, `planish-${os.userInfo().uid}`), 0o777);
  assert.throws(() => tempRoot(dir), /not a folder only this user can open/);
});

test('a root that is a link is refused', { skip: process.platform === 'win32' }, () => {
  const dir = base();
  fs.mkdirSync(path.join(dir, 'elsewhere'), { mode: 0o700 });
  fs.symlinkSync(path.join(dir, 'elsewhere'), path.join(dir, `planish-${os.userInfo().uid}`));
  assert.throws(() => tempRoot(dir), /not a folder only this user can open/);
});

test('a session folder is short, marked and measured', async () => {
  const { root } = tempRoot(base());
  const { id, folder } = createSession(root);
  assert.match(id, /^[0-9a-f]{8}$/);
  assert.equal(folder, path.join(root, id));
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, MARKER), 'utf8')).pid, process.pid);
  write(path.join(folder, 'a', 'b'), 'x'.repeat(1000));
  write(path.join(folder, 'c'), 'x'.repeat(24));
  assert.equal(await measure(folder), 1024 + fs.statSync(path.join(folder, MARKER)).size);
});

test('release deletes a folder holding no work', async () => {
  const { root } = tempRoot(base());
  const { folder } = createSession(root);
  write(path.join(folder, 'node_modules', 'x', 'index.js'));
  write(path.join(folder, 'cache', 'CACHEDIR.TAG'));
  write(path.join(folder, 'cache', 'notes.md'));
  write(path.join(folder, 'out', 'a.o'));
  write(path.join(folder, 'tmp123'));
  assert.deepEqual(await release(folder), { work: 0, left: 0 });
  assert.ok(!fs.existsSync(folder));
});

test('release keeps work and marks the folder as kept', async () => {
  const { root } = tempRoot(base());
  const { folder } = createSession(root);
  write(path.join(folder, 'project', '.git', 'HEAD'));
  write(path.join(folder, 'project', 'big.bin'));
  write(path.join(folder, 'scratch', 'analysis.py'));
  write(path.join(folder, 'scratch', 'out.log'));
  write(path.join(folder, 'Report.DOCX'));
  write(path.join(folder, 'core.dump'));
  assert.deepEqual(await release(folder), { work: 3, left: 0 });
  assert.ok(fs.existsSync(path.join(folder, 'project', 'big.bin')));
  assert.ok(fs.existsSync(path.join(folder, 'scratch', 'analysis.py')));
  assert.ok(fs.existsSync(path.join(folder, 'Report.DOCX')));
  assert.ok(!fs.existsSync(path.join(folder, 'scratch', 'out.log')));
  assert.ok(!fs.existsSync(path.join(folder, 'core.dump')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, MARKER), 'utf8')), { kept: true });
});

test('release removes a link, never what it points to', async () => {
  const outside = base();
  write(path.join(outside, 'precious.bin'));
  const { root } = tempRoot(base());
  const { folder } = createSession(root);
  fs.symlinkSync(outside, path.join(folder, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await release(folder);
  assert.ok(fs.existsSync(path.join(outside, 'precious.bin')));
  assert.ok(!fs.existsSync(folder));
});

test('sweep releases the folders of ended sessions only, and reports kept work once', async () => {
  const { root } = tempRoot(base());
  const live = createSession(root);
  write(path.join(live.folder, 'tmp1'));

  const ended = createSession(root);
  write(path.join(ended.folder, 'tmp2'));
  const child = spawn(process.execPath, ['-e', '']);
  await new Promise(resolve => child.on('exit', resolve));
  fs.writeFileSync(path.join(ended.folder, MARKER), JSON.stringify({ pid: child.pid }));

  const working = createSession(root);
  write(path.join(working.folder, 'draft.md'));
  fs.writeFileSync(path.join(working.folder, MARKER), JSON.stringify({ pid: child.pid }));

  const kept = createSession(root);
  write(path.join(kept.folder, 'paper.tex'));
  await release(kept.folder);

  fs.mkdirSync(path.join(root, 'unmarked'));
  write(path.join(root, 'unmarked', 'tmp3'));

  assert.deepEqual((await sweep(root)).sort(), [working.folder, kept.folder].sort());
  assert.ok(fs.existsSync(path.join(live.folder, 'tmp1')));
  assert.ok(!fs.existsSync(ended.folder));
  assert.ok(fs.existsSync(path.join(working.folder, 'draft.md')));
  assert.ok(!fs.existsSync(path.join(working.folder, MARKER)));
  assert.ok(fs.existsSync(path.join(root, 'unmarked', 'tmp3')));
  assert.deepEqual(await sweep(root), []);
});
