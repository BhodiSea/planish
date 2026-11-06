// SPDX-License-Identifier: Apache-2.0
// Runs in the app's extension host (--extensionTestsPath); the app exits with 0 when run() resolves, 1 when it throws.
// SMOKE_MODE picks the checks: smoke (smoke.sh), agents (agents.sh) or edits (edits.sh).
const fs = require('fs');
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

// Each case: what makes the edit, run with the editor on edits.txt, and the fields its event's
// detailedReason.metadata must have; a field set to undefined must be missing. Expected values are
// what VS Code 1.143.1's source gives, and extensionEdit what patches/user/30-api-label-extension-edits.patch adds.
const EDITS = [
  ['Typing', 'the type command', c => c.command('type', { text: 'a' }), { source: 'cursor', kind: 'type', detailedSource: 'keyboard' }],
  ['Pasting', 'the paste command', c => c.command('paste', { text: 'b' }), { source: 'cursor', kind: 'paste', detailedSource: 'keyboard' }],
  ['Cutting', 'the cut command on a selection', async c => { c.select(0, 1); await c.command('cut'); }, { source: 'cursor', kind: 'cut', detailedSource: 'keyboard' }],
  ['Input method', 'the compositionType command', c => c.command('compositionType', { text: 'c', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 }), { source: 'cursor', kind: 'compositionType', detailedSource: 'keyboard' }],
  ['Undo', 'the undo command', c => c.command('undo'), {}],
  ['Snippet', 'TextEditor.insertSnippet', c => c.editor.insertSnippet(new c.api.SnippetString('d')), { source: 'snippet' }],
  ['Completion accepted', 'a completion provider of this extension', c => c.acceptCompletion(), { source: 'suggest', $extensionId: 'planish.planish-smoke' }],
  ['Inline completion accepted', 'an inline completion provider of this extension', c => c.acceptInlineCompletion(), { source: 'inlineCompletionAccept', $extensionId: 'planish.planish-smoke' }],
  ['Formatting', 'a formatter of this extension', c => c.command('editor.action.formatDocument'), {}],
  ['Extension edit', 'TextEditor.edit', c => c.editor.edit(b => b.insert(c.end(), 'e')), { source: 'unknown', name: 'MainThreadTextEditor' }],
  ['Extension edit', 'workspace.applyEdit, from an extension allowed planishEditSource, as a paste', c => c.applyEdit(c.api, 'paste'), { source: 'extensionEdit', $extensionId: 'planish.planish-smoke', kind: 'paste' }],
  ['Extension edit', 'workspace.applyEdit, from an extension not allowed planishEditSource, as typing', c => c.applyEdit(c.other, 'type'), { source: 'extensionEdit', $extensionId: 'planish.planish-smoke-other', kind: undefined }],
  ['Change on disk', 'writing the saved file', async c => { await c.document.save(); fs.writeFileSync(c.document.uri.fsPath, 'on disk\n'); }, { source: 'reloadFromDisk' }],
];

// Started with --enable-proposed-api for this extension only, as if it were built in.
async function edits() {
  const api = own.vscode;
  const other = (await vscode.extensions.getExtension('planish.planish-smoke-other').activate()).vscode;
  const file = `${process.env.SMOKE_WORKSPACE}/edits.txt`;
  fs.writeFileSync(file, 'zero\n');
  const document = await api.workspace.openTextDocument(api.Uri.file(file));
  const editor = await api.window.showTextDocument(document);
  await api.commands.executeCommand('workbench.action.focusActiveEditorGroup');

  let events = [];
  api.workspace.onDidChangeTextDocument(e => e.document === document && e.contentChanges.length && events.push(e));
  const end = () => document.lineAt(document.lineCount - 1).range.end;
  api.languages.registerCompletionItemProvider({ pattern: file }, { provideCompletionItems: () => [new api.CompletionItem('zebra')] });
  api.languages.registerInlineCompletionItemProvider({ pattern: file }, { provideInlineCompletionItems: (d, p) => [new api.InlineCompletionItem('ghost', new api.Range(p, p))] });
  api.languages.registerDocumentFormattingEditProvider({ pattern: file }, { provideDocumentFormattingEdits: d => [api.TextEdit.insert(d.positionAt(0), ' ')] });

  const c = {
    api, other, document, editor, end,
    command: (id, args) => api.commands.executeCommand(id, args),
    select: (from, to) => { editor.selection = new api.Selection(0, from, 0, to); },
    applyEdit: (from, userInput) => {
      const edit = new from.WorkspaceEdit();
      edit.insert(document.uri, end(), 'f');
      return from.workspace.applyEdit(edit, { userInput });
    },
    acceptCompletion: async () => {
      editor.selection = new api.Selection(end(), end());
      await api.commands.executeCommand('editor.action.triggerSuggest');
      await sleep(1500);
      await api.commands.executeCommand('acceptSelectedSuggestion');
    },
    acceptInlineCompletion: async () => {
      editor.selection = new api.Selection(end(), end());
      await api.commands.executeCommand('editor.action.inlineSuggest.trigger');
      await sleep(1500);
      await api.commands.executeCommand('editor.action.inlineSuggest.commit');
    },
  };

  const rows = ['| Edit | Made by | Reason | detailedReason.metadata | As expected |', '|---|---|---|---|---|'];
  const failed = [];
  for (const [what, how, make, expected] of EDITS) {
    editor.selection = new api.Selection(end(), end());
    events = [];
    await make(c);
    for (let i = 0; i < 100 && !events.length; i++) {
      await sleep(100);
    }
    const [event] = events;
    const metadata = event && event.detailedReason ? event.detailedReason.metadata : undefined;
    const ok = !!event && Object.entries(expected).every(([key, value]) => (metadata || {})[key] === value);
    rows.push(`| ${what} | ${how} | ${event ? api.TextDocumentChangeReason[event.reason] || '' : 'no edit'} | ${event ? `\`${JSON.stringify(metadata)}\`` : ''} | ${ok ? 'yes' : '**no**'} |`);
    if (!ok) {
      failed.push(`${what}, ${how}`);
    }
  }
  console.log(rows.join('\n'));
  if (process.env.SMOKE_RESULTS) {
    fs.writeFileSync(process.env.SMOKE_RESULTS, rows.join('\n') + '\n');
  }
  if (failed.length) {
    throw new Error(`edits not labelled as expected: ${failed.join('; ')}`);
  }
}

let own;

exports.run = async () => {
  own = await vscode.extensions.getExtension('planish.planish-smoke').activate();
  await { smoke, agents, edits }[process.env.SMOKE_MODE]();
  fs.writeFileSync(process.env.SMOKE_PASSED, '');
};
