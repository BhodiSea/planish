<!-- SPDX-License-Identifier: Apache-2.0 -->
# Syncing with upstream

How to move Planish onto a newer VS Code release, for a person or a coding agent. The rules it follows are in [fork.md, Keeping up with upstream](spec/fork.md#keeping-up-with-upstream) and [The repository](spec/fork.md#the-repository).

## When

- **A VSCodium release.** Planish takes each VS Code release that VSCodium adopts, and ships it within two weeks of VSCodium's release ([releases](https://github.com/VSCodium/vscodium/releases)).
- **Ahead of VSCodium.** Planish moves to a newer VS Code release itself once it is 8 weeks behind VS Code's newest, or when its Electron is within four weeks of the end date on [Electron's schedule](https://releases.electronjs.org/schedule). Only release tags, never `main`.

Each sync is one branch and one pull request, `claude/sync-<VS Code version>` for an agent.

## 1. Merge VSCodium's release

VSCodium's history is kept, so its changes come in as a merge. Find the release's tag in `git ls-remote --tags https://github.com/VSCodium/vscodium.git`; its `upstream/stable.json` names the VS Code tag it builds.

```sh
git fetch --no-tags https://github.com/VSCodium/vscodium.git refs/tags/<tag>:refs/vscodium/release
git switch -c claude/sync-<version> origin/main
git merge --signoff refs/vscodium/release
```

VSCodium's commits need no sign-off; the merge commit does, which `--signoff` gives it. Resolve conflicts this way:

- **Files Planish deleted**, VSCodium's build and release workflows among them: keep them deleted (`git rm`). A workflow VSCodium adds is deleted too: Planish's CI is `ci.yml` and the `lint-*` and `sign-off` workflows.
- **Files Planish replaced whole** (`README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `announcements-extra.json`): keep Planish's (`git checkout --ours`).
- **Version pins** (`upstream/stable.json`, `upstream/insider.json`, `.nvmrc`) and `product.json`: take VSCodium's. Planish's values live in `patches/user/json/`.
- **Fenced edits**: take VSCodium's lines outside the fences and keep the fences. Where VSCodium changed a line that Planish removed, and keeps in its fence as a comment, make the comment match VSCodium's new line, or drop the removal if it is no longer needed.
- **VSCodium's patches**: take VSCodium's, then re-apply any change Planish had made to one, marked as in [Changing one of VSCodium's patches](#changing-one-of-vscodiums-patches).

Then run the fence check against the release, and its tests:

```sh
python3 -I -B -m unittest discover --start-directory dev --pattern 'test_*.py'
python3 -I -B dev/check_fences.py refs/vscodium/release
```

Compare its counts with those on `main`. Each upstream file Planish edits adds work to every sync, so a count that rises needs a reason in the pull request.

## 2. Rebase Planish's patches

This needs a VS Code checkout at the new tag, so it runs on a machine that may clone VS Code and run its build, not in a Planish cloud session, where builds run only on CI.

```sh
./get_repo.sh
./dev/update_patches.sh
```

The script applies each of VSCodium's patches to a clean tree, then each of Planish's in `patches/user/` on top of VSCodium's, as `prepare_vscode.sh` does. When one fails, it writes `.rej` files in `vscode/` and waits. Fix the files there, keeping Planish's fences, delete the `.rej` files and press a key; the script then rewrites the patch from the tree, keeping its licence line. A coding agent runs it with its input on a pipe it can write to, and writes a key once the `.rej` files are gone. Patches that still apply, with offsets, are left as they are.

Read `git diff patches/` before committing: each of Planish's fences must have survived. Run the fence check again.

## 3. Build and smoke-test

Push the branch and open the pull request. CI builds macOS on Apple silicon, Windows x64 and Linux x64, checks the build-time edits in `prepare_vscode.sh` with `dev/check_build_edits.sh`, and runs `test/smoke/smoke.sh` on each build; the Fences, Sign-off, zizmor and ecformat checks run too. Read a failure with `gh pr checks` and `gh run view --log-failed`. The usual causes:

- A patch no longer applies: rebase it as in step 2.
- A build-time edit no longer matches VS Code's file: `dev/check_build_edits.sh` names it. Fix the `replace` in `prepare_vscode.sh`'s fence.
- An API under Planish's own extensions or workbench parts changed: the build or smoke test fails there. Fix the code in `extensions/planish-*/` or `contrib/planish*/`.

To build on your own machine, follow [VSCodium's build guide](howto-build.md).

## 4. Check the allow-list of proposed APIs

```sh
python3 -I dev/allow_list.py --write
```

It reads which proposed APIs the Marketplace's 100 most-installed extensions declare in their latest version on Open VSX, and adds what VSCodium's allow-list lacks to Planish's overlay in `patches/user/json/product.json`. It prints the additions as Markdown. If it changed the overlay, open a separate pull request with that output in its body; each addition grants an extension an unfinished API, so a reviewer judges it. It never removes an entry, since Open VSX can hold an older version than the Marketplace, and it takes Planish's own built-in extensions off the list. `--ids FILE` reads the extension IDs from a file instead.

## Moving ahead of VSCodium

Without a VSCodium release to merge, Planish repairs VSCodium's patches itself.

1. Pick VS Code's newest release tag (`git ls-remote --tags https://github.com/microsoft/vscode.git`) and set its tag and commit in `upstream/stable.json`. If VS Code's `.nvmrc` at that tag names a newer Node.js, set it in `.nvmrc` too.
2. Rebase every patch with `dev/update_patches.sh`, as in step 2. Here VSCodium's patches fail too, and each fix is a change to one of VSCodium's patches, marked as in [Changing one of VSCodium's patches](#changing-one-of-vscodiums-patches).
3. If one of VSCodium's delete lists (`patches/*.json`) names a path that no longer exists, the build fails with `Not found`. Planish cannot yet change those lists with fences; say so in the pull request.
4. Build, smoke-test and check the allow-list as in steps 3 and 4.

When VSCodium releases that VS Code version, merge it as in step 1. At each conflict in a patch, take VSCodium's repair and drop Planish's with its fences, unless Planish's is still needed. The fence check's count of upstream files edited should fall back to what it was.

## Changing one of VSCodium's patches

A repair is a change too, and the fence check compares each of VSCodium's patches with VSCodium's version *(decided)*:

- A line the change adds to a VS Code file sits in a fence, as in any upstream file.
- A line VSCodium's version adds that the change drops stays in the patch as a comment in a fence, among the patch's lines for that file.
- A VS Code line VSCodium's version removes stays removed. To keep it, add it back in a fence. If VS Code has changed that line, the repair removes the new line and keeps VSCodium's as a comment in a fence.
- In strict JSON, which holds no comments, keep VSCodium's line and change it with an overlay in `patches/user/json/`. A line holding its file type's comment closer (`*/`, `-->`, or `--` in XML) cannot be kept as a comment either, so it stays.

## The pull request

Its title is "Sync with VSCodium &lt;tag&gt;" (or "Move to VS Code &lt;tag&gt;" ahead of VSCodium). Its body gives the VSCodium and VS Code tags and VSCodium's release date, the fence check's counts before and after, the patches repaired and why, and the CI results.

A coding agent stops and asks the maintainer when a conflict falls inside a fence and its intent is unclear, when a count in the fence report rises, or when a fix would change what a patch does rather than where it applies.
