// SPDX-License-Identifier: Apache-2.0
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { FULL_CONTROL, MAKE_FOLDERS, refusal } = require('../../src/stable/extensions/planish-protections/src/userfolder.js');
const { tempRoot } = require('../../src/stable/extensions/planish-protections/src/temp.js');

const SID = 'S-1-5-21-1-2-3-1001';
const OTHER = 'S-1-5-21-1-2-3-1002';
const mine = { id: SID, allow: true, rights: FULL_CONTROL, inherit: 3 };
const good = () => ({
  parent: { owner: SID, protected: true, link: false, rules: [
    { id: 'S-1-5-18', allow: true, rights: FULL_CONTROL, inherit: 3 },
    { id: 'S-1-5-11', allow: true, rights: MAKE_FOLDERS, inherit: 0 },
  ] },
  folder: { owner: SID, protected: true, link: false, rules: [mine] },
});

test('the user\'s own folder, in a PlanishTemp others may only add folders to, passes', () => {
  assert.equal(refusal(good(), SID), undefined);
  const byAdministrators = good();
  byAdministrators.parent.owner = 'S-1-5-32-544';
  assert.equal(refusal(byAdministrators, SID), undefined);
});

test('a folder anyone else can reach is refused', () => {
  const cases = {
    'an extra entry': report => report.folder.rules.push({ id: OTHER, allow: true, rights: 0x1200a9, inherit: 3 }),
    'another principal': report => { report.folder.rules = [{ ...mine, id: 'S-1-1-0' }]; },
    'another owner': report => { report.folder.owner = OTHER; },
    'Administrators as owner': report => { report.folder.owner = 'S-1-5-32-544'; },
    'an inherited list': report => { report.folder.protected = false; },
    'less than full control': report => { report.folder.rules = [{ ...mine, rights: 0x1301bf }]; },
    'a link': report => { report.folder.link = true; },
    'PlanishTemp owned by another': report => { report.parent.owner = OTHER; },
    'PlanishTemp others can change': report => { report.parent.rules[1].rights = 0x1301bf; },
    'PlanishTemp passing folder rights down': report => { report.parent.rules[1].inherit = 3; },
  };
  for (const [name, change] of Object.entries(cases)) {
    const report = good();
    change(report);
    assert.ok(refusal(report, SID), `${name} passed`);
  }
});

test('with no ASCII form, the root is the user\'s own folder in PlanishTemp', { skip: process.platform !== 'win32' }, () => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'protections-')));
  // shortPath gives no short name for a path holding %, as for a drive with short names off.
  const folder = path.join(base, 'Jürgen%');
  fs.mkdirSync(folder);
  const drive = path.join(base, 'drive');
  const { root, ascii, error } = tempRoot(folder, drive);
  assert.equal(error, undefined);
  assert.ok(ascii);
  const sid = path.basename(root);
  assert.match(sid, /^S-1-[0-9-]+$/);
  assert.equal(path.dirname(root), path.join(drive, 'PlanishTemp'));

  const read = `$T = [System.Security.Principal.SecurityIdentifier]; $acl = Get-Acl -LiteralPath $env:FOLDER;
    $acl.GetOwner($T).Value; $acl.AreAccessRulesProtected; $acl.GetAccessRules($true, $true, $T) | ForEach-Object { $_.IdentityReference.Value }`;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));
  const lines = execFileSync('powershell.exe', ['-NoProfile', '-Command', read], { encoding: 'utf8', env: { ...env, FOLDER: root } })
    .trim().split(/\r?\n/);
  assert.deepEqual(lines, [sid, 'True', sid]);
  assert.equal(tempRoot(folder, drive).root, root);
});
