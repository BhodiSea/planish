// SPDX-License-Identifier: Apache-2.0
// On Windows, where no ASCII temp folder exists: <drive>\PlanishTemp\<user SID>, owned by the
// user and open to that user alone. Other accounts may only make their own folders beside it.
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const SYSTEM = 'S-1-5-18';
const ADMINISTRATORS = 'S-1-5-32-544';
const AUTHENTICATED_USERS = 'S-1-5-11';
const FULL_CONTROL = 0x1f01ff;
// List the folder, traverse it, read its attributes and list, and make folders in it.
const MAKE_FOLDERS = 0x1200a5;
const CONTAINER_AND_OBJECT = 3;

// PlanishTemp's list, set where the user may and its owner is trusted: SYSTEM and Administrators in full, and
// Authenticated Users MAKE_FOLDERS on this folder alone, so none can delete what others make.
const PARENT_DACL = `D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;;0x${MAKE_FOLDERS.toString(16)};;;AU)`;

// Run by Windows PowerShell: makes both folders, sets the parent's list where it may,
// makes the user the owner of their folder with one protected entry, and reports both as SIDs.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
$T = [System.Security.Principal.SecurityIdentifier]
$user = New-Object System.Security.Principal.SecurityIdentifier $env:PLANISH_SID
$sections = [System.Security.AccessControl.AccessControlSections]'Owner, Access'
function Report($dir) {
  $acl = $dir.GetAccessControl($sections)
  @{ owner = $acl.GetOwner($T).Value; protected = $acl.AreAccessRulesProtected;
    link = [bool]($dir.Attributes -band [IO.FileAttributes]::ReparsePoint);
    rules = @($acl.GetAccessRules($true, $true, $T) | ForEach-Object { @{ id = $_.IdentityReference.Value;
      allow = ($_.AccessControlType -eq 'Allow'); rights = [int]$_.FileSystemRights; inherit = [int]$_.InheritanceFlags } }) }
}
$parent = New-Object IO.DirectoryInfo $env:PLANISH_PARENT
if (-not $parent.Exists) { $parent.Create() }
$acl = $parent.GetAccessControl($sections)
$owner = $acl.GetOwner($T).Value
if (@($env:PLANISH_SID, 'S-1-5-18', 'S-1-5-32-544') -contains $owner -and -not ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  try {
    $acl.SetSecurityDescriptorSddlForm($env:PLANISH_PARENT_DACL, 'Access')
    $parent.SetAccessControl($acl)
  } catch {}
}
$folder = New-Object IO.DirectoryInfo $env:PLANISH_FOLDER
if (-not $folder.Exists) { $folder.Create() }
if (-not ($folder.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  $acl = $folder.GetAccessControl($sections)
  $acl.SetOwner($user)
  $acl.SetSecurityDescriptorSddlForm("D:P(A;OICI;FA;;;$($env:PLANISH_SID))", 'Access')
  $folder.SetAccessControl($acl)
}
@{ parent = Report $parent; folder = Report $folder } | ConvertTo-Json -Depth 4 -Compress
`;

// Why a report of the two folders falls short of "that user only", or undefined when it does not.
function refusal({ parent, folder }, sid) {
  const trusted = id => [sid, SYSTEM, ADMINISTRATORS].includes(id);
  if (parent.link || folder.link) {
    return 'one of the folders is a link';
  }
  if (!trusted(parent.owner)) {
    return `PlanishTemp is owned by ${parent.owner}`;
  }
  // Others may make folders in PlanishTemp, but not delete, rename, write or change anything in it.
  const open = (parent.rules || []).find(rule => rule.allow && !trusted(rule.id)
    && ((rule.rights & ~MAKE_FOLDERS) !== 0 || rule.inherit !== 0));
  if (open) {
    return `PlanishTemp gives ${open.id} rights 0x${(open.rights >>> 0).toString(16)}`;
  }
  const rules = folder.rules || [];
  const [rule] = rules;
  if (folder.owner !== sid || !folder.protected || rules.length !== 1 || rule.id !== sid || !rule.allow
    || rule.rights !== FULL_CONTROL || rule.inherit !== CONTAINER_AND_OBJECT) {
    return `the user's folder is not theirs alone: ${JSON.stringify(folder)}`;
  }
  return undefined;
}

function userFolder(parent) {
  const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true })
    .trim().split(',').pop().replace(/"/g, '');
  if (!/^S-1-[0-9-]+$/.test(sid)) {
    throw new Error(`whoami gave no SID: ${sid}`);
  }
  const folder = path.join(parent, sid);
  // Without PSModulePath, which PowerShell 7 sets for its own modules, Windows PowerShell finds its own.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const report = JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    encoding: 'utf8', windowsHide: true,
    env: { ...env, PLANISH_PARENT: parent, PLANISH_FOLDER: folder, PLANISH_SID: sid, PLANISH_PARENT_DACL: PARENT_DACL },
  }));
  const reason = refusal(report, sid);
  if (reason) {
    throw new Error(`${folder} is refused: ${reason}`);
  }
  return folder;
}

module.exports = { FULL_CONTROL, MAKE_FOLDERS, refusal, userFolder };
