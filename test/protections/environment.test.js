// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { sessionEnvironment } = require('../../src/stable/extensions/planish-protections/src/environment.js');

const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'protections-')));
const env = { ...process.env, ...sessionEnvironment({ id: '0123abcd', folder }) };
delete env.GIT_ASKPASS;
delete env.SSH_ASKPASS;

test('a program started in the session sees its marker and temp folder', () => {
  const seen = execFileSync(process.execPath, ['-p', 'JSON.stringify([process.env.PLANISH_SESSION, require("os").tmpdir()])'], { env, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(seen), ['0123abcd', folder]);
});

test('git uses no pager', () => {
  assert.equal(execFileSync('git', ['var', 'GIT_PAGER'], { env, encoding: 'utf8' }).trim(), 'cat');
});

test('git fails at once rather than ask for a password', () => {
  const started = Date.now();
  // A local server asking for a password: git would prompt on a terminal, and here must not.
  const http = require('node:http');
  const server = http.createServer((request, response) => {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"' });
    response.end();
  });
  return new Promise((resolve, reject) => server.listen(0, '127.0.0.1', () => {
    const { execFile } = require('node:child_process');
    execFile('git', ['ls-remote', `http://127.0.0.1:${server.address().port}/repo.git`],
      { env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull }, timeout: 20_000 }, (error, stdout, stderr) => {
        server.close();
        try {
          assert.ok(error, 'git ls-remote succeeded');
          assert.notEqual(error.killed, true, 'git waited for input');
          assert.match(stderr, /terminal prompts disabled|could not read Username/);
          assert.ok(Date.now() - started < 20_000);
          resolve();
        } catch (failure) {
          reject(failure);
        }
      });
  }));
});
