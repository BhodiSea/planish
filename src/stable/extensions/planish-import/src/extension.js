// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { editors } = require('./editors.js');
const { plan, report, toLookUp } = require('./plan.js');
const { readSetup } = require('./setup.js');
const STAND_INS = require('../stand-ins.json');

const OFFERED = 'planish.import.offered';

const all = () => editors(process.platform, process.env, os.homedir());
const present = () => all().filter(editor => fs.existsSync(editor.user) || fs.existsSync(editor.extensions));

// Looks each ID up on the Open VSX the app installs from.
async function lookUp(ids) {
  const product = JSON.parse(fs.readFileSync(path.join(vscode.env.appRoot, 'product.json'), 'utf8'));
  const api = product.extensionsGallery.serviceUrl.replace(/\/vscode\/gallery\/?$/, '/api');
  return new Map(await Promise.all(ids.map(async id => {
    const [namespace, name] = id.split('.');
    const response = await fetch(`${api}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
    if (response.status === 404) {
      return [id, undefined];
    }
    if (!response.ok) {
      throw new Error(`Open VSX answered ${response.status} for ${id}`);
    }
    const found = await response.json();
    return [id, { id: `${found.namespace}.${found.name}`, displayName: found.displayName || found.name, verified: !!found.verified }];
  })));
}

// The list the user confirms: per profile, its extensions found on Open VSX, ticked, and the
// open stand-ins for its Microsoft extensions, unticked.
function items(editor, planned) {
  const list = [];
  planned.forEach((profile, index) => {
    list.push({ kind: vscode.QuickPickItemKind.Separator, label: profile.isDefault ? `${editor.name}'s default profile, into this profile` : `${editor.name}'s profile ${profile.name}` });
    if (!profile.isDefault) {
      list.push({ label: `Create the profile ${profile.name}`, picked: true, profile: index });
    }
    for (const extension of profile.install) {
      list.push({ label: extension.displayName, description: extension.verified ? extension.id : `${extension.id}, unverified publisher`, picked: true, profile: index, id: extension.id });
    }
    for (const extension of profile.standIns) {
      list.push({ label: extension.displayName, description: `${extension.id}, open stand-in for ${extension.for}`, picked: false, profile: index, id: extension.id });
    }
  });
  return list;
}

async function importSetup(editorId) {
  const found = present();
  let editor = found.find(each => each.id === editorId);
  if (!editor && !editorId && found.length) {
    editor = found.length === 1 ? found[0] : (await vscode.window.showQuickPick(
      found.map(each => ({ label: each.name, editor: each })), { title: 'Import from' }))?.editor;
    if (!editor) {
      return undefined;
    }
  }
  if (!editor) {
    const name = all().find(each => each.id === editorId)?.name;
    vscode.window.showInformationMessage(name ? `No ${name} setup was found.` : 'No VS Code, Cursor or Antigravity setup was found.');
    return undefined;
  }

  const profiles = await readSetup(editor);
  const onOpenVsx = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Looking up ${editor.name}'s extensions on Open VSX` },
    () => lookUp(toLookUp(profiles, STAND_INS)));
  const planned = plan(profiles, onOpenVsx, STAND_INS);
  const list = items(editor, planned);
  const chosen = await vscode.window.showQuickPick(list, {
    title: `Import from ${editor.name}`,
    placeHolder: 'Untick what to leave out. This replaces this profile\'s settings, keyboard shortcuts, tasks and snippets.',
    canPickMany: true,
    ignoreFocusOut: true,
  });
  if (!chosen) {
    return undefined;
  }

  const results = [];
  for (const [index, profile] of planned.entries()) {
    const ids = chosen.filter(item => item.profile === index && item.id).map(item => item.id);
    const offered = list.filter(item => item.profile === index && item.id && item.picked).map(item => item.id);
    const data = { settings: profile.settings, keybindings: profile.keybindings, tasks: profile.tasks, snippets: profile.snippets, extensions: ids };
    const result = { ...profile, name: profile.isDefault ? vscode.env.appName : profile.name, installed: [], failed: [], left: offered.filter(id => !ids.includes(id)) };
    if (profile.isDefault) {
      result.failed = await vscode.env.importIntoProfile(data);
      result.created = true;
    } else if (chosen.some(item => item.profile === index && !item.id)) {
      result.created = await vscode.env.createProfile(profile.name, data);
    }
    if (result.created) {
      result.installed = ids.filter(id => !result.failed.includes(id));
    }
    results.push(result);
  }

  const content = report(editor.name, results);
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'markdown', content }), { preview: false });
  return content;
}

// On the first run, offers once to import from each editor found.
async function offer(context) {
  const found = present();
  if (context.globalState.get(OFFERED) || !found.length) {
    return;
  }
  await context.globalState.update(OFFERED, true);
  const answer = await vscode.window.showInformationMessage(
    `Import your settings, keyboard shortcuts, extensions and profiles from ${found.map(editor => editor.name).join(', ').replace(/, ([^,]*)$/, ' or $1')}?`,
    ...found.map(editor => editor.name));
  const editor = found.find(each => each.name === answer);
  if (editor) {
    await importSetup(editor.id);
  }
}

exports.activate = context => {
  context.subscriptions.push(vscode.commands.registerCommand('planish.importSetup', editorId =>
    importSetup(editorId).catch(error => {
      vscode.window.showErrorMessage(`The import stopped: ${error.message}`);
      throw error;
    })));
  offer(context).catch(error => console.error(error));
};
