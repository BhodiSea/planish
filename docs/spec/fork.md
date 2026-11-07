# The fork

How Planish is built from VS Code's source, kept current and released. Marks follow the [front page](README.md).

## The repository

**Decided.** The repository is a fork of [VSCodium's MIT build repository][vscodium] and holds no VS Code source. The build fetches VS Code at a pinned release tag and applies VSCodium's patches, which strip Microsoft's branding, telemetry, Marketplace and closed Copilot parts, then Planish's patches and folders. Planish's edits to upstream files are fenced and kept few. The launcher, URL scheme and other lowercase identifiers are `planish`.

- VSCodium's `get_repo.sh` fetches the tag and commit in `upstream/stable.json`; `prepare_vscode.sh` copies `src/stable/` over the source, merges `product.json` and applies the patches, Planish's from `patches/user/` last. Planish's code lives in folders VS Code lacks, under `src/stable/`: built-in extensions in `extensions/planish-*/` and, only where the extension API falls short, workbench parts in `src/vs/workbench/contrib/planish/browser/`. Rebases cannot conflict there; the build and smoke tests catch API changes underneath.
- Workbench parts are registered in one place: `planish.contribution.ts` in that folder imports each part, and one fenced import in `workbench.common.main.ts` loads it, so a new part edits no VS Code file. A part that Planish's built-in extensions call is reached through an API proposal of Planish's own, `src/vscode-dts/vscode.proposed.planish<Name>.d.ts`, which `product.json` grants to no other extension, so that only built-in extensions can use it; a command would not do, since any extension can run a registered command. A built-in extension must not hand such a part on through a command or its exports, or every extension could use it. Its extension-host side is a few fenced lines in `extHost.api.impl.ts` and `extHost.protocol.ts`, added by a patch in `patches/user/`, and `build.sh` regenerates VS Code's list of proposals before compiling. VSCodium's [build guide][vscodium-build] lists what a machine needs.
- A built-in extension needs no registration, since VS Code's build packages each `extensions/*/package.json` it finds ([source][vscode-ext-build]): its folder `src/stable/extensions/planish-<name>/` is enough. Plain JavaScript ships as written; one that needs compiling adds an `esbuild.mts` and a `tsconfig.json`, as VS Code's own do. It takes no npm dependencies at run time, which would need an edit to VS Code's `build/npm/dirs.ts`. Its tests live in `test/<name>/` and run in CI without a VS Code tree, and the smoke test checks that each platform's app holds it. The first is `planish-learn`, with the lesson schemas and validator ([agent-integration.md](agent-integration.md#the-lesson-contract)).
- `dev/link.sh` prepares a VS Code tree once and links these folders into it for VS Code's watch build: each built-in extension's folder whole, since the extension host loads an extension from its folder's real path, and each workbench file on its own, since VS Code's transpile lists files with glob 7, which does not look inside a linked folder's subfolders. CI's `test/dev/loop.sh` checks on macOS and Linux that an edit reaches the app started from source. Built-in extensions also run on a release build with `--extensionDevelopmentPath`. [CONTRIBUTING.md](../../CONTRIBUTING.md#building) gives both loops.
- Planish's lines in upstream files sit between `--- Start Planish ---` and `--- End Planish ---` comments in each file's comment syntax (`<!-- Start Planish -->` in XML, which bans `--` in comments), as in [Positron][positron-fence]. Removals are fenced too, with the old code kept in the fence as a comment *(decided)*; a line holding its file type's comment closer (`*/`, `-->`, or `--` in XML) cannot be kept so, and stays in place. Strict JSON, such as VS Code's root `package.json`, is changed by a merge script at build time. A VSCodium patch may be disabled as VSCodium does it, by renaming `X.patch`, unchanged, to `X.patch.no`. CI rejects lines added outside a fence, and removed lines not kept as comments in a fence where they were, except lines holding only spaces or tabs and a few places it lists: files Planish deletes or replaces whole, such as images and its own README, the version pins in `upstream/*.json` and `.nvmrc`, and an Electron update's checksum and manifest lines. A line that a change to one of VSCodium's patches drops, repairs included, stays in that patch as a comment in a fence among its lines for that file, and a VS Code line whose removal Planish undoes is still removed and added back in a fence (where VS Code has changed a line VSCodium's patch removes, the repair removes the new line and keeps both it and VSCodium's line as comments in a fence); in strict JSON, which holds no comments, the patch keeps the line and an overlay changes it *(decided)*. A VSCodium file that Planish moves is checked as an edit of the file it was. It also lists the JSON edits and the VS Code files edited at build time, and counts the upstream files edited, as each adds work to every sync. Each patch does one thing and is named for it.
- Planish's names, IDs and URLs replace VSCodium's (in `utils.sh` and in `patches/user/json/product.json`, which `prepare_vscode.sh` merges last), with its own macOS bundle ID and Windows app IDs so it installs beside VSCodium; Microsoft's names and icon may not identify another product ([brand guidelines][brand]).
- Prototypes live in a top-level `prototypes/<name>/` folder, each with its own README and workflow, outside the build *(decided)*.

## Licences and sign-off

**Decided.** VS Code's source is [MIT][vscode-license], files from VSCodium stay [MIT][vscodium-license] under VSCodium's notice, and new code is Apache-2.0. Commits are signed off under the [Developer Certificate of Origin][dco] (`git commit -s`); there is no contributor licence agreement.

New files, Planish's patches included, open with `SPDX-License-Identifier: Apache-2.0`; strict JSON files, which cannot hold it, are listed in `REUSE.toml` instead. Upstream files keep their MIT notice, with Planish's lines fenced. The app ships both licences and the third-party notices. CI refuses commits new to Planish without a sign-off, which keeps the contributor's name and email in the history for good; VSCodium's commits, which each sync brings in, are exempt *(decided)*.

## Keeping up with upstream

**Decided.** Planish rebases onto each VS Code release that VSCodium adopts, and moves to a newer one itself once 8 weeks behind upstream or when its Electron nears end of life. It builds release tags only, never upstream's `main`.

VS Code has released weekly since [1.111][v1111] on 9 March 2026; from May to October 2026, VSCodium released on five of those versions, 2 to 9 weeks apart ([releases][vscodium-releases]).

- "Nears" means within four weeks of the end date on [Electron's schedule][el-sched]. Electron supports its three newest major versions ([timelines][el-timelines]); VS Code 1.144.0 ships Electron 43.8.3 ([.npmrc][npmrc-1144]), whose support is scheduled to end on 5 January 2027.
- Keeping VSCodium's history makes taking its changes a git merge; Planish's patches are then rebased with `dev/update_patches.sh`, tested, and shipped within two weeks of VSCodium's release. Ahead of VSCodium, Planish repairs VSCodium's patches itself, then takes VSCodium's repairs when VSCodium catches up. A [guide](../sync.md) sets out these steps for a person or a coding agent, like Positron's [upstream merge skill][positron-skill].

## Microsoft's agent stack

**Decided.** Planish deletes Microsoft's closed agent parts as VSCodium does and keeps VS Code's MIT chat UI hidden. The in-house sidebar is a view of its own ([agent-integration.md](agent-integration.md#the-in-house-sidebar)).

At VS Code 1.144.0, four agent parts are not open source: the Copilot CLI, redistributable only unmodified ([licence][copilot-cli-lic]); `@vscode/copilot-api`, licensed for Microsoft's products and, for Code - OSS, "for development purposes only" ([licence][copilot-api-lic]); Anthropic's Claude Agent SDK, all rights reserved ([licence][claude-sdk-lic]); and the Copilot SDK's runtime binaries, with no public source. VSCodium removes them with a [delete list][vscodium-52] and a [patch][vscodium-53], and [hides chat by default][vscodium-00]. The chat UI, Agents window and agent host each changed by tens of thousands of lines from 1.143.0 to 1.144.0 ([comparison][compare]), so Planish leaves them unedited: hidden, they cost nothing, while a patch stripping them would conflict weekly. Deletion also removes upstream's providers for models on the user's own key, which the in-house sidebar replaces after the first release *(decided)*.

Whether extensions that give the hidden chat language-model tools or MCP server definitions still work is *(unknown)* ([agent-integration.md](agent-integration.md#unknowns)).

## Extensions

**Decided.** The promise, word for word:

> Runs the VS Code extensions you already use, from Open VSX or any .vsix you are licensed to use; for Microsoft's few extensions licensed only for its products, we list open replacements. An extension that works in VS Code at the same version but not here is a bug.

Looked up by ID on 4 November 2026, 85 of the Marketplace's 100 most-installed extensions were on Open VSX, 71 at their latest version; all 15 missing are Microsoft's or GitHub's. Open VSX can lag: it had Microsoft's Python extension at [2026.4.0][ovsx-python], against 2026.10.0 on the Marketplace.

- A scheduled CI job installs those 100 where it can, in Planish and in VS Code at the same version, checks each activates without errors on a sample file, and publishes the results, coverage figures and counting script. One that passes in VS Code and fails in Planish is a bug.
- Open-source extensions missing or behind on Open VSX are raised with their publisher or proposed for the Eclipse Foundation's [publish-extensions][publish-extensions], which publishes them there.
- **Unknown.** Whether VS Code offers the newest compatible version from Open VSX when the latest needs a newer VS Code, which sets what lagging upstream costs.

### Proposed APIs

These are VS Code's unfinished extension APIs. An extension that is not built in may use one only if `product.json` allows it, and otherwise runs without it; a built-in extension uses those it declares, unless a `product.json` entry replaces its list ([source][proposed-api]). In the same count, 15 of the 100 most-installed extensions declared some.

Planish starts from VSCodium's MIT allow-list of 65 entries ([product.json][vscodium-product]), which includes the two Codex declares, `chatSessionsProvider` and `languageModelProxy`, and keeps its own built-in extensions off it. At each sync a script, `dev/allow_list.py`, compares the list with what the most-installed extensions declare on Open VSX and proposes additions as pull requests.

### Stand-ins for Microsoft's extensions

**Decided.** When a file type calls for one, Planish recommends an open stand-in for a Microsoft extension licensed only for Microsoft's products, and bundles none. The first four rows are decided; the rest are proposed.

| Microsoft extension | Open stand-in |
|---|---|
| Pylance | [basedpyright][basedpyright] |
| C/C++ | [clangd][clangd], with [CodeLLDB][codelldb] for debugging |
| Remote - SSH | [open-remote-ssh][open-remote-ssh] |
| WSL | [open-remote-wsl][open-remote-wsl] |
| C# and C# Dev Kit | Partial: a [free C# extension][csharp] with Samsung's open debugger in place of Microsoft's licensed one |
| Live Share | Partial: [Open Collaboration Tools][oct] |
| Dev Containers | Partial: only the open [command-line tool][devcontainers-cli] |
| Copilot | Claude Code and Codex; the in-house sidebar after the first release *(decided)* |
| IntelliCode, VS Code Speech | None |

Recommendations name only extensions on Open VSX under a verified publisher, so none can point at a name an attacker could claim. The [first-run import](README.md#3-familiar-to-vs-code-cursor-and-antigravity-users) finds each extension by ID on Open VSX and installs nothing until the user confirms the list, which shows each Microsoft-only extension's stand-in. Whether Cursor's and Antigravity's settings folders import unchanged is *(unknown)*.

### Claude Code and Codex

- In August 2025 the malicious-extension list Open VSX forks use flagged Claude Code's ID after a malware report, and those forks uninstalled the genuine extension automatically ([claude-code#5762][cc-5762]; [the change][pe-945]). Planish's own list takes reviewed overrides to stop that.
- Each release records a tested version of each extension, with its SHA-256, and offers it in one step when a newer one breaks. Planish points at those versions on Open VSX rather than hosting copies: Claude Code's licence reserves all rights ([Open VSX][ovsx-claude]), and Codex's refers to a licence file of its own ([Open VSX][ovsx-codex]).
- Open VSX lists each Codex build twice: as a release and, with a higher version number, as a pre-release (26.1021.22027 and 26.51021.22027, both of 26 October 2026). In Planish's CI on 6 November 2026, installing Codex without a version gave the newest release, and `--update-extensions` kept each install on its channel: a release moved to the newest release, and a pre-release installed with `--pre-release` to the newest pre-release. Codex also installs `openai.codex-audio`. CI repeats these steps for both extensions on every platform (`test/smoke/agents.sh`).

## Services Microsoft runs

Code - OSS leaves out most services Microsoft's build relies on; VSCodium points the rest elsewhere or turns them off.

| Service | Microsoft's build | Planish |
|---|---|---|
| Extension registry | Visual Studio Marketplace, closed to forks ([FAQ][vsc-faq]) | **Decided.** [Open VSX][openvsx], as VSCodium sets it |
| Telemetry, experiments, crash reports | Microsoft's services | **Decided.** Removed, as in VSCodium; Planish adds none ([front page](README.md#principles-behind-every-design-choice)) |
| Malicious-extension list | Microsoft's | Planish's own: the [Eclipse Foundation's list][eclipse-list], which VSCodium uses, plus reviewed overrides |
| Extension signatures | Microsoft's verifier, [licensed][vsce-sign-lic] only for its products | Not checked, as in [VSCodium][vscodium-sig]; whether an open verifier can check Open VSX's is *(unknown)* |
| GitHub sign-in | Microsoft's GitHub app | Planish's own GitHub app; VSCodium falls back to personal access tokens ([doc][vscodium-auth]) |
| Updates | Microsoft's update service | VSCodium's updater ([below](#build-release-and-updates)) |
| Settings Sync | Microsoft's sync service | None at first; profiles export to a file. An author moves a paper between their machines by exporting its provenance log, with the device's copy of the AI draft, as one local file and importing it there; it is never uploaded *(decided; [paper.md](paper.md#provenance))* |
| Webview origin | Local `vscode-webview://` on desktop ([source][webview-desktop]); Microsoft's `vscode-cdn.net` when browser-served ([source][webview-browser]) | Desktop unchanged; no browser-served build, since Planish runs on the user's computer ([front page](README.md#what-it-is-not)) |

## How the interface is built

Learn mode is a built-in extension on VS Code's extension API: comments and decorations for tours and review markers, tree views, a status-bar item, quick picks and a walkthrough. These add no process, inherit theming, keybindings and accessibility, and count in VS Code's own startup and typing measurements; VS Code's [guidelines][webview-ux] say to use a webview only "when absolutely necessary". Each part beyond the extension API is listed here with its reason:

| Part | Why |
|---|---|
| Workbench part opening Claude Code's and Codex's links without the confirmation question, for built-in extensions only | Only workbench code can skip the question, and only an API proposal keeps other extensions from asking it to ([agent-integration.md](agent-integration.md#claude-code-and-codex)) |
| Workbench resolver opening papers in the preview from a list kept on the device | Extensions claim files only by pattern ([paper.md](paper.md#the-editor)) |
| The paper editor, a webview *(decided)* | VS Code's editor cannot hide part of a line ([paper.md](paper.md#the-editor)) |
| One shared webview type, for maths and diagrams | Native parts cannot draw them |

Diagrams come from the template catalogue's Mermaid template, which agents fill as text, and render in this shared webview, sandboxed *(decided)*. It starts when first needed, keeps one origin and so one process, drops hidden views, caps how many are open and blocks remote scripts, images, fonts and frames with a strict content policy.

**Unknown.** Read from VS Code's source, each webview type gets its own origin and so its own Chromium renderer process ([process model][chromium-pm]). The memory this costs on Electron 43 is unmeasured; counting renderer processes as panels open settles it.

## Indexing

- The index that tells learn mode where things are defined and what calls what ([learn.md](learn.md)) runs in its own process, never a window's renderer or the shared extension host: at first, a built-in extension's child process, as with a language server. It searches with the ripgrep VS Code's search uses, asks running language servers for references scoped to the lesson in hand, takes file changes from VS Code's watcher, and skips dependency and build-output folders such as `node_modules`. VS Code's watcher and search settings stay as shipped.
- A fuller index, an n-gram index on disk plus the definitions, imports and calls that [tree-sitter][tree-sitter] extracts into an embedded database, is built only if the code-search budget fails on a real repository. Its graph is also the fallback if scoped language-server queries are too slow for learn mode's links ([learn.md](learn.md#placement)).
- **Unknown.** tree-sitter's speed, and the index's size, on a million-file repository.

## Running code

- Code stations and their answer keys, tests, numeric maths checks, re-keying after code changes and the paper lane's generated tests run the user's code only in a trusted workspace, in the operating system's sandbox: no network, writes only to a copy-on-write clone of the working tree (APFS on macOS) deleted afterwards, time and memory limits, and the project's own toolchain. The first release offers code stations only where Planish detects the build and test commands or the learner confirms them.
- A [prototype](../../prototypes/macos-sandbox/README.md) runs a command on an APFS clone (`cp -c`) in the user's temporary folder, under a Seatbelt profile through `/usr/bin/sandbox-exec`, with only named environment variables and with reads of usual credential locations, such as `~/.ssh`, denied; a supervisor stops it at its time or memory limit, since macOS does not enforce `RLIMIT_AS`, and then kills its processes, found by process group, parentage and a marker in their environment. A process that leaves the process group and clears its environment escapes the supervisor, though not Seatbelt. On GitHub's macOS 15 runner, 11 of 12 pinned public projects (Node, Python, Go and Rust) passed their tests without the sandbox; 9 of those passed with no network, and all 11 with loopback allowed: Express's and Gin's tests start a server on a loopback port. Clones took at most 2.6 s. Detection matched each project's own test command, and asked to confirm the two that also have a Makefile.
- The [Codex CLI][codex-cli]'s sandbox (Seatbelt through `sandbox-exec` on macOS, which Apple marks deprecated; bubblewrap, Landlock and seccomp on Linux) was reviewed: Planish reuses its Seatbelt rules, which are Apache-2.0, but not its Rust code, which is built around Codex's own policy and proxy types and has no clone, time or memory limits.
- **Decided.** Loopback is refused by default, and the learner may allow it for one project, with a warning: 2 of the 11 projects need it, and Seatbelt cannot tell the run's own server from the device's others, such as a local database, to which a test could also hand what it reads. macOS comes first *(decided)*.
- **Unknown.** How far reads must be denied. A run's output reaches the learner's agent and its model provider as the answer key, so a test that prints a credential sends it off the device; the prototype denies the usual credential locations, but no list is complete.

## Performance

The [front page](README.md#2-fast-on-very-large-codebases) commits to no regression with learning features off and to these budgets with them on; a prototype calibrates the figures. Rows compare with the same VS Code release built without Planish's changes, on the same machine, unless they say otherwise.

| Area | Measure | Budget |
|---|---|---|
| Startup | VS Code's `ellapsed` mark (its spelling), median of 10 or more [vscode-perf][vscode-perf] runs | At most 5% slower |
| Extensions ready | `ellapsedExtensionsReady`; no Planish extension activates at startup | At most 5% slower |
| Typing | VS Code's [input latency][input-latency] in a large TypeScript file, read from the `inputlatency` measures the editor records for every key press, whatever the sampling setting | 95th percentile at most 16.7 ms (one frame at 60 Hz), aiming for 8.3 ms |
| Paper editor typing | Key press to next painted frame, timed in the webview by an instrument Planish builds | As for typing *(unknown until the instrument exists)* |
| Main thread | Long tasks from Planish's code while typing or scrolling | None |
| Agent and lesson panels | Scenarios for Planish's Learn views and sidebar, modelled on VS Code's [chat performance scenarios][chat-perf] (mock model, repeated runs) | Within 20% of the previous release |
| Leaks | Heap and DOM growth after repeated open, stream and close | At most 5 MB of steady growth |
| Idle memory, million-file repository | Memory Planish's processes add, panels closed | At most 1.5 GB, the index at most 1 GB |
| Code search | Query time; time until an agent's edits are searchable | Median at most 100 ms, 99th percentile at most 1 s; edits within 1 s |

- Pull requests fail on a breach of the startup, typing, main-thread, panel or leak rows against a baseline built once per VS Code tag, or when startup or typing with learning features off differs beyond the measured run-to-run spread; nightly runs check idle memory with them off the same way. Large-repository rows run nightly on a generated repository sized for a standard runner, and before each release on a real million-file one, on a machine the release checklist names; each release publishes its results. VS Code's performance tools and chat scenarios are MIT, so Planish adapts them.
- Agent transcripts and diffs stay out of the window's memory beyond what is on screen.
- **Measured.** GitHub's shared runners are not steady enough to show a 5% change. On `macos-15` runners, in 9 rounds on three runners (PR #91), each comparing a 10-start median and a 300-key 95th percentile, VSCodium differed from itself by up to 13.5% in startup and 9.0% in typing, and Planish, which then differed from it only in names, from VSCodium by up to 24.6% and 11.4%. Of the 18 comparisons of each measure, one startup difference passed 15% and none in typing passed 12%, so those are the limits; comparing Planish with the mean of the two baseline measures, as CI does, narrows the difference further. Startup medians were 1.3–2.1 s and typing 95th percentiles 21–26 ms, above the 16.7 ms budget for VSCodium too, so the typing budget's figure is for [#57](https://github.com/BhodiSea/planish/issues/57) to set on steadier hardware. Each pull request adds two macOS jobs: the baseline's cache lookup, about a minute (a build of about two hours on a miss), and the measurement, about 17 minutes, or 34 with a repeat.
- **How CI measures it.** In `ci.yml`, `test/perf/perf.mjs` compares the macOS arm64 build with a baseline: VSCodium built at the commit Planish last synced, which is the same VS Code tag without Planish's changes, built once and cached for that commit. It measures the baseline twice and Planish once, taking turns, so each report shows the spread of identical builds beside Planish's difference from their mean. Startup is the median of 10 `ellapsed` marks written by `--prof-append-timers`, as vscode-perf reads them, after a warm-up start. Typing is the 95th percentile of 300 key presses' `inputlatency` measures, read in the window through the DevTools protocol while it types into a comment in the middle of a generated TypeScript file of about 22,000 lines. A round in which Planish differs from the baseline by more than 15% in startup or 12% in typing is repeated once, and the job fails when the repeat differs too. A round takes about 17 minutes.

## Security

**Decided.** The first release ships default protections against agent actions users do not want: at least their blocks, confirmations and clean-ups; the turn review's reports and the opt-in packs can follow. Their spec is [protections.md](protections.md).

### Workspace Trust

**Decided.** Workspace Trust stays on, and untrusted folders stay in Restricted Mode, which disables or limits AI agents, the terminal, tasks, debugging, workspace settings and extensions ([docs][trust-docs]).

The trust prompt lists what in the folder can run code or redirect a request: tasks, settings that name a program, agent configuration such as `.claude/`, `.env` files and Git hooks. Such files have acted before the prompt: a project setting once made Claude Code send the user's API key to an attacker before it appeared ([CVE-2026-21852][cve-21852]).

### The agent that builds lessons

**Decided.** Learn mode teaches only repositories the user trusts until the in-house sidebar's agent is shown to be confined: read-only, reaching only its model. A confined learn agent for untrusted repositories is on the [roadmap](../roadmap.md).

Confined means the agent loads no project configuration, plugins or other MCP servers and has no terminal; it reads the workspace and writes only lessons, through the lesson tools; and an operating-system sandbox lets it reach only its provider, at an address no workspace setting can change. Whether the engine can be confined so is *(unknown)*: OpenCode, the default, loads plugins from a project's `.opencode/plugins/` at startup and merges a project's `opencode.json`, which can set a provider's `baseURL` ([plugins][opencode-plugins]; [config][opencode-config]). Until a prototype shows it can, the sidebar declares no support for untrusted workspaces ([guide][trust-api]), as Claude Code does ([docs][cc-vscode]).

### API keys

Keys the user adds to Planish, for its own model calls and the in-house sidebar, live in VS Code's [SecretStorage][secret-storage], encrypted by Electron's [safeStorage][safestorage] (macOS Keychain, Windows DPAPI or a Linux secret store), never in settings or workspace files. Planish's own calls send each key only to its provider.

- Extensions run with the editor's permissions ([VS Code docs][runtime-sec]), so one extension's secrets cannot be hidden from another, and DPAPI does not protect against other programs the same user runs.
- On Linux without a secret store, safeStorage falls back to a hard-coded password; detecting that needs support VS Code does not give extensions *(unknown)*, and Linux releases come later *(decided)*.
- **Unknown.** Whether raw keys can be kept out of agent processes, and an agent's project configuration stopped from redirecting a key; a relay that would do both is under [agent-integration.md](agent-integration.md#unknowns). For the sidebar it can only live in the sidebar's own extension, which makes no core patch *(decided)*.

### Extension installs and updates

Planish keeps VSCodium's 48-hour wait before automatic extension updates (`extensions.minReleaseAge`, [patch][vscodium-12]), VS Code's prompt to trust a publisher on first install, and its `extensions.allowed` setting, with which an organisation limits what can be installed ([docs][ext-allowed]). An update that adds an `extensionPack` or `extensionDependencies` entry asks for consent, as a new install does: between 31 January and 13 March 2026, at least 72 Open VSX extensions were published harmless and later updated with such an entry, so the editor installed a malware loader without asking ([CSA][csa]).

### Electron and Chromium

**Decided.** Fixes for Chromium bugs exploited in the wild ship within days.

Planish follows [Chrome's release notes][chrome-releases], which say when an exploit is in the wild, and Electron's releases. If upstream VS Code has not shipped the fixed Electron within days, Planish raises the Electron version itself, as VSCodium has with a [patch][vscodium-electron] to the pinned version and its checksums, to any newer release within VS Code's Electron major version *(decided)*. Each release note states the VS Code tag and the Electron and Chromium versions.

## Build, release and updates

**Decided.** Planish is built in public. The first release, with both lanes ([order of work](README.md#order-of-work)), is for macOS on Apple silicon, tested by hand; CI builds Windows and Linux from the start, and each is released once tested. Releases are signed as Cogvera Labs, on macOS through the [Apple Developer Program][apple-enroll] as an organisation and on Windows with [Azure Artifact Signing][azure-signing]; development builds stay unsigned until releases begin.

- Planish's own `ci.yml` builds all three platforms on GitHub's standard runners, with no secrets; VSCodium's build and release workflows are deleted, and each sync keeps them deleted *(decided)*. Outside contributors' pull-request workflows run only once a maintainer approves them ([GitHub docs][gh-fork-approval]), and VSCodium's [zizmor][zizmor] check of the workflows stays.
- Signing secrets live in a GitHub [environment][gh-env] used only by release jobs, which start from a release tag or by hand and need the maintainer's approval; pull-request CI never sees them. An over-scoped build token once let an attacker ship code in an Amazon Q extension release ([AWS][aws-q]). Planish's `release.yml` builds the app for Apple silicon and the servers for macOS and Linux, checks the app's server URL against them, and drafts a release for the maintainer to publish. On a release tag its macOS job runs in the `release` environment and waits for the maintainer's approval, and it signs nothing until that environment holds the signing secrets; run on a branch, or on a pull request that changes it, it publishes nothing.
- macOS releases are notarised as well as signed. Every release publishes, as VSCodium's do, SHA-256 checksums and the server open-remote-ssh installs on the remote machine, without which that stand-in fails.
- Updates use VSCodium's updater, which reads a small versions file and downloads from GitHub Releases ([patch][vscodium-11]). It offers a release only once it is 120 hours old ([patch][vscodium-12]); Planish keeps the wait but lets a release marked as a security fix through at once.
- Release builds turn the updater on, and `product.json` points it at a `versions` branch of this repository, which holds only `stable/darwin/arm64/latest.json` *(decided)*. When the maintainer publishes a release, `versions.yml` writes that file with `dev/versions.py`, from the release's tag, publication time and checksum, using only the workflow's own token; drafts and pre-releases are not offered, nor a release older than the one offered. A release is a security fix when a line of its notes starts `Security fix:` *(decided)*; the file then sets `securityFix`, and a patch of Planish's lets such a release through without the wait. A release published within a security fix's wait is let through too, as it holds that fix *(decided)*; its file names the fix in `heldFix`, so the wait is counted from the fix and a rerun keeps the mark. Rerunning `versions.yml` by hand rewrites a release's file after its notes change.
- The steps for raising Electron's version, with `dev/update_electron.py`, are in [electron.md](../electron.md).

[vscodium]: https://github.com/VSCodium/vscodium "VSCodium build repository, MIT"
[vscodium-build]: https://github.com/VSCodium/vscodium/blob/master/docs/howto-build.md "VSCodium: How to build"
[vscode-ext-build]: https://github.com/microsoft/vscode/blob/1.143.1/build/lib/extensions.ts "VS Code 1.143.1: build/lib/extensions.ts"
[positron-fence]: https://github.com/posit-dev/positron/blob/main/src/vs/workbench/api/common/extHostRequireInterceptor.ts "Positron: fenced edits in an upstream file"
[brand]: https://code.visualstudio.com/brand "Visual Studio Code icons and names usage guidelines"
[vscode-license]: https://github.com/microsoft/vscode/blob/main/LICENSE.txt "Code - OSS licence"
[vscodium-license]: https://github.com/VSCodium/vscodium/blob/master/LICENSE "VSCodium licence"
[dco]: https://developercertificate.org/ "Developer Certificate of Origin 1.1"
[v1111]: https://code.visualstudio.com/updates/v1_111 "VS Code 1.111 release notes, 9 March 2026"
[vscodium-releases]: https://github.com/VSCodium/vscodium/releases "VSCodium releases"
[el-sched]: https://releases.electronjs.org/schedule "Electron release schedule"
[el-timelines]: https://www.electronjs.org/docs/latest/tutorial/electron-timelines "Electron release timelines and support policy"
[npmrc-1144]: https://github.com/microsoft/vscode/blob/1.144.0/.npmrc "VS Code 1.144.0: pinned Electron version"
[positron-skill]: https://github.com/posit-dev/positron/tree/main/.claude/skills/merge-upstream-vscode "Positron: upstream merge skill"
[copilot-cli-lic]: https://cdn.jsdelivr.net/npm/@github/copilot@1.0.73/LICENSE.md "@github/copilot 1.0.73 licence"
[copilot-api-lic]: https://cdn.jsdelivr.net/npm/@vscode/copilot-api@0.5.2/LICENSE "@vscode/copilot-api 0.5.2 licence"
[claude-sdk-lic]: https://cdn.jsdelivr.net/npm/@anthropic-ai/claude-agent-sdk@0.3.304/LICENSE.md "@anthropic-ai/claude-agent-sdk 0.3.304 licence"
[vscodium-52]: https://github.com/VSCodium/vscodium/blob/master/patches/52-ext-copilot-remove-it.json "VSCodium: Copilot delete list"
[vscodium-53]: https://github.com/VSCodium/vscodium/blob/master/patches/53-ext-copilot-remove-it.patch "VSCodium: Copilot removal patch"
[vscodium-00]: https://github.com/VSCodium/vscodium/blob/master/patches/00-copilot-fix-action-condition.patch "VSCodium: chat hidden by default"
[compare]: https://github.com/microsoft/vscode/compare/1.143.0...1.144.0 "VS Code 1.143.0 to 1.144.0"
[openvsx]: https://open-vsx.org "Open VSX Registry"
[vsc-faq]: https://code.visualstudio.com/docs/supporting/faq "VS Code FAQ"
[ovsx-python]: https://open-vsx.org/extension/ms-python/python "Open VSX: Python"
[publish-extensions]: https://github.com/EclipseFdn/publish-extensions "Eclipse Foundation: publish-extensions"
[proposed-api]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/common/extensionsProposedApi.ts "VS Code: extensionsProposedApi.ts"
[vscodium-product]: https://github.com/VSCodium/vscodium/blob/master/product.json "VSCodium product.json"
[basedpyright]: https://open-vsx.org/extension/detachhead/basedpyright "Open VSX: basedpyright"
[clangd]: https://open-vsx.org/extension/llvm-vs-code-extensions/vscode-clangd "Open VSX: clangd"
[codelldb]: https://open-vsx.org/extension/vadimcn/vscode-lldb "Open VSX: CodeLLDB"
[open-remote-ssh]: https://open-vsx.org/extension/jeanp413/open-remote-ssh "Open VSX: open-remote-ssh"
[open-remote-wsl]: https://open-vsx.org/extension/jeanp413/open-remote-wsl "Open VSX: open-remote-wsl"
[csharp]: https://open-vsx.org/extension/muhammad-sammy/csharp "Open VSX: free C# extension with NetCoreDbg"
[oct]: https://open-vsx.org/extension/typefox/open-collaboration-tools "Open VSX: Open Collaboration Tools"
[devcontainers-cli]: https://github.com/devcontainers/cli "Dev Containers command-line tool"
[cc-5762]: https://github.com/anthropics/claude-code/issues/5762 "anthropics/claude-code#5762, August 2025"
[pe-945]: https://github.com/EclipseFdn/publish-extensions/pull/945 "EclipseFdn/publish-extensions#945, 13 August 2025"
[ovsx-claude]: https://open-vsx.org/extension/anthropic/claude-code "Open VSX: Claude Code"
[ovsx-codex]: https://open-vsx.org/extension/openai/chatgpt "Open VSX: Codex"
[eclipse-list]: https://github.com/EclipseFdn/publish-extensions/blob/master/extension-control/extensions.json "Eclipse Foundation: malicious and deprecated extensions"
[vsce-sign-lic]: https://cdn.jsdelivr.net/npm/@vscode/vsce-sign@2.1.0/LICENSE.txt "@vscode/vsce-sign licence"
[vscodium-sig]: https://github.com/VSCodium/vscodium/blob/master/patches/00-extension-disable-signature-verification.patch "VSCodium: signature verification off"
[vscodium-auth]: https://github.com/VSCodium/vscodium/blob/master/docs/accounts-authentication.md "VSCodium: accounts and authentication"
[webview-desktop]: https://github.com/microsoft/vscode/blob/1.144.0/src/vs/workbench/services/environment/electron-browser/environmentService.ts#L111-L112 "VS Code 1.144.0: desktop webview endpoint"
[webview-browser]: https://github.com/microsoft/vscode/blob/1.144.0/src/vs/workbench/services/environment/browser/environmentService.ts#L240-L250 "VS Code 1.144.0: browser webview endpoint"
[webview-ux]: https://code.visualstudio.com/api/ux-guidelines/webviews "VS Code UX guidelines: webviews"
[chromium-pm]: https://github.com/chromium/chromium/blob/main/docs/process_model_and_site_isolation.md "Chromium: process model and site isolation"
[tree-sitter]: https://tree-sitter.github.io/tree-sitter/ "tree-sitter"
[codex-cli]: https://github.com/openai/codex "Codex CLI"
[vscode-perf]: https://github.com/microsoft/vscode-perf "microsoft/vscode-perf"
[input-latency]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/performance/browser/inputLatencyContrib.ts "VS Code: input latency recorder"
[chat-perf]: https://github.com/microsoft/vscode/blob/main/.github/workflows/chat-perf.yml "VS Code: chat performance workflow"
[trust-docs]: https://code.visualstudio.com/docs/editing/workspaces/workspace-trust "VS Code docs: Workspace Trust"
[cve-21852]: https://www.tenable.com/cve/CVE-2026-21852 "CVE-2026-21852"
[opencode-plugins]: https://opencode.ai/docs/plugins/ "OpenCode docs: plugins"
[opencode-config]: https://opencode.ai/docs/config/ "OpenCode docs: config"
[trust-api]: https://code.visualstudio.com/api/extension-guides/workspace-trust "VS Code extension guide: Workspace Trust"
[cc-vscode]: https://code.claude.com/docs/en/vs-code "Claude Code docs: VS Code"
[secret-storage]: https://code.visualstudio.com/api/references/vscode-api#SecretStorage "VS Code API: SecretStorage"
[safestorage]: https://www.electronjs.org/docs/latest/api/safe-storage "Electron: safeStorage"
[runtime-sec]: https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security "VS Code docs: extension runtime security"
[csa]: https://labs.cloudsecurityalliance.org/research/csa-research-note-glassworm-open-vsx-transitive-dependency-a/ "Cloud Security Alliance, 16 March 2026"
[ext-allowed]: https://code.visualstudio.com/docs/configure/extensions/extension-marketplace "VS Code docs: Extension Marketplace"
[chrome-releases]: https://chromereleases.googleblog.com/ "Chrome Releases"
[vscodium-electron]: https://github.com/VSCodium/vscodium/blob/master/patches/00-build-update-electron.patch.no "VSCodium: Electron patch-version update"
[gh-fork-approval]: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/approving-workflow-runs-from-public-forks "GitHub docs: approving workflow runs from forks"
[gh-env]: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment "GitHub docs: environments"
[zizmor]: https://github.com/zizmorcore/zizmor "zizmor"
[aws-q]: https://aws.amazon.com/security/security-bulletins/AWS-2025-015/ "AWS security bulletin AWS-2025-015"
[apple-enroll]: https://developer.apple.com/support/enrollment/ "Apple Developer Program enrolment"
[azure-signing]: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart "Azure Artifact Signing quickstart"
[vscodium-11]: https://github.com/VSCodium/vscodium/blob/master/patches/11-update-use-github-release.patch "VSCodium: updates from GitHub Releases"
[vscodium-12]: https://github.com/VSCodium/vscodium/blob/master/patches/12-update-add-cooldown.patch "VSCodium: update cooldowns"
