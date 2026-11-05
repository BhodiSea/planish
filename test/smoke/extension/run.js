// SPDX-License-Identifier: Apache-2.0
// Runs in the app's extension host (--extensionTestsPath); the app exits with 0 when run() resolves, 1 when it throws.
const fs = require('fs');
const vscode = require('vscode');

const real = p => {
  const resolved = fs.realpathSync.native(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

exports.run = async () => {
  const folders = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
  if (folders.length !== 1 || real(folders[0]) !== real(process.env.SMOKE_WORKSPACE)) {
    throw new Error(`expected the folder ${process.env.SMOKE_WORKSPACE} to be open, found [${folders.join(', ')}]`);
  }

  const extension = vscode.extensions.getExtension(process.env.SMOKE_EXTENSION);
  if (!extension) {
    throw new Error(`${process.env.SMOKE_EXTENSION} is not installed`);
  }
  await extension.activate();

  console.log(`smoke test passed: ${vscode.env.appName} opened ${folders[0]} with ${extension.id} ${extension.packageJSON.version}`);
  fs.writeFileSync(process.env.SMOKE_PASSED, '');
};
