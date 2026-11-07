<!-- SPDX-License-Identifier: Apache-2.0 -->
# Planish Protections

Planish's protections against agent actions users do not want, as a built-in extension ([spec](../../../../docs/spec/protections.md#what-planish-owns)). So far it starts each window's session:

- `src/temp.js`: `tempRoot()` finds the folder that holds the sessions' folders, `createSession(root)` makes and marks one, `measure(folder)` counts its bytes, `release(folder)` deletes all of it but anything that looks like work, and `sweep(root)` releases the folders of sessions whose process has ended.
- `src/environment.js`: `sessionEnvironment(session)`, the variables a session sets.
- `src/paths.js`: `resolveTarget(path)` resolves links and Windows short names, for guards to compare targets; `shortPath(folder)` gives a folder's short name on Windows.
- `src/extension.js` sets the environment in the extension host as it starts, measures the folder every 30 seconds, releases it when the window closes and sweeps old ones.

The tests are in `test/protections/`: `node --test` there.
