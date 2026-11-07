<!-- SPDX-License-Identifier: Apache-2.0 -->
# Planish Import

Imports another editor's setup: the settings, keyboard shortcuts, tasks, snippets, extensions and profiles of VS Code, Cursor or Antigravity ([spec](../../../../docs/spec/README.md#3-familiar-to-vs-code-cursor-and-antigravity-users)). On the first run it offers once to import from each editor it finds; **Planish: Import Settings and Extensions from Another Editor...** does it at any time.

- `src/editors.js` knows where each editor keeps its setup, and `src/setup.js` reads it: the default profile from the User folder and the extensions folder's `extensions.json`, the others from `profiles/`, as listed in `globalStorage/storage.json`.
- `src/plan.js` looks at each extension on Open VSX: those found are listed ticked, and in place of each Microsoft extension in `stand-ins.json` its open stand-ins are listed unticked, if they are on Open VSX under a verified publisher ([stand-ins](../../../../docs/spec/fork.md#stand-ins-for-microsofts-extensions)). Nothing is installed until the user confirms the list. It also writes the report of what was not carried over.
- `src/extension.js` asks, then imports through the `planishProfileImport` API proposal (`patches/user/40-api-add-profile-import.patch`), whose workbench part, `profileImport.ts`, uses VS Code's own profile import: the default profile goes into Planish's current profile, keeping the extensions it has, and each other profile becomes a new one.

The stand-ins for file types are also in `product.json`'s `extensionRecommendations` (`patches/user/json/product.json`), which VS Code reads to recommend them. The tests are in `test/import/`: `node --test` there.
