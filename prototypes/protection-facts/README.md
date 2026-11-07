<!-- SPDX-License-Identifier: Apache-2.0 -->
# Protection facts prototype

A prototype for [#42](https://github.com/BhodiSea/planish/issues/42): it settles what CI and the agents' shipped code and docs can settle of the facts that decide how far the protections reach ([protections.md, What is not known yet](../../docs/spec/protections.md#what-is-not-known-yet)). It is not part of the build. The workflow `.github/workflows/protection-facts.yml` runs it on GitHub's runners.

- `snapshot.mjs` generates a project of 100,020 files (20,000 sources, 80,000 files under `node_modules` and 20 assets of 20 MB, about 1.2 GB), then snapshots it each way the spec names, after each of five commands that edit ten sources and add one.
- `githooks.sh` sets a pre-commit and a pre-push hook through git's configuration, passed in the environment as Planish's session environment would pass it, and checks when they run.
- `extensions.mjs` downloads the agent extensions pinned in `extensions.json` from Open VSX and checks that the code each answer below rests on is there, printing it. Their code is minified, so the patterns hold only for these versions.

## Results

On 6 November 2026, on GitHub's `macos-15` (macOS 15.8.2, image 20261103.629), `macos-26` (macOS 26.6.2, for git only), `windows-2022` and `ubuntu-24.04` runners, with git 2.56.0 and Node 24.18.0.

### Snapshots

Median of five snapshots, each after one command; "unchanged" is a second snapshot with nothing changed. Space is what the first snapshot adds.

| File system | Way | First snapshot | Per command | Unchanged | Space |
|---|---|---|---|---|---|
| APFS | Full copy | 50.8 s | 46.7 s | | 940 MB |
| APFS | Clone (`cp -c`, `clonefile`) | 16.8 s | 17.2 s | | 29 MB |
| APFS | Shadow git, ignored folders left out | 27.5 s | 0.18 s | 0.16 s | 246 MB |
| APFS | Shadow git, everything | 114.5 s | 0.76 s | 0.67 s | 403 MB |
| NTFS | Full copy | 16.8 s | 16.2 s | | 1,016 MB |
| NTFS | Shadow git, ignored folders left out | 32.4 s | 0.10 s | 0.09 s | 81 MB |
| NTFS | Shadow git, everything | 90.6 s | 0.19 s | 0.18 s | 224 MB |
| ext4 | Full copy | 5.0 s | 3.1 s | | 896 MB |
| ext4 | Shadow git, ignored folders left out | 10.0 s | 0.10 s | 0.10 s | 246 MB |
| ext4 | Shadow git, everything | 21.9 s | 0.47 s | 0.27 s | 403 MB |

NTFS and ext4 have no clone (`cp --reflink=always` fails on ext4). The macOS runner varied most between runs: in an earlier run of the same code, a full copy took 20.3 s per command and a clone 9.4 s, while git's per-command cost stayed at 0.1 s. Git for Windows' repository was smaller than the others for the same files, which the prototype does not explain.

- A shadow git repository costs 0.1 to 0.2 s after a typical command on all three file systems, once its first snapshot is taken, because git checks file times and sizes and stores only what changed. That makes a snapshot before every command affordable.
- Taking `node_modules` too costs two to five times as much per command, and the first snapshot two to four times as long.
- A full copy or an APFS clone takes seconds every time, since both visit every file. The clone uses almost no space, but on 100,000 files it takes as long as git's first snapshot, every time.
- Windows Defender scans the runner's files, which slows every way on NTFS; a user's machine may differ.

### Hooks set in git's configuration

| git | Version | pre-commit runs | with `--no-verify` | pre-push runs | with `--no-verify` | Beside the repository's own hook | With `core.hooksPath` set |
|---|---|---|---|---|---|---|---|
| Apple's, macOS 15.8.2, Xcode 16.4 | 2.39.5 (Apple Git-154) | no | no | no | no | own only | no |
| Apple's, macOS 26.6.2, Xcode 26.6 | 2.50.1 (Apple Git-155) | no | no | no | no | own only | no |
| Apple's command line tools, macOS 15.8.2 and 26.6.2 | 2.39.5 and 2.50.1, as Xcode's | no | no | no | no | own only | no |
| Homebrew, macOS | 2.56.0 | yes | no | yes | no | both | yes |
| Linux | 2.56.0 | yes | no | yes | no | both | yes |
| Git for Windows | 2.56.0.windows.4 | yes | no | yes | no | both | yes |

- Apple's git is too old for hooks set in configuration, which git 2.54 added ([githooks](https://git-scm.com/docs/githooks)). The runners' `/usr/bin/git` runs Xcode's git, since `xcode-select` points at Xcode there. A clean Mac gets git from the command line tools instead. On both runners, the tools' own git, `/Library/Developer/CommandLineTools/usr/bin/git`, is the same version as Xcode's, so a clean Mac with the tools for Xcode 26.6 most likely has 2.50.1 too; a test on one would confirm it.
- `--no-verify` skips hooks set in configuration on commit and on push, as it skips the repository's own, so Planish's secret check cannot rest on git's hooks alone.
- Where they run, configured hooks run beside the repository's own and beside a `core.hooksPath` set by tools such as husky.

### What the agent extensions pass on and where they run commands

Read from code (*from code*) at the versions in `extensions.json`; `extensions.mjs` prints each excerpt.

| Extension | Finding |
|---|---|
| Claude Code 2.1.318 | Starts its program with the extension host's environment, with `claudeCode.environmentVariables` on top. |
| Codex 26.51021.22027 | Starts `codex app-server` with the extension host's environment, with VS Code's proxy settings and its own `PATH` on top. |
| Cline 4.1.26 | Runs commands in VS Code's terminals by default (`vscodeTerminalExecutionMode` is `vscodeTerminal`); a setting switches it to running them as child processes of the extension host. |
| Kilo Code 7.8.27 | Runs its agent in its bundled command-line tool, `kilo serve`, started with the extension host's environment and shipped with sandbox helpers of its own (`bwrap` on Linux). Its only terminals are ones the user opens. |

- Planish's session environment therefore reaches Claude Code's and Codex's programs if Planish sets it in the extension host's environment, with no setting from the kit. Whether it then reaches every command those programs run, through Claude Code's sandbox and Codex's `shell_environment_policy`, needs a logged-in run.
- Planish's fence reaches Cline's commands only while Cline uses terminals, and reaches none of Kilo Code's.

### The agents' hooks, from their docs

Read on 6 November 2026.

- **Codex's** `PreToolUse` and `PostToolUse` hooks run for shell commands, edits through `apply_patch` (matched as `apply_patch`, `Edit` or `Write`), MCP tools and other local function tools, but not hosted tools such as web search; "Treat tool hooks as a useful guardrail, not a complete enforcement boundary". A `PreToolUse` hook can deny or rewrite a call; `permissionDecision: "ask"` is "parsed but not supported yet", and an error, time-out or malformed reply lets the tool run. A `PermissionRequest` hook can allow, deny or leave the prompt to the user. Hooks see `permission_mode`. A hook runs only once trusted, which the docs show in the CLI's `/hooks` and the desktop app; managed hooks need no trust ([Codex docs: hooks](https://learn.chatgpt.com/docs/hooks)).
- **Claude Code's** hooks fire "wherever it runs", the IDE extensions included, and run "with Claude Code's environment". Their input carries `permission_mode`. The `PermissionRequest` hook can allow or deny, with the 600-second default time-out of command hooks; the docs do not say whether the dialog waits for it. `dangerouslyDisableSandbox` is a Bash parameter that permission rules can match (an ask rule for `Bash(dangerouslyDisableSandbox:true)`), but the hooks docs do not list it in `tool_input`. Nothing gives `autoAllowBashIfSandboxed` a condition; `--settings` applies per session, but Planish does not start Claude Code ([hooks](https://code.claude.com/docs/en/hooks); [sandboxing](https://code.claude.com/docs/en/sandboxing); [settings](https://code.claude.com/docs/en/settings)).

## What is left

These need a logged-in agent, a clean Mac or the performance budgets, so they are not the prototype's:

- Whether Planish's environment reaches each command Claude Code and Codex run.
- Whether Claude Code's hooks see `dangerouslyDisableSandbox`, whether its permission dialog waits for a `PermissionRequest` hook, and whether its auto-allow can be limited to Planish sessions.
- Whether Codex's turn-end hook runs in the extension, and whether a user can trust a hook there.
- On a clean Mac: which git the command line tools install, and whether a sandbox denial suppresses macOS's privacy prompt.
- Measuring snapshots with the performance budgets, once [#57](https://github.com/BhodiSea/planish/issues/57) has calibrated them: the maintainer has decided that #42's snapshot box waits for #57.

## Limits of the prototype

- The project is generated, so its files compress about as source code does but their layout is regular; a real project's first snapshot may differ.
- The shadow repository is rebuilt from nothing each run, with git's untracked cache on and no file-system monitor; `core.fsmonitor` could make the per-command cost smaller still on large projects.
- Read from code is not run: the extensions may take other paths at runtime, such as Claude Code's terminal mode.
