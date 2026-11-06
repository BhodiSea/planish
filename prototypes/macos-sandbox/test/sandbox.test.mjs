// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { cloneTree, fileSystem, runInSandbox } from '../sandbox.mjs';

const macos = process.platform === 'darwin';
const node = JSON.stringify(process.execPath);

describe('the sandbox', { skip: !macos && 'Seatbelt and APFS are macOS only' }, () => {
  let source;
  let outside;
  let server;
  let port;

  before(async () => {
    source = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'planish-source-'));
    fs.writeFileSync(path.join(source, 'kept.txt'), 'original\n');
    outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'planish-outside-'));
    server = net.createServer((socket) => socket.on('error', () => {}).end('reached\n'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(() => {
    server.close();
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  const sandboxed = (command, options = {}) => runInSandbox({ source, command, timeoutMs: 30_000, ...options });
  const connect = (host, p) => `${node} -e 'require("net").connect(${p}, "${host}").on("connect", () => { console.log("connected"); process.exit(0) }).on("error", (e) => { console.log(e.code); process.exit(1) })'`;

  test('the clone is on APFS and is deleted afterwards', async () => {
    const result = await sandboxed('/bin/pwd');
    assert.equal(result.code, 0, result.stderr);
    assert.equal(await fileSystem(path.dirname(result.runDir)), 'apfs');
    assert.equal(result.stdout.trim(), path.join(result.runDir, 'tree'));
    assert.equal(fs.existsSync(result.runDir), false);
  });

  test('cloning a large file takes almost no space', () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'planish-large-'));
    try {
      fs.mkdirSync(path.join(dir, 'a'));
      const big = Buffer.alloc(1024 * 1024, 7);
      const fd = fs.openSync(path.join(dir, 'a', 'big'), 'w');
      for (let i = 0; i < 1024; i++) fs.writeSync(fd, big);
      fs.closeSync(fd);
      const free = () => fs.statfsSync(dir).bavail * fs.statfsSync(dir).bsize;
      const before = free();
      cloneTree(path.join(dir, 'a'), path.join(dir, 'b'));
      const used = before - free();
      assert.equal(fs.statSync(path.join(dir, 'b', 'big')).size, 1024 * 1024 * 1024);
      assert.ok(used < 256 * 1024 * 1024, `cloning 1 GB used ${Math.round(used / 1048576)} MB`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('writes reach the clone and not the working tree', async () => {
    const result = await sandboxed('echo changed > kept.txt && echo new > added.txt && cat kept.txt');
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, 'changed\n');
    assert.equal(fs.readFileSync(path.join(source, 'kept.txt'), 'utf8'), 'original\n');
    assert.equal(fs.existsSync(path.join(source, 'added.txt')), false);
  });

  for (const [name, target] of [
    ['the working tree', () => path.join(source, 'kept.txt')],
    ['another temporary folder', () => path.join(outside, 'file')],
    ['/tmp', () => `/tmp/planish-escape-${process.pid}`],
    ['the home folder', () => path.join(os.homedir(), `planish-escape-${process.pid}`)],
  ]) {
    test(`writes to ${name} are refused`, async () => {
      const file = target();
      const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      const result = await sandboxed(`echo escaped > '${file}'`);
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /Operation not permitted/);
      assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, before);
    });
  }

  test('a hard link to a file outside cannot be written through', async () => {
    fs.writeFileSync(path.join(outside, 'linked'), 'original\n');
    for (const file of [path.join(source, 'kept.txt'), path.join(outside, 'linked')]) {
      const result = await sandboxed(`ln '${file}' hard; echo changed > hard`);
      assert.match(result.stderr, /ln: hard: Operation not permitted/);
      assert.equal(fs.readFileSync(file, 'utf8'), 'original\n');
    }
  });

  test('a symbolic link to a file outside cannot be written through', async () => {
    fs.writeFileSync(path.join(outside, 'target'), 'original\n');
    const result = await sandboxed(`ln -s '${path.join(outside, 'target')}' link && echo changed > link`);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Operation not permitted/);
    assert.equal(fs.readFileSync(path.join(outside, 'target'), 'utf8'), 'original\n');
  });

  test('credentials in the home folder cannot be read', async () => {
    const dir = path.join(os.homedir(), '.ssh');
    const existed = fs.existsSync(dir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `planish-test-${process.pid}`);
    fs.writeFileSync(file, 'secret\n');
    try {
      const baseline = await sandboxed(`cat '${file}'`, { sandbox: false });
      assert.equal(baseline.stdout, 'secret\n');
      const result = await sandboxed(`cat '${file}'; ls '${dir}'`);
      assert.doesNotMatch(result.stdout, /secret|planish-test/);
      assert.match(result.stderr, /Operation not permitted/);
    } finally {
      fs.rmSync(file);
      if (!existed) fs.rmdirSync(dir);
    }
  });

  test('the same write succeeds without the sandbox, so the refusal is the sandbox\'s', async () => {
    const file = path.join(outside, 'baseline');
    const result = await sandboxed(`echo escaped > '${file}'`, { sandbox: false });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(fs.readFileSync(file, 'utf8'), 'escaped\n');
  });

  test('there is no network, not even loopback', async () => {
    const local = await sandboxed(connect('127.0.0.1', port));
    assert.equal(local.code, 1);
    assert.equal(local.stdout.trim(), 'EPERM');
    const remote = await sandboxed(connect('1.1.1.1', 443));
    assert.equal(remote.code, 1);
    assert.equal(remote.stdout.trim(), 'EPERM');
    const dns = await sandboxed(`${node} -e 'require("dns").lookup("example.com", (e) => { console.log(e ? "failed" : "resolved") })'`);
    assert.equal(dns.stdout.trim(), 'failed');
    const udp = await sandboxed(`${node} -e 'const s = require("dgram").createSocket("udp4"); s.on("error", (e) => { console.log(e.code); process.exit() }); s.send("x", 53, "1.1.1.1", (e) => { console.log(e ? e.code : "sent"); process.exit() })'`);
    assert.equal(udp.stdout.trim(), 'EPERM', udp.stderr);
  });

  test('loopback mode reaches loopback only', async () => {
    const local = await sandboxed(connect('127.0.0.1', port), { network: 'loopback' });
    assert.equal(local.stdout.trim(), 'connected', local.stderr);
    const remote = await sandboxed(connect('1.1.1.1', 443), { network: 'loopback' });
    assert.equal(remote.stdout.trim(), 'EPERM');
  });

  test('the connection succeeds without the sandbox', async () => {
    const result = await sandboxed(connect('127.0.0.1', port), { sandbox: false });
    assert.equal(result.stdout.trim(), 'connected', result.stderr);
  });

  // Without the sandbox, open would start the runner's browser, so this test
  // checks Launch Services' refusal instead of comparing with a baseline.
  test('a URL cannot be handed to another app', async () => {
    const result = await sandboxed('/usr/bin/open https://example.com');
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /No application knows how to open URL/);
  });

  test('secrets in Planish\'s environment do not reach the project', async () => {
    process.env.PLANISH_TEST_SECRET = 'secret';
    try {
      const result = await sandboxed('env');
      assert.doesNotMatch(result.stdout, /PLANISH_TEST_SECRET/);
    } finally {
      delete process.env.PLANISH_TEST_SECRET;
    }
  });

  test('a run stops at its time limit, with its background processes', async () => {
    const result = await sandboxed('sleep 60 & echo $!; wait', { timeoutMs: 1500 });
    assert.equal(result.reason, 'time');
    assert.ok(result.durationMs < 10_000);
    const pid = Number(result.stdout.trim());
    assert.ok(pid > 0);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  });

  const escape = (token, prefix = '') => `${prefix}/usr/bin/perl -MPOSIX -e 'fork and exit; setsid; fork and exit; sleep 600' ${token}`;
  const running = (token) => execFileSync('/bin/ps', ['-A', '-ww', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter((line) => line.includes(token));

  test('a process that leaves the process group through setsid is stopped too', async () => {
    const token = `planish-escape-${randomUUID()}`;
    const result = await sandboxed(escape(token));
    assert.equal(result.code, 0, result.stderr);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.deepEqual(running(token), []);
  });

  test('a process that leaves the group and clears its environment escapes, a known limit', async () => {
    const token = `planish-escape-${randomUUID()}`;
    await sandboxed(escape(token, '/usr/bin/env -i '));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const left = running(token);
    for (const line of left) process.kill(Number(line.trim().split(/\s+/)[0]), 'SIGKILL');
    assert.equal(left.length, 1);
  });

  test('a run stops at its memory limit', async () => {
    const grow = `${node} -e 'const keep = []; setInterval(() => { keep.push(Buffer.alloc(32 * 1024 * 1024, 1)) }, 20)'`;
    const result = await sandboxed(grow, { memoryMb: 256 });
    assert.equal(result.reason, 'memory');
    assert.ok(result.peakRssMb > 256);
    assert.ok(result.peakRssMb < 1024, `peak ${result.peakRssMb} MB`);
  });

  test('a child process\'s memory counts towards the limit', async () => {
    const grow = `${node} -e 'const keep = []; setInterval(() => { keep.push(Buffer.alloc(32 * 1024 * 1024, 1)) }, 20)'`;
    const result = await sandboxed(`/bin/sh -c ${JSON.stringify(grow)}`, { memoryMb: 256 });
    assert.equal(result.reason, 'memory');
  });

  test('a run that exits by itself is not stopped', async () => {
    const result = await sandboxed('exit 3');
    assert.equal(result.reason, 'exit');
    assert.equal(result.code, 3);
  });
});
