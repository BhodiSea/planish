// SPDX-License-Identifier: Apache-2.0
// Each session's temp folder: short, ASCII, measured, and deleted when the session ends, except
// for anything that looks like work. Planish touches only folders holding its marker file.
'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { isAscii, shortPath } = require('./paths');

const MARKER = '.planish-session';

// Folders whose contents are downloads, caches or build output, deleted whatever they hold.
const REGENERABLE = new Set(['node_modules', '__pycache__', '.cache', '.npm', '.pnpm-store', '.yarn', '.venv', 'venv',
  'site-packages', '.gradle', '.m2', 'go-build', '.next', '.turbo']);

// Files kept as work: source, notebooks, documents and data a person might have made.
const WORK = new Set(['.c', '.cc', '.cpp', '.cs', '.css', '.csv', '.dart', '.doc', '.docx', '.go', '.h', '.hpp', '.html',
  '.ipynb', '.java', '.js', '.jsx', '.kt', '.lua', '.m', '.md', '.mjs', '.odt', '.pdf', '.php', '.pptx', '.py', '.r',
  '.rb', '.rs', '.scss', '.sql', '.svelte', '.swift', '.tex', '.ts', '.tsx', '.txt', '.typ', '.vue', '.xlsx', '.zig']);

// The folder that holds the sessions' folders: under the system's temp folder, in a form with
// only ASCII characters. On Windows, where neither it nor its short name is ASCII, it is
// <drive>\PlanishTemp\<user SID>, which only the user may open.
function tempRoot(base = os.tmpdir(), drive = process.env.SystemDrive || 'C:') {
  if (process.platform === 'win32') {
    const short = isAscii(base) ? base : shortPath(base);
    const root = short ? path.join(short, 'planish') : userFolder(path.join(`${drive}\\`, 'PlanishTemp'));
    fs.mkdirSync(root, { recursive: true });
    return { root, ascii: isAscii(root) };
  }
  // A temp folder can be shared, as /tmp is, so the root is the user's own and no one else's.
  const { uid } = os.userInfo();
  const root = path.join(base, `planish-${uid}`);
  try {
    fs.mkdirSync(root, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o077) !== 0) {
    throw new Error(`${root} is not a folder only this user can open`);
  }
  return { root, ascii: isAscii(root) };
}

// Makes parent\<user SID>, with an access list giving that user alone full control, and
// refuses one whose list holds anyone else.
function userFolder(parent) {
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', windowsHide: true });
  const sid = run('whoami', ['/user', '/fo', 'csv', '/nh']).trim().split(',').pop().replace(/"/g, '');
  if (!/^S-1-[0-9-]+$/.test(sid)) {
    throw new Error(`whoami gave no SID: ${sid}`);
  }
  const folder = path.join(parent, sid);
  fs.mkdirSync(folder, { recursive: true });
  // A protected list, so nothing is inherited, with one entry: full control for the user.
  const dacl = `D:P(A;OICI;FA;;;${sid})`;
  const script = '$acl = Get-Acl -LiteralPath $env:PLANISH_FOLDER; $acl.SetSecurityDescriptorSddlForm($env:PLANISH_DACL, "Access"); '
    + 'Set-Acl -LiteralPath $env:PLANISH_FOLDER -AclObject $acl; (Get-Acl -LiteralPath $env:PLANISH_FOLDER).Sddl';
  // Without PSModulePath, which PowerShell 7 sets for its own modules, Windows PowerShell finds its own.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const sddl = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, env: { ...env, PLANISH_FOLDER: folder, PLANISH_DACL: dacl } }).trim();
  // Read back, the list may name the user by an alias, such as LA for the built-in administrator.
  if (!/D:PA?I?\(A;OICI;FA;;;[A-Z0-9-]+\)$/.test(sddl)) {
    throw new Error(`${folder} is open to others: ${sddl}`);
  }
  return folder;
}

/** Makes a session's folder, marked as the current process's. */
function createSession(root) {
  for (;;) {
    const id = crypto.randomBytes(4).toString('hex');
    const folder = path.join(root, id);
    try {
      fs.mkdirSync(folder, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') {
        continue;
      }
      throw error;
    }
    fs.writeFileSync(path.join(folder, MARKER), JSON.stringify({ pid: process.pid }));
    return { id, folder };
  }
}

/** The bytes a folder's files take, without following links. */
async function measure(folder) {
  let total = 0;
  const entries = await fsp.readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      total += await measure(entryPath);
    } else {
      total += (await fsp.lstat(entryPath).catch(() => ({ size: 0 }))).size;
    }
  }
  return total;
}

const exists = file => fsp.lstat(file).then(() => true, () => false);

// Deletes what does not look like work, on folder's own file system only. Returns how many
// entries it kept as work, and how many it could not delete.
async function prune(folder, device) {
  const result = { work: 0, left: 0 };
  for (const entry of await fsp.readdir(folder, { withFileTypes: true })) {
    if (entry.name === MARKER) {
      continue;
    }
    const entryPath = path.join(folder, entry.name);
    const stat = await fsp.lstat(entryPath).catch(() => undefined);
    if (!stat) {
      continue;
    }
    let remove = true;
    if (stat.isDirectory()) {
      if (stat.dev !== device) {
        result.left++;
        continue;
      }
      if (await exists(path.join(entryPath, '.git'))) {
        result.work++;
        continue;
      }
      if (!REGENERABLE.has(entry.name) && !(await exists(path.join(entryPath, 'CACHEDIR.TAG')))) {
        const inner = await prune(entryPath, device);
        result.work += inner.work;
        result.left += inner.left;
        remove = !inner.work && !inner.left;
      }
    } else if (stat.isFile() && WORK.has(path.extname(entry.name).toLowerCase())) {
      result.work++;
      continue;
    }
    if (remove) {
      // fs.rm removes a link itself, never its target.
      await fsp.rm(entryPath, { recursive: true, force: true }).catch(() => result.left++);
    }
  }
  return result;
}

// Ends a session's folder: deletes it, or all of it but its work. A folder left holding work is
// marked as kept; one with entries that could not be deleted keeps its marker, for sweep to retry.
async function release(folder) {
  const { work, left } = await prune(folder, (await fsp.lstat(folder)).dev);
  const marker = path.join(folder, MARKER);
  if (work) {
    await fsp.writeFile(marker, JSON.stringify({ kept: true }));
  } else if (!left) {
    await fsp.rm(marker, { force: true });
    await fsp.rmdir(folder).catch(() => {});
  }
  return { work, left };
}

const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

// Releases the folders of sessions whose process has ended. Returns the folders now holding
// only work, which are no longer marked, so they are reported once.
async function sweep(root) {
  const kept = [];
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    const folder = path.join(root, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }
    let marker;
    try {
      marker = JSON.parse(await fsp.readFile(path.join(folder, MARKER), 'utf8'));
    } catch {
      continue;
    }
    if (!marker.kept) {
      if (!Number.isInteger(marker.pid) || alive(marker.pid) || (await release(folder)).work === 0) {
        continue;
      }
    }
    await fsp.rm(path.join(folder, MARKER), { force: true });
    kept.push(folder);
  }
  return kept;
}

module.exports = { MARKER, createSession, measure, release, sweep, tempRoot };
