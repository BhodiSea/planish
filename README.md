# Planish

Planish is an open-source code editor that teaches people to understand what AI agents make for them: the code in their repository, the mathematics in it, and the research papers they publish. It is built from VS Code's open-source code, so it works like the VS Code people know, and it adds two lanes:

- **Learn mode.** Whichever agent someone already runs, the Claude Code or Codex extension or, after the first release, Planish's own sidebar on their API keys, builds a curriculum of their codebase from a fixed set of lesson templates, from first principles and at their level. Planish checks each lesson against the code before showing it.
- **The paper lane.** An author rewrites an AI-drafted paper by hand, or writes first and uses AI only to explain and check, in an editor that reads like a document but edits the paper's own source files, beside an agent that explains anything they do not understand.

## Status

Early, and not yet usable: nothing is built yet, and the spec is a draft. The first release, for macOS on Apple silicon, will have both lanes and default protections against harmful agent actions; Windows and Linux are built in CI from the start and follow once tested. Planish is built in public and led by Cogvera Labs.

## Built on VS Code and VSCodium

This repository is a fork of [VSCodium](https://github.com/VSCodium/vscodium)'s build repository. Its scripts fetch [VS Code's MIT source](https://github.com/microsoft/vscode) at a pinned release, apply VSCodium's patches, which remove Microsoft's branding, telemetry, Marketplace and closed Copilot parts, and then apply Planish's own. Extensions come from [Open VSX](https://open-vsx.org). Planish is not affiliated with Microsoft or with VSCodium.

## Licences

Files from VSCodium keep VSCodium's MIT licence ([LICENSE](LICENSE)), and VS Code's source, which the build fetches, is MIT. New code is Apache-2.0 ([LICENSE-APACHE](LICENSE-APACHE)). Every commit is signed off under the [Developer Certificate of Origin](https://developercertificate.org/) (`git commit -s`); there is no contributor licence agreement.

## The name

To planish is to smooth metal with many light hammer blows until it is true.

## Read more

- [The spec](docs/spec/README.md): what Planish is and how each part works.
- [The roadmap](docs/roadmap.md): what is built first and what follows.
- [Decisions](docs/decisions.md): what the maintainer has settled.
