// SPDX-License-Identifier: Apache-2.0
// Runs in the app's extension host (--extensionTestsPath); the app exits with 0 when run() resolves, 1 when it throws.
// SMOKE_MODE picks the checks: smoke (smoke.sh), agents (agents.sh) or keybindings (keybindings.sh).
// layout.sh and import.sh drive the app through main.js instead (SMOKE_DRIVE), for its stored state.
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

// Claude Code's documented link, and a link to Codex's handler, whose routes are undocumented.
const AGENTS = { 'anthropic.claude-code': '/open', 'openai.chatgpt': '/' };

const real = p => {
  const resolved = fs.realpathSync.native(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const link = (authority, path) => vscode.Uri.from({ scheme: vscode.env.uriScheme, authority, path, query: 'prompt=Explain%20this%20folder' });

const within = (seconds, promise, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish within ${seconds} s`)), seconds * 1000)),
]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// In tests the app answers every confirmation itself, logging this at trace level in the window's
// log, so the questions asked are counted there. logUri is <window log folder>/exthost/<id>.
const QUESTION = 'DialogService: refused to show confirmation dialog in tests.';
const questions = () => {
  const log = vscode.Uri.joinPath(own.logUri, '..', '..', 'renderer.log').fsPath;
  return fs.readFileSync(log, 'utf8').split(QUESTION).length - 1;
};

const rejects = async (call, pattern, what) => {
  try {
    await call();
  } catch (error) {
    if (pattern.test(String(error && error.message))) {
      return;
    }
    throw new Error(`${what} failed with "${error && error.message}", which does not match ${pattern}`);
  }
  throw new Error(`${what} did not fail`);
};

async function smoke() {
  const folders = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
  if (folders.length !== 1 || real(folders[0]) !== real(process.env.SMOKE_WORKSPACE)) {
    throw new Error(`expected the folder ${process.env.SMOKE_WORKSPACE} to be open, found [${folders.join(', ')}]`);
  }

  const extension = vscode.extensions.getExtension(process.env.SMOKE_EXTENSION);
  if (!extension) {
    throw new Error(`${process.env.SMOKE_EXTENSION} is not installed`);
  }
  await extension.activate();

  // This extension declares the proposal, which is not enough for one that is not built in.
  await rejects(() => own.openAgentLink(link('anthropic.claude-code', '/open')),
    /Extension 'planish\.planish-smoke' CANNOT use API proposal: planishAgentLinks\b/, 'openAgentLink, called by an extension that is not built in,');
  const commands = (await vscode.commands.getCommands()).filter(id => /agent.?link/i.test(id));
  if (commands.length) {
    throw new Error(`commands any extension can run may open agents' links: ${commands.join(', ')}`);
  }

  // A built-in extension of Planish's, with its validator and schemas as the app ships them.
  const learn = vscode.extensions.getExtension('planish.planish-learn');
  if (!learn) {
    throw new Error('the built-in extension planish.planish-learn is missing');
  }
  if (!vscode.extensions.getExtension('planish.planish-import')) {
    throw new Error('the built-in extension planish.planish-import is missing');
  }
  const { validateLesson } = require(path.join(learn.extensionPath, 'src', 'lessons', 'validate.js'));
  const errors = validateLesson(require('../../learn/lesson.json'));
  if (errors.length) {
    throw new Error(`the sample lesson fails the shipped validator: ${JSON.stringify(errors)}`);
  }

  console.log(`smoke test passed: ${vscode.env.appName} opened ${folders[0]} with ${extension.id} ${extension.packageJSON.version}`);
}

// Started with --enable-proposed-api for this extension, as if it were built in, and --log trace.
async function agents() {
  const before = questions();
  for (const [id, path] of Object.entries(AGENTS)) {
    const extension = vscode.extensions.getExtension(id);
    if (!extension) {
      throw new Error(`${id} is not installed`);
    }
    const handled = await within(60, own.openAgentLink(link(id, path)), `Opening ${link(id, path)}`);
    if (handled !== true) {
      throw new Error(`${link(id, path)} was not handled`);
    }
    await within(120, Promise.resolve(extension.activate()), `Activating ${id}`);
    console.log(`${id} ${extension.packageJSON.version} activated, and the app accepted ${link(id, path)} for it`);
  }

  // The control: the same link opened as any extension would open it asks the question. The
  // window log is written in order, so once the control's line is there, any from above are too.
  const control = link('anthropic.claude-code', '/open');
  await within(60, Promise.resolve(vscode.env.openExternal(control)), `Opening ${control} with openExternal`);
  let after = questions();
  for (let tries = 0; after === before && tries < 30; tries++) {
    await sleep(1000);
    after = questions();
  }
  if (after !== before + 1) {
    throw new Error(`expected the question once, for openExternal, but the window log has ${after - before} since the test began`);
  }
  console.log('openAgentLink asked no question; openExternal asked it once');

  for (const uri of [link('planish.planish-smoke', '/'), vscode.Uri.parse('https://anthropic.claude-code/open')]) {
    await rejects(() => own.openAgentLink(uri), /Not a link to Claude Code or Codex/, `openAgentLink(${uri})`);
  }
}

// Writes out the default keyboard shortcuts, as the app shows them, for keybindings.sh to compare,
// once the parts that register theirs late have done so.
async function keybindings() {
  const uri = 'vscode://defaultsettings/keybindings.json';
  await sleep(15000);
  await vscode.commands.executeCommand('workbench.action.openDefaultKeybindingsFile');
  let document;
  for (let tries = 0; !document && tries < 30; tries++) {
    document = vscode.workspace.textDocuments.find(each => each.uri.toString() === uri);
    if (!document) {
      await sleep(1000);
    }
  }
  if (!document) {
    throw new Error(`${uri} did not open`);
  }
  fs.writeFileSync(process.env.SMOKE_OUT, document.getText());
}

const editors = () => vscode.window.tabGroups.all.map(group =>
  group.tabs.map(tab => `${group.viewColumn}:${tab.input && tab.input.uri ? path.basename(tab.input.uri.fsPath) : tab.label}`));

// Quits the app as a user would, so that it saves its state.
async function quit() {
  vscode.commands.executeCommand('workbench.action.quit');
  await new Promise(() => { });
}

// Lays the window out unlike the default, and records its editors.
async function layout() {
  for (const [file, viewColumn] of [['a.txt', vscode.ViewColumn.One], ['b.txt', vscode.ViewColumn.Two]]) {
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(process.env.SMOKE_WORKSPACE, file)), { viewColumn, preview: false });
  }
  for (const command of ['workbench.view.search', 'workbench.action.positionPanelRight', 'workbench.action.focusPanel',
    'workbench.action.closeAuxiliaryBar', 'workbench.action.toggleSidebarPosition']) {
    await vscode.commands.executeCommand(command);
  }
  await sleep(2000);
  fs.writeFileSync(process.env.SMOKE_OUT, JSON.stringify(editors()));
}

// After the update: the same editors, in the same groups.
async function update() {
  const expected = fs.readFileSync(process.env.SMOKE_OUT, 'utf8');
  let found;
  for (let tries = 0; found !== expected && tries < 20; tries++) {
    await sleep(1000);
    found = JSON.stringify(editors());
  }
  if (found !== expected) {
    throw new Error(`after the update the editors are ${found}, not ${expected}`);
  }
  console.log(`after the update the editors are still ${found}`);
}

const parse = text => JSON.parse(text);
const read = file => fs.readFileSync(file, 'utf8');

// Imports SMOKE_IMPORT's setup as a user would, accepting the list as offered, and checks that
// what import.sh gave that editor came over.
async function importSetup() {
  const editor = process.env.SMOKE_IMPORT;
  const sample = parse(read(process.env.SMOKE_SAMPLE));
  let settled = false;
  const importing = Promise.resolve(vscode.commands.executeCommand('planish.importSetup', editor)).finally(() => { settled = true; });
  for (let seconds = 0; !settled && seconds < 600; seconds++) {
    await sleep(1000);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
  }
  const report = await within(1, importing, 'The import');
  console.log(report);
  fs.writeFileSync(process.env.SMOKE_OUT, report);

  const user = path.join(process.env.SMOKE_USER_DATA, 'User');
  const check = (what, found, expected) => {
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      throw new Error(`${what} is ${JSON.stringify(found)}, not ${JSON.stringify(expected)}`);
    }
  };
  check('settings.json', parse(read(path.join(user, 'settings.json'))), parse(sample.settings));
  check('keybindings.json', read(path.join(user, 'keybindings.json')), sample.keybindings);
  check('the snippets', read(path.join(user, 'snippets', 'sample.code-snippets')), sample.snippets);
  for (let tries = 0; !vscode.extensions.getExtension(sample.extension) && tries < 30; tries++) {
    await sleep(1000);
  }
  if (!vscode.extensions.getExtension(sample.extension)) {
    throw new Error(`${sample.extension} was not installed`);
  }

  const profiles = parse(read(path.join(user, 'globalStorage', 'storage.json'))).userDataProfiles || [];
  const profile = profiles.find(each => each.name === sample.profile);
  if (!profile) {
    throw new Error(`no profile ${sample.profile}, only ${JSON.stringify(profiles)}`);
  }
  const folder = path.join(user, 'profiles', profile.location);
  check(`${sample.profile}'s settings.json`, parse(read(path.join(folder, 'settings.json'))), parse(sample.profileSettings));
  check(`${sample.profile}'s extensions`, parse(read(path.join(folder, 'extensions.json'))).map(e => e.identifier.id.toLowerCase()), [sample.profileExtension.toLowerCase()]);
  for (const start of sample.reported) {
    if (!report.split('\n').some(line => line.startsWith(start))) {
      throw new Error(`the report has no line starting "${start}"`);
    }
  }
  console.log(`imported ${editor}'s setup`);
}

// Runs layout, update or import in an app started without the test runner, then quits it.
exports.drive = mode => ({ layout, update, import: importSetup })[mode]()
  .then(() => fs.writeFileSync(process.env.SMOKE_PASSED, ''), error => console.error(`${mode} failed: ${error && error.stack}`))
  .then(quit);

let own;

exports.run = async () => {
  own = await vscode.extensions.getExtension('planish.planish-smoke').activate();
  await { smoke, agents, keybindings }[process.env.SMOKE_MODE]();
  fs.writeFileSync(process.env.SMOKE_PASSED, '');
};
