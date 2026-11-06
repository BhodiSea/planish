<!-- SPDX-License-Identifier: Apache-2.0 -->
# macOS sandbox prototype

A prototype for [#17](https://github.com/BhodiSea/planish/issues/17): it runs a project's tests the way code stations will ([fork.md, Running code](../../docs/spec/fork.md#running-code)). It is not part of the build; learn mode's built-in extension takes it over with [#20](https://github.com/BhodiSea/planish/issues/20).

- `sandbox.mjs` clones the working tree with `cp -c` (APFS `clonefile`) into a folder in the user's temporary folder, runs the command there under `sandbox-exec` with `profile.sbpl`, and deletes the folder afterwards. The project sees only named environment variables, with its caches and temporary files in the run's folder and its package managers told they are offline. A supervisor stops the run, and every process it started, at its time limit or when their resident memory together passes the memory limit.
- `profile.sbpl` denies everything, then allows reads, writes in the run's folder, process creation and the system services toolchains need. It is adapted from the Codex CLI's base profile.
- `detect.mjs` finds the build and test commands from a project's files, and asks the learner to confirm when unsure or when it finds more than one.
- `run.mjs` runs one project: `node run.mjs <project> [--test <command>] [--build <command>] [--network none|loopback] [--no-sandbox] [--time <seconds>] [--memory <MB>]`.
- `corpus.mjs` runs the projects pinned in `corpus.json`, three ways each. The workflow `.github/workflows/sandbox.yml` runs it and the tests in `test/` on GitHub's macOS runners.

## Results

On GitHub's `macos-15-arm64` runner (macOS 15.8.2, image 20261104.0514.1) on 6 November 2026, with Node 24.18.0, Python 3.15.2, Go 1.27.3 and Cargo 1.99.1. "Baseline" runs the same clone and environment without Seatbelt; "Loopback" adds Codex's rules for local servers. Each project's setup fetched its dependencies with the network, outside the sandbox.

| Project | Detected command | Matches | Clone | Baseline | No network | Loopback | Peak memory |
|---|---|---|---|---|---|---|---|
| [expressjs/express](https://github.com/expressjs/express/tree/43fca52d28a422c8be48fd489cbd4f2d6152bab6) | `npm test` | yes | 1.4 s | pass 4.7 s | fail (exit 255) 4.6 s | pass 4.1 s | 317 MB |
| [chalk/chalk](https://github.com/chalk/chalk/tree/72110019e147683f60e13fa0ff5c14a0c27cd9fe) | `npm test` | yes | 2.6 s | pass 10.2 s | pass 10.2 s | pass 9.4 s | 646 MB |
| [lukeed/kleur](https://github.com/lukeed/kleur/tree/fa3454483899ddab550d08c18c028e6db1aab0e5) | `npm run build && npm test` | yes | 0.0 s | fail (exit 1) 0.5 s | fail (exit 1) 0.4 s | fail (exit 1) 0.4 s | 132 MB |
| [jshttp/mime-types](https://github.com/jshttp/mime-types/tree/3a1187ee21388efe46b916d4991589d595bcb26c) | `npm test` | yes | 1.8 s | pass 0.6 s | pass 0.4 s | pass 0.3 s | 125 MB |
| [unjs/defu](https://github.com/unjs/defu/tree/82632b66f5914e9946edce300e10633a3d5c0cb7) | `pnpm run build && pnpm test` | yes | 2.6 s | pass 5.1 s | pass 5.2 s | pass 6.0 s | 607 MB |
| [pallets/click](https://github.com/pallets/click/tree/ac0e297ec2d7d78455a7d18ce306996e668c4a85) | `.venv/bin/python -m pytest` | yes | 0.4 s | pass 6.5 s | pass 6.2 s | pass 6.6 s | 176 MB |
| [pallets/itsdangerous](https://github.com/pallets/itsdangerous/tree/672971d66a2ef9f85151e53283113f33d642dabd) | `.venv/bin/python -m pytest` | yes | 0.5 s | pass 0.9 s | pass 0.9 s | pass 1.0 s | 51 MB |
| [google/uuid](https://github.com/google/uuid/tree/2d3c2a9cc518326daf99a383f07c4d3c44317e4d) | `go test ./...` | yes | 0.0 s | pass 2.1 s | pass 1.8 s | pass 1.8 s | 111 MB |
| [spf13/cobra](https://github.com/spf13/cobra/tree/adbc8813901bba65827259daa8e22ff94ec1f30e) | `go test ./...` | yes, confirm | 0.0 s | pass 2.8 s | pass 3.2 s | pass 2.7 s | 229 MB |
| [gin-gonic/gin](https://github.com/gin-gonic/gin/tree/0f09c3a9b4626d9fe9979cf4d0521d6ae32ab646) | `go test ./...` | yes, confirm | 0.1 s | pass 6.3 s | fail (exit 1) 5.6 s | pass 4.8 s | 664 MB |
| [BurntSushi/memchr](https://github.com/BurntSushi/memchr/tree/bd6068c30e9074a90c285e47912fa0b047d07597) | `cargo test --offline` | yes | 0.1 s | pass 18.1 s | pass 19.4 s | pass 18.9 s | 454 MB |
| [dtolnay/anyhow](https://github.com/dtolnay/anyhow/tree/87c8571326d60b90391d0555c9675b5ac6f044b1) | `cargo test --offline` | yes | 0.1 s | pass 13.0 s | pass 16.8 s | pass 15.6 s | 591 MB |

- Of the 11 projects whose tests pass without the sandbox, 9 pass with no network and all 11 with loopback. Express's tests (through supertest) and Gin's (through Go's `httptest`) start a server on a loopback port, which no network forbids.
- kleur's tests fail without the sandbox too: its test runner loads ES modules through `esm`, which Node 24 refuses.
- Detection matched the command each project's own CI runs in all 12, and asked to confirm for Cobra and Gin, which also have a Makefile with a test target.
- Cloning took at most 2.6 s, for chalk's `node_modules`. Node's `fs.cp` with `COPYFILE_FICLONE` copied the data instead of cloning it (a 1 GB file used 1 GB), so the prototype calls `cp -c`; the tests check that a 1 GB clone uses almost no space.
- Seatbelt also refused writes that did not fail any test, such as Go's telemetry under `~/Library/Application Support`.

## The Codex CLI's sandbox

Reviewed at [`ad1dbba`](https://github.com/openai/codex/tree/ad1dbba32db4b0204d2f769c762f329dc37c8895/codex-rs/sandboxing/src), Apache-2.0.

- **Reused: its Seatbelt rules.** `seatbelt_base_policy.sbpl` and its preferences rules are the base of `profile.sbpl`, with their sysctl, IOKit, IPC and pseudo-terminal rules, and the denial of the two fcntls that change a file through a read-only descriptor, which `file-write*` does not cover. Its rules for loopback are the loopback mode here.
- **Not reused: its code.** The Rust crate builds the profile from Codex's own policy, network-proxy and daemon types, and Planish's runner is TypeScript in an extension; the profile Planish needs is fixed, with one parameter.
- **What Codex does not do, and Planish needs:** a copy-on-write clone (Codex writes in the workspace itself, and to `/tmp` and `/var/tmp` by default, which Planish does not allow), time and memory limits, and an environment limited to named variables.
- Codex calls only `/usr/bin/sandbox-exec`, so that a program on `PATH` cannot stand in for it; so does the prototype. Apple marks `sandbox-exec` deprecated but still ships it in macOS 15.

## Limits of the prototype

- macOS does not enforce `RLIMIT_AS`, so memory is polled every 200 ms: a run can pass its limit briefly, and a process that leaves its process group and is started and gone between two polls is not counted.
- Reads are unrestricted, as in Codex's default. Nothing read can leave the device, since there is no network, writes stay in the run's folder and that folder is deleted, but a test's output, which the learner sees, can show what it read.
- Dependencies must be installed before a run, since a run has no network; the corpus installs them outside the sandbox, as a learner's checkout already has them. Installing them, which runs a package's install scripts, is for [#20](https://github.com/BhodiSea/planish/issues/20) to settle.
- A Python editable install points at the original tree, so the run puts the clone and its `src/` first on `PYTHONPATH`.
