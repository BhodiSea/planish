// SPDX-License-Identifier: Apache-2.0
// Stores lessons in .planish/ at the project's root, which it lists in git's info/exclude:
// that file is never committed or shared, and the user's .gitignore stays untouched.
'use strict';

const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { formatErrors, validateLesson } = require('./validate');

const FOLDER = '.planish';

/** Escapes a path for a gitignore pattern. */
function escapeIgnore(text) {
  return text.replace(/[\\*?[\]]/g, '\\$&').replace(/^[#!]/, '\\$&').replace(/ $/, '\\ ');
}

// Lists .planish/ in the info/exclude file of the git repository that holds folder, and
// returns that file's path, or undefined when folder is not in a repository.
async function excludeLessons(folder, git = 'git') {
  let stdout;
  try {
    ({ stdout } = await promisify(execFile)(git, ['rev-parse', '--show-prefix', '--path-format=absolute', '--git-path', 'info/exclude'], { cwd: folder }));
  } catch {
    return undefined;
  }
  const [prefix, file] = stdout.replace(/\r?\n$/, '').split(/\r?\n/);
  const pattern = `/${escapeIgnore(prefix)}${FOLDER}/`;
  const text = await fs.readFile(file, 'utf8').catch(error => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  if (!text.split(/\r?\n/).includes(pattern)) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${text && !text.endsWith('\n') ? '\n' : ''}${pattern}\n`);
  }
  return file;
}

/** Makes folder/name a directory, refusing a symbolic link or file a repository put there. */
async function directory(parent, name) {
  const dir = path.join(parent, name);
  try {
    await fs.mkdir(dir);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  if (!(await fs.lstat(dir)).isDirectory()) {
    throw new Error(`${dir} is not a directory`);
  }
  return dir;
}

// Validates lesson and writes it to .planish/lessons/<id>.json in folder, the project's
// root, after listing .planish/ in git's info/exclude. Throws, writing nothing, if it fails.
async function writeLesson(folder, lesson, git = 'git') {
  const errors = validateLesson(lesson);
  if (errors.length) {
    throw Object.assign(new Error(`The lesson is not valid:\n${formatErrors(errors)}`), { errors });
  }
  await excludeLessons(folder, git);
  const dir = await directory(await directory(folder, FOLDER), 'lessons');
  const file = path.join(dir, `${lesson.id}.json`);
  const temporary = path.join(dir, `.${lesson.id}.${process.pid}.tmp`);
  await fs.writeFile(temporary, `${JSON.stringify(lesson, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, file);
  return file;
}

module.exports = { excludeLessons, writeLesson };
