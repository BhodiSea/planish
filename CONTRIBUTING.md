# Contributing to Planish

Planish is at an early stage, and nothing is usable yet. What it will be is in the [spec](docs/spec/README.md), the order of work is in the [roadmap](docs/roadmap.md), and the settled choices are on the [decisions page](docs/decisions.md).

## Before you start

- Pick an issue from the roadmap, or open one, and say in it what you plan to do.
- To change a decision, open a pull request to [docs/decisions.md](docs/decisions.md) with your evidence. The maintainer's merge makes it the decision.

## Sign off your commits

Every commit carries a `Signed-off-by` line (`git commit -s`). It certifies the [Developer Certificate of Origin](https://developercertificate.org): you wrote the change, or have the right to submit it under the project's licences.

## Licences

- Files that come from VSCodium stay under the MIT licence in [LICENSE](LICENSE).
- New files are under the Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE)) and start with `SPDX-License-Identifier: Apache-2.0`.
- Strict JSON files cannot hold that line, so new ones are listed in [REUSE.toml](REUSE.toml) instead.

## Keep upstream edits few

Planish's own code lives in its own folders. An edit to a file that comes from VS Code or VSCodium is fenced with marker comments, so updates from upstream stay easy to merge. The [fork spec](docs/spec/fork.md) has the rules, and the [sync guide](docs/sync.md) the steps for taking a newer VS Code release.

## AI tools

They are welcome. Say in the pull request which tools you used, and review everything yourself before you submit it: you are responsible for every line.

## Building

Until Planish's own build guide lands, [VSCodium's build guide](docs/howto-build.md) describes the build this repository starts from.

## Conduct and security

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately through the repository's Security tab, not in an issue.
