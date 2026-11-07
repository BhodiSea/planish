// SPDX-License-Identifier: Apache-2.0
'use strict';

const key = id => id.toLowerCase();

// The row of the stand-ins table for an extension licensed only for Microsoft's products.
const microsoftOnly = (id, standIns) => standIns.find(row => row.ids.includes(key(id)));

// The IDs to look up on Open VSX: every extension in the profiles, except Microsoft's licensed
// ones, and their stand-ins.
function toLookUp(profiles, standIns) {
  const ids = new Set();
  for (const id of profiles.flatMap(profile => profile.extensions)) {
    const row = microsoftOnly(id, standIns);
    for (const each of row ? row.standIns : [id]) {
      ids.add(key(each));
    }
  }
  return [...ids];
}

// What the import offers for each profile, given what Open VSX holds (`found`, by lowercase ID,
// with each extension's displayName and whether its publisher is verified):
// - install: the extensions found on Open VSX;
// - standIns: each Microsoft extension's stand-ins, if on Open VSX under a verified publisher,
//   with whether they do only part of its work;
// - missing: the extensions that are not carried over, with the reason.
function plan(profiles, found, standIns) {
  return profiles.map(profile => {
    const install = [];
    const offers = [];
    const missing = [];
    for (const id of profile.extensions) {
      const row = microsoftOnly(id, standIns);
      if (row) {
        const named = row.standIns.map(each => found.get(key(each))).filter(each => each && each.verified);
        missing.push({ id, microsoft: row.name, partial: !!row.partial, standIns: named.map(each => each.displayName) });
        offers.push(...named.map(each => ({ ...each, for: row.name, partial: !!row.partial })));
      } else if (found.get(key(id))) {
        install.push(found.get(key(id)));
      } else {
        missing.push({ id });
      }
    }
    const installing = new Set(install.map(each => key(each.id)));
    const standInsOffered = offers.filter((each, i) => !installing.has(key(each.id)) && offers.findIndex(o => key(o.id) === key(each.id)) === i);
    return { ...profile, install, standIns: standInsOffered, missing };
  });
}

// The Markdown report of an import: what came over, and what did not and why.
function report(editor, results) {
  const lines = [`# Imported from ${editor}`, ''];
  for (const { name, isDefault, created, installed, missing, left, failed, mcp } of results) {
    lines.push(`## ${isDefault ? `Default profile, into ${name}` : `Profile ${name}`}`, '');
    if (!isDefault && !created) {
      lines.push('Not created.', '');
      continue;
    }
    lines.push('Settings, keyboard shortcuts, tasks and snippets came over.', '', `Extensions installed: ${installed.join(', ') || 'none'}.`, '');
    const not = [
      ...missing.map(({ id, microsoft, partial, standIns }) => microsoft
        ? `- ${id}: ${microsoft} is licensed only for Microsoft's products. ${standIns.length ? `${partial ? 'Partial open stand-in' : 'Open stand-in'}: ${standIns.join(', ')}.` : 'There is no open stand-in.'}`
        : `- ${id}: not on Open VSX.`),
      ...left.map(id => `- ${id}: left out of the list.`),
      ...failed.map(id => `- ${id}: did not install.`),
      ...mcp ? ['- MCP servers (mcp.json): not imported.'] : [],
    ];
    if (not.length) {
      lines.push('Not carried over:', '', ...not, '');
    }
  }
  lines.push('Never carried over: sign-ins, which extensions were disabled, the layout and open editors, and each extension\'s own stored data.', '');
  return lines.join('\n');
}

module.exports = { microsoftOnly, plan, report, toLookUp };
