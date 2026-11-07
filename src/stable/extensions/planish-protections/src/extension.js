// SPDX-License-Identifier: Apache-2.0
// Starts the window's session when the extension host starts, before agents' extensions run:
// they start their programs with the extension host's environment, which this sets.
'use strict';

const vscode = require('vscode');
const { sessionEnvironment } = require('./environment');
const { createSession, measure, release, sweep, tempRoot } = require('./temp');

const GB = 2 ** 30;
const MEASURE_EVERY = 30_000;

let session;
let timer;

exports.activate = context => {
  const log = vscode.window.createOutputChannel('Planish Protections', { log: true });
  context.subscriptions.push(log);

  const { root, ascii, error } = tempRoot();
  session = createSession(root);
  Object.assign(process.env, sessionEnvironment(session));
  log.info(`Session ${session.id}, temp folder ${session.folder}`);
  if (!ascii) {
    log.warn(`${root} has characters other than ASCII, and no short name${error ? `; ${error}` : ''}`);
  }

  let reported = 0;
  timer = setInterval(async () => {
    const size = await measure(session.folder);
    if (Math.floor(size / GB) > reported) {
      reported = Math.floor(size / GB);
      log.info(`The session's temp folder holds ${(size / GB).toFixed(1)} GB`);
    }
  }, MEASURE_EVERY);

  sweep(root).then(kept => {
    for (const folder of kept) {
      log.info(`Kept work found in an old temp folder: ${folder}`);
      vscode.window.showInformationMessage(vscode.l10n.t('Planish kept work it found in an old temp folder: {0}', folder),
        vscode.l10n.t('Show')).then(choice => {
        if (choice) {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folder));
        }
      });
    }
  }, error => log.error(`Sweeping ${root} failed: ${error.message}`));
};

exports.deactivate = () => {
  clearInterval(timer);
  return session && release(session.folder).catch(() => {});
};
