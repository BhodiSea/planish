// SPDX-License-Identifier: Apache-2.0
// Runs in the extension host of the app started from source (--extensionTestsPath); the app exits with 0 when run() resolves, 1 when it throws.
const fs = require('fs');
const vscode = require('vscode');

exports.run = async () => {
  const extension = vscode.extensions.getExtension(process.env.LOOP_EXTENSION);
  if (!extension) {
    throw new Error(`the built-in extension ${process.env.LOOP_EXTENSION} is missing`);
  }
  const where = fs.realpathSync(extension.extensionPath);
  if (where !== fs.realpathSync(process.env.LOOP_PATH)) {
    throw new Error(`${extension.id} loaded from ${where}, not from ${process.env.LOOP_PATH}`);
  }
  const value = (await extension.activate()).value;
  if (value !== 'after') {
    throw new Error(`${extension.id} gave "${value}", not the edited "after"`);
  }
  console.log(`loop test passed: ${extension.id} loaded from ${where} with its edit`);
  fs.writeFileSync(process.env.LOOP_PASSED, '');
};
