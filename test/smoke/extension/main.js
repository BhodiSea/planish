// SPDX-License-Identifier: Apache-2.0
// The test extension's own API, for run.js: the app loads run.js with an API that belongs to no
// extension, so calls that depend on which extension makes them are made from here.
const vscode = require('vscode');

exports.activate = context => {
  // layout.sh drives the app without the test runner, which keeps the app's state in memory.
  if (process.env.SMOKE_DRIVE) {
    require('./run.js').drive(process.env.SMOKE_DRIVE);
  }
  return {
    logUri: context.logUri,
    openAgentLink: uri => vscode.env.openAgentLink(uri),
  };
};
