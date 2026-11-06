// SPDX-License-Identifier: Apache-2.0
// Runs in the app's extension host (--extensionTestsPath); the app exits with 0 when run() resolves, 1 when it throws.
// SMOKE_MODE picks the checks: smoke (smoke.sh) or agents (agents.sh).
const fs = require('fs');
const vscode = require('vscode');

// Claude Code's documented link, and a link to Codex's handler, whose routes are undocumented.
const AGENTS = { 'anthropic.claude-code': '/open', 'openai.chatgpt': '/' };

const real = p => {
  const resolved = fs.realpathSync.native(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const link = (authority, path) => vscode.Uri.from({ scheme: vscode.env.uriScheme, authority, path, query: 'prompt=Explain%20this%20folder' });

// A question to the user leaves the call waiting, so one that does not finish in time fails.
const within = (seconds, promise, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish within ${seconds} s; was a question shown?`)), seconds * 1000)),
]);

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

// Started with --enable-proposed-api for this extension, as if it were built in.
async function agents() {
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
    console.log(`${id} ${extension.packageJSON.version} activated and took ${link(id, path)} without the question`);
  }

  for (const uri of [link('planish.planish-smoke', '/'), vscode.Uri.parse('https://anthropic.claude-code/open')]) {
    await rejects(() => own.openAgentLink(uri), /Not a link to Claude Code or Codex/, `openAgentLink(${uri})`);
  }
}

let own;

exports.run = async () => {
  own = await vscode.extensions.getExtension('planish.planish-smoke').activate();
  await { smoke, agents }[process.env.SMOKE_MODE]();
  fs.writeFileSync(process.env.SMOKE_PASSED, '');
};
