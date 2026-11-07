// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const FILES = { settings: 'settings.json', keybindings: 'keybindings.json', tasks: 'tasks.json' };

async function text(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function json(file, fallback) {
  const content = await text(file);
  return content === undefined ? fallback : JSON.parse(content);
}

async function snippets(folder) {
  let names;
  try {
    names = await fs.readdir(folder);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
  const result = {};
  for (const name of names.filter(name => /\.(json|code-snippets)$/.test(name))) {
    result[name] = await text(path.join(folder, name));
  }
  return result;
}

// The extensions a profile's extensions.json lists, less those the editor has since removed,
// which it marks in the extensions folder's .obsolete file until it deletes their folders.
async function extensions(file, obsolete) {
  return (await json(file, [])).filter(entry => !obsolete[entry.relativeLocation]).map(entry => entry.identifier.id);
}

async function profile(folder, extensionsFile, obsolete) {
  const result = {
    snippets: await snippets(path.join(folder, 'snippets')),
    extensions: await extensions(extensionsFile, obsolete),
    // MCP servers are left out: VS Code's profile import does not carry them.
    mcp: await text(path.join(folder, 'mcp.json')) !== undefined,
  };
  for (const [key, name] of Object.entries(FILES)) {
    result[key] = await text(path.join(folder, name));
  }
  return result;
}

// Reads an editor's profiles, the default first, as the editor keeps them: its default profile
// in the User folder, and the others in profiles/, listed in globalStorage/storage.json.
// A profile that shares a part with the default profile takes the default's.
async function readSetup(editor) {
  const obsolete = await json(path.join(editor.extensions, '.obsolete'), {});
  const defaults = { name: 'Default', isDefault: true, ...await profile(editor.user, path.join(editor.extensions, 'extensions.json'), obsolete) };
  const profiles = [defaults];
  const stored = (await json(path.join(editor.user, 'globalStorage', 'storage.json'), {})).userDataProfiles || [];
  for (const { name, location, useDefaultFlags = {} } of stored) {
    const folder = typeof location === 'string'
      ? path.join(editor.user, 'profiles', location)
      : fileURLToPath(`file://${location.authority || ''}${location.path}`);
    const own = await profile(folder, path.join(folder, 'extensions.json'), obsolete);
    for (const key of [...Object.keys(FILES), 'snippets', 'extensions']) {
      if (useDefaultFlags[key]) {
        own[key] = defaults[key];
      }
    }
    profiles.push({ name, isDefault: false, ...own });
  }
  return profiles;
}

module.exports = { readSetup };
