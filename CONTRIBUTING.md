# Contributing to Planish

Planish is at an early stage, and nothing is usable yet. What it will be is in the [spec](docs/spec/README.md), the order of work is in the [roadmap](docs/roadmap.md), and the settled choices are on the [decisions page](docs/decisions.md).

## Before you start

- Pick an issue from the roadmap, or open one, and say in it what you plan to do.
- To change a decision, open a pull request to [docs/decisions.md](docs/decisions.md) with your evidence. The maintainer's merge makes it the decision.

## Sign off your commits

Every commit carries a `Signed-off-by` line (`git commit -s`). It certifies the [Developer Certificate of Origin](https://developercertificate.org): you wrote the change, or have the right to submit it under the project's licences. CI's Sign-off check refuses a pull request with a commit that lacks it.

## Licences

- Files that come from VSCodium stay under the MIT licence in [LICENSE](LICENSE).
- New files are under the Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE)) and start with `SPDX-License-Identifier: Apache-2.0`.
- Strict JSON files cannot hold that line, so new ones are listed in [REUSE.toml](REUSE.toml) instead.

## Where Planish's code lives

- `src/stable/extensions/planish-*/`: Planish's built-in extensions, with their tests in `test/<name>/`. Most of Planish is here.
- `src/stable/src/vs/workbench/contrib/planish/browser/`: workbench parts, only where the extension API falls short.
- `patches/user/`: Planish's patches to VS Code, applied after VSCodium's, with JSON overlays in `patches/user/json/`.

The build copies `src/stable/` over VS Code's source, so these folders are new to VS Code and rebases cannot conflict there. The [fork spec](docs/spec/fork.md#the-repository) says how each is registered.

## Keep upstream edits few

An edit to a file that comes from VS Code or VSCodium is fenced with marker comments, so updates from upstream stay easy to merge; the [fork spec](docs/spec/fork.md#the-repository) has the rules. Before you push, run the fence check and its tests:

```sh
git fetch --no-tags https://github.com/VSCodium/vscodium.git master:refs/vscodium/master
python3 -I -B dev/check_fences.py refs/vscodium/master
python3 -I -B -m unittest discover --start-directory dev --pattern 'test_*.py'
```

## AI tools

They are welcome. Say in the pull request which tools you used, and review everything yourself before you submit it: you are responsible for every line.

## Building

A full build takes an hour or more. You rarely need one: CI builds every pull request for macOS, Windows and Linux, and keeps each platform's app for seven days under the run's artifacts. Use one of the two loops below instead.

### A built-in extension on a release build

Start a Planish build with the extension's folder in the repository; it replaces the copy the app ships:

```sh
planish --extensionDevelopmentPath="$PWD/src/stable/extensions/planish-learn"
```

After an edit, run **Developer: Reload Window**. If the log says the extension cannot use an API proposal, add `--enable-proposed-api planish.planish-learn`: a release build gives proposals unasked only to extensions it ships or its `product.json` lists. The extension's tests run without the app, in `test/<name>/`.

### Everything, from source

This loop runs VS Code from its source with Planish's folders linked in, so edits to workbench parts reach the app too. It needs what [VSCodium's build guide](docs/howto-build.md) lists for a machine, and works on macOS and Linux; on Windows, use the loop above.

```sh
dev/link.sh                       # once: fetches and prepares vscode/, then links Planish's folders into it
cd vscode
npm run watch-client-transpile    # leave running; it recompiles each file you save
./scripts/code.sh                 # in another terminal
```

After an edit in `src/stable/`, run **Developer: Reload Window**. Run `dev/link.sh` again after adding or removing a file there, and `dev/link.sh -f` after changing a patch, which prepares `vscode/` from scratch. VS Code's own `npm run watch` fails here, as it also watches the Copilot extension VSCodium removes; `npm run watch-client` type-checks as you go, and `npm run watch-extensions` compiles extensions that need it. CI runs this loop on macOS and Linux (`test/dev/loop.sh`).

For a full build on your machine, `dev/build.sh` does what CI does.

## Conduct and security

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately through the repository's Security tab, not in an issue.
