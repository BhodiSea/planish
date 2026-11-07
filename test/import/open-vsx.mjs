// SPDX-License-Identifier: Apache-2.0
// Checks that each stand-in Planish names is on Open VSX under a verified publisher, and not
// deprecated. Run by CI; it needs the network.
import { readFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync(new URL('../../src/stable/extensions/planish-import/stand-ins.json', import.meta.url)));
let failed = false;
for (const id of rows.flatMap(row => row.standIns)) {
  const response = await fetch(`https://open-vsx.org/api/${id.replace('.', '/')}`);
  const found = response.ok ? await response.json() : {};
  const problem = !response.ok ? `Open VSX answered ${response.status}`
    : !found.verified ? 'its publisher is not verified'
      : found.deprecated ? 'it is deprecated' : '';
  console.log(`${id} ${found.version ?? ''}: ${problem || 'verified'}`);
  failed ||= !!problem;
}
process.exit(failed ? 1 : 0);
