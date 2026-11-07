// SPDX-License-Identifier: Apache-2.0
// Compares Planish's default keyboard shortcuts with upstream's, each as keybindings.sh wrote
// them: Planish may add shortcuts, on keys upstream leaves free, but may not change or drop any.
//
// Usage: node test/smoke/keybindings.mjs UPSTREAM PLANISH
import { readFileSync } from 'node:fs';

// The file is JSON but for its comments, which take whole lines. A shortcut that names the user's
// own keybindings.json names it by the test's temporary folder, which differs between runs.
const read = file => JSON.parse(readFileSync(file, 'utf8').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n'))
  .map(({ key, command, when, args }) => JSON.stringify({ key, command, when, args }).replace(/vscode-userdata:[^'"]*/g, 'vscode-userdata:USER'));

const [upstream, planish] = process.argv.slice(2).map(read);
const keys = new Set(upstream.map(entry => JSON.parse(entry).key));
// Upstream's commands that register their shortcuts only once a part of the window needs them,
// so either run can lack them. Every other difference fails, so a new one fails once and is
// added here in review.
const LATE = new Set([
  'chat.models.action.clearSearchResults',
  'workbench.actions.workbench.panel.output.clearFilterText',
]);
const late = entry => LATE.has(JSON.parse(entry).command);
const added = planish.filter(entry => !upstream.includes(entry));
const own = added.filter(entry => /^_?planish\./.test(JSON.parse(entry).command));
const missing = upstream.filter(entry => !planish.includes(entry));
const errors = [
  ...missing.filter(entry => !late(entry)).map(entry => `changed or dropped: ${entry}`),
  ...own.filter(entry => keys.has(JSON.parse(entry).key)).map(entry => `on a key upstream binds: ${entry}`),
  ...added.filter(entry => !own.includes(entry) && !late(entry)).map(entry => `not upstream's: ${entry}`),
];
console.log(`${upstream.length} upstream shortcuts, ${planish.length} in Planish; Planish's own: ${own.length}${own.length ? `\n${own.join('\n')}` : ''}`);
const unmatched = [...missing, ...added].filter(late);
if (unmatched.length) {
  console.log(`upstream's late shortcuts, in one run only:\n${unmatched.join('\n')}`);
}
for (const error of errors) {
  console.error(error);
}
process.exit(errors.length ? 1 : 0);
