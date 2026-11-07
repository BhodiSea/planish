// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { excludeLessons, writeLesson } = require('../../src/stable/extensions/planish-learn/src/lessons/store.js');
const sample = require('./lesson.json');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function repository() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'planish-learn-')));
  git(dir, 'init', '--quiet');
  return dir;
}

test('a lesson is written to .planish/, which git ignores through info/exclude only', async () => {
  const dir = repository();
  const file = await writeLesson(dir, sample);
  assert.equal(file, path.join(dir, '.planish', 'lessons', 'softmax.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), sample);
  assert.equal(git(dir, 'status', '--porcelain', '--ignored'), '!! .planish/\n');
  assert.match(git(dir, 'check-ignore', '-v', '.planish/lessons/softmax.json'), /^\.git\/info\/exclude:[0-9]+:\/\.planish\/\t/);
  assert.ok(!fs.existsSync(path.join(dir, '.gitignore')));

  await writeLesson(dir, sample);
  assert.equal(fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8').split('\n').filter(line => line === '/.planish/').length, 1);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.planish', 'lessons')), ['softmax.json']);
});

test("a project in a repository's subfolder is excluded by its own path", async () => {
  const dir = repository();
  const project = path.join(dir, 'a [b]');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(dir, '.git', 'info', 'exclude'), '# kept\n*.log');
  await writeLesson(project, sample);
  assert.equal(fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8'), '# kept\n*.log\n/a \\[b\\]/.planish/\n');
  assert.equal(git(dir, 'status', '--porcelain'), '');
});

test('a folder outside git still gets its lessons', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planish-learn-'));
  assert.equal(await excludeLessons(dir), undefined);
  assert.ok(fs.existsSync(await writeLesson(dir, sample)));
});

test('an invalid lesson is refused, and nothing is written', async () => {
  const dir = repository();
  await assert.rejects(writeLesson(dir, { ...sample, parts: [] }), error => error.errors[0].pointer === '/parts');
  assert.ok(!fs.existsSync(path.join(dir, '.planish')));
});

test('a .planish that a repository made a link is refused', async () => {
  const dir = repository();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'planish-learn-'));
  fs.symlinkSync(elsewhere, path.join(dir, '.planish'));
  await assert.rejects(writeLesson(dir, sample), /is not a directory/);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
});
