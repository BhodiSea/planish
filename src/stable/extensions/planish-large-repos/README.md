<!-- SPDX-License-Identifier: Apache-2.0 -->
# Planish Large Repositories

Defaults that keep Planish fast in large repositories, as a built-in extension with no code: its `package.json` contributes only `configurationDefaults` ([spec](../../../../docs/spec/fork.md#indexing)). Your own settings override each one.

## The defaults

**`files.watcherExclude`** gains these patterns, on top of VS Code's own for `.git` and `.hg`:

| Pattern | Why |
| --- | --- |
| `node_modules/[^@]*/**` and `node_modules/@*/*/**` | An install writes thousands of files, and each one reaches the watcher, the git extension's refresh and every extension host. These skip what is inside each package, scoped or not, but still report a package being added, removed or replaced, which is how TypeScript notices an install. |
| `.venv/**`, `__pycache__/**` | Python's environments and bytecode. |
| `dist/**`, `build/**`, `out/**`, `target/**`, `.next/**`, `.turbo/**` | Build output, which a build rewrites whole. |

Each pattern is written three times, for a folder at the top of the workspace, one level down and two levels down (`dist/**`, `*/dist/**` and `*/*/dist/**`), as VS Code writes its own: a leading `**/` would match at any depth but costs far more CPU in a large workspace ([VS Code issue 305923](https://github.com/microsoft/vscode/issues/305923)). A folder deeper than that is still watched.

**`search.followSymlinks`** is off, so a search does not walk the links a pnpm monorepo makes ([VS Code issue 304676](https://github.com/microsoft/vscode/issues/304676)).

## What it costs

- Changes made outside Planish in an excluded folder, by a build or a package manager, do not reach the Explorer or extensions that watch files. Files you edit in Planish are not affected.
- TypeScript does not see a file changed inside an installed package: a hand edit, `patch-package`, or an update by a package manager that rewrites files in place, as Yarn 1 does. npm, which replaces each package's folder, is seen. Run **TypeScript: Restart TS Server** after such a change.
- Search skips files reached only through a link.

## Undoing a default

In your settings (**Preferences: Open User Settings (JSON)**, or the workspace's `.vscode/settings.json` for one repository), set a pattern to `false` to watch that folder again, or turn following links back on:

```jsonc
{
   "files.watcherExclude": {
      "dist/**": false,
      "*/dist/**": false,
      "*/*/dist/**": false
   },
   "search.followSymlinks": true
}
```

The smoke test (`test/smoke/`) checks on each platform's build that a profile has these defaults, that a user's setting overrides them, that the watcher skips what they exclude, and that TypeScript sees a package installed, scoped or not, and one reinstalled with other types.
