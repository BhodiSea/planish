# Protections

Planish's default protections against agent actions users do not want: one policy for every agent, and the layers that carry it out. The agent kit that installs them is in [agent-integration.md](agent-integration.md#the-agent-kit); running code is in [fork.md](fork.md#running-code), and Workspace Trust and API keys are under its [security](fork.md#security). Marks follow the [front page](README.md). Sources were read on 4 November 2026.

## Who they protect

Everyone who runs an agent in Planish, above all newcomers, who cannot see most harms until they are final, as when an unset variable turned a cache clear into `rm -rf /*` ([claude-code#82165][cc82165]). In a survey of 162 people who code with AI, only non-developers reported never checking the code ([Fawzy et al.][vibesurvey]). Nobody can opt in to protection they do not know they need, so these are on by default, each explained in one plain sentence in the user's language.

## Why asking is not enough

Users approve 93% of Claude Code's permission prompts ([Anthropic, March 2026][anth-auto]). Guards that read a command's text stop honest mistakes, not evasion: researchers defeated the command checks of 10 of 11 open-source agents, and only Continue's, which parses a command before judging it, held ([GuardFall, July 2026][guardfall]); Claude Code's docs say a Bash rule "isn't a security boundary" ([permissions][cc-perms]). What holds is a limit the operating system enforces, which ignores how a command is spelled, and a copy, which undoes what the limit let through.

## The approach

**Decided.** Planish enforces at what it owns: OS-level fences, a project snapshot before each turn or command, a process supervisor, per-session temp folders and an end-of-turn review of at most three flags. Agents' hooks explain a refusal to the agent but are not the boundary.

The promise to a newcomer is that nothing an agent does inside the project is permanent, and nothing it does outside happens silently. A status item shows each agent's active layers, and so where the second half is weaker.

## What Planish owns

| Layer | What it does | Limits |
|---|---|---|
| OS-level fence | Lets agents write only to the project, the session's temp folder and caches, read credentials and personal folders only once granted, and reach only listed hosts | Reaches agents unevenly ([below](#what-each-agent-adds)) |
| Snapshot and record | Copies the project before each turn or command Planish sees, otherwise at quiet moments, with Restore; records files, commands, processes and network use beyond agents' reach | Nothing outside the project or on another machine; no copy-on-write on NTFS or ext4 |
| Supervisor | Ends process trees on Stop and window close, contains runaways, and watches ports, network use, persistence, credential files and disk, listing what agents started in a Running view | Only processes started under Planish; no per-tree memory cap on macOS |
| Session temp folder and environment | A short ASCII temp folder per session; no pagers or git password prompts; `sudo` asking in a Planish dialog; Python installs kept to virtual environments; a session marker for hooks; git hooks set in git's configuration | Programs that clear their environment or use absolute paths; git run with `-c` or `--no-verify`, and pushes through a hosting site's API, which skip hooks set in configuration; Apple's git, which is too old for them ([below](#what-is-not-known-yet)) |
| Turn review | At most three flags per turn ([below](#reports-in-the-turn-review)) | Turn ends are guessed for agents without hooks |

The supervisor, temp folders and session environment are in the built-in extension `planish-protections`. For now a session is a window's extension host, since agents' extensions start their programs with its environment, which the extension sets as it starts (*from code*, [#42](https://github.com/BhodiSea/planish/issues/42)):

- The environment names the session in `PLANISH_SESSION`, points `TMPDIR`, `TMP` and `TEMP` at its folder, sets the pagers of git, GitHub's CLI and the AWS CLI to none, and `PAGER` too except on Windows, which has no `cat`, and turns off git's password prompt in terminals. Terminals the user opens keep their own.
- A session's folder is `planish-<uid>/<id>` under the system's temp folder, which only the user may open, or `planish\<id>` on Windows, reached through the temp folder's short name when the user name is not ASCII.
- When the window closes, the folder is deleted, except git repositories and source, document and data files outside dependency and cache folders. At the next start, Planish sweeps the folders of sessions whose process has ended, touching only folders it marked, and says once where it kept work.

Agents' own undo misses the worst losses: Claude Code's checkpoints skip changes made by shell commands ([checkpointing][cc-checkpoint]), and terminal deletes skip the Trash ([claude-code#23913][cc23913]). As APFS snapshots need a restricted entitlement, which Apple appears to have granted only to backup apps ([Eclectic Light][eclectic]), the store uses `clonefile` copies and, like Cline's checkpoints, a shadow git repository ([Cline][cline-ckpt]). The record stays on the device, like [agents' session logs](README.md#principles-behind-every-design-choice).

## What each agent adds

**Decided.** The kit's hooks act only in Planish sessions. Settings that cannot be scoped, which switch on an agent's own sandbox or lock its bypass modes, apply machine-wide, and the consent screen says so. Agents without a sandbox of their own (Cline, Kilo Code and the in-house sidebar) get a network filter: an allowlist on the device holding the model provider and the hosts the user approves, each asked once, with no Cogvera Labs server involved.

On macOS, Claude Code and Codex can have no fence but their own, since a process inside a Seatbelt sandbox cannot apply another ([codex#26262][cx26262]), so the kit switches on Claude Code's and keeps Codex's default; other agents get Planish's fence, which uses the operating-system sandbox chosen for [running code](fork.md#running-code) with the limits [above](#what-planish-owns). The kit writes at user level after consent, never into a repository.

| Agent | Fence | Hooks | The kit writes |
|---|---|---|---|
| Claude Code | Its own sandbox, off by default; `failIfUnavailable` is added only where Planish has seen the sandbox start, since elsewhere it stops Claude Code from starting ([sandboxing][cc-sandbox]) | Before every tool, MCP tools included, and at turn end ([hooks][cc-hooks]) | Sandbox on, auto-allowing only in Planish sessions *(unknown how)*; `network.allowLocalBinding` on macOS, for dev servers; package registries and the project's git host on its network allowlist, which starts empty; credential and personal-folder reads denied until granted; `disableBypassPermissionsMode`; `blockWritesOutsideWorkingDirectories`; confirmations for `.env*` files and first MCP use; the session environment |
| Codex | Its own `workspace-write` sandbox, without network, on by default in git folders ([sandboxing][codex-sandbox]) | Before shell commands, edits through `apply_patch`, MCP tools and its other local tools, but not hosted tools such as web search; refusing or rewriting a call, never asking ([hooks][codex-hooks]); at turn end, if that runs in the extension *(unknown)* | The guard hook; a `shell_environment_policy` dropping `*KEY*` and `*TOKEN*` variables and setting the session environment; `exclude_slash_tmp`, if it earns its approvals. Read denials and a locked policy need an administrator's `requirements.toml` ([managed configuration][codex-managed]) |
| Cline, Kilo Code | Planish's fence and network filter, on terminals Planish opens for them | Cline's, by default, let a call through when the hook itself fails ([Cline][cline-hooks]); Kilo Code documents none | Nothing; Planish never switches on their auto-approval |
| In-house sidebar, after the first release | Planish's fence and network filter around the whole agent | Native: Planish answers every permission request | Nothing; whether OpenCode can be confined is *(unknown)* ([fork.md](fork.md#the-agent-that-builds-lessons)) |

Kilo Code 7 no longer runs commands in VS Code's terminals: its bundled command-line tool runs them, as a server the extension starts, with sandbox helpers of its own (*from code*, [#42](https://github.com/BhodiSea/planish/issues/42)). How Planish's fence reaches it is *(unknown)*.

Roo Code and Continue get what Cline and Kilo Code get, without hooks; Roo Code shut down in May 2026 and Continue is no longer maintained ([Roo Code][roo]; [Continue][continue]), and Planish tells their users so.

Where an agent's hook can only refuse, as Codex's can, Planish turns a confirmation into a refusal plus a one-time grant in a Planish dialog, and the agent retries.

## The default policy

**Decided.** The defaults are 15 narrow blocks, 11 silent clean-ups, 51 confirmations for rare acts nothing can undo, 48 reports after the turn and 11 opt-ins, and harness-style rules are opt-in packs. The blocks, confirmations and clean-ups ship in the first release; the reports, shown as the turn review's flags, and the opt-in packs can follow.

A **block** is kept for acts almost nobody wants unasked: it fires on the target, not on a command's spelling, says what it stopped and names a safe path, and only the user can override it, in a Planish dialog the agent cannot answer, since a guard that denies its own prescribed fix "teaches people to reach for the escape hatch" ([harness guard rules][h-guard]). **Confirmations** are for rare acts nothing can undo, each answer remembered per project; **reports**, wherever Restore or a later fix will do, since a plain report beats a question approved unread; **clean-ups**, for remedies that take nothing anyone wants; **opt-ins**, for taste, stack doctrine and detectors likely to misfire.

### Blocks

| Block | Fires on | Safe path |
|---|---|---|
| Recursive delete of the wrong target | Home, a drive root, a system folder or all of Desktop or Documents (the folders themselves), or an empty-variable path | Delete only the folder meant, which the hook names |
| Discarding uncommitted git work | `reset --hard`, `checkout -- .` or `clean -fdx` on pre-turn work with no snapshot | Stash it with untracked files, or keep a backup branch |
| Deleting originals after a failed copy | A copy missing or smaller than its original, as a cloud placeholder's is | Keep the originals until full copies exist |
| Deleting through a link or mount | A recursive delete crossing into another filesystem or out through a link; removing a link itself, as `rm -rf node_modules` does with pnpm's, never fires | Stay on one filesystem, or remove only the link |
| Killing the editor or the agent | A pattern kill, such as `pkill -f node`, hitting Planish or the agent; killing a tree the agent started never fires | Stop only the agent's own processes, which the hook lists |
| Running a downloaded project's code on open | Tasks, settings and agent configuration in an untrusted folder ([Workspace Trust](fork.md#workspace-trust)) | Read it in Restricted Mode, or trust the folder |
| Running an agent with its checks off | Bypass modes, which malware has used to drive three agent CLIs ([Snyk][snyk-nx]) | Switch bypass on in Planish's settings |
| Doing a refused act another way | Anything the fence denies, however spelled | A retry outside the sandbox becomes a confirmation, since tools such as Docker fail inside it; only a retry after the user's no counts as evasion |
| Committing a secret | A commit or push holding a high-confidence secret format, except keys public by design, such as Firebase's ([Firebase][firebase-keys]) and Supabase's publishable key | Keep it in `.env`, or answer "It's a test key" or "It's meant to be public", as with GitHub's push protection ([GitHub][gh-push]) |
| Shipping a secret to the browser | A known secret format in a public-prefixed variable, a service-role key in client code, or a long random private `.env` value in build output; name-only matches are reported | Keep the secret in server code |
| A real payment | The final payment step, and live-key commands that move money: charges, transfers, payouts | Use test keys while building; the user takes the last step |
| Typing into the wrong window | Input whose target changed, checked before each action, in input tools Planish provides (none planned yet) | Bring the intended window back first |
| Stop not stopping | Stop, which ends at once every process the turn started and any agent process still deleting files | Earlier turns' servers and jobs run on in the Running view, which has Stop all |
| Writing in Plan or read-only mode | Any write while the mode is on, except to the plan file, temp folders and caches | Switch modes |
| Breaking the user's lock | A change to something the user locked, such as existing test files; prose rules stay advice | Unlock it in Planish's Protections settings |

Blocks needing a hook miss Kilo Code, and Cline when its hooks fail; the bypass lock reaches Codex only under the [administrator lock](#administrator-lock) and Cline only where its enterprise settings lock its approve-everything mode ([Cline][cline-yolo]); and Plan mode reaches Claude Code only where its hook is told the mode.

### Clean-ups

Temp folders, processes and tool state grow unseen: one Claude Code session left 537 GB ([claude-code#26911][cc26911]). Clean-ups run without asking, some with a one-line note.

- **Deleted files kept** for 7 days within a visible budget, with Restore and "Delete for good": every project file an agent deletes or overwrites, except regenerable dependency, build and cache folders, so clearing those frees space at once; ignored files that cannot be regenerated, such as `.env`, are kept.
- **Temp folders:** one per session, measured live and deleted when its processes end, keeping anything that looks like work; old leftovers are swept by safe rules.
- **Leftover processes:** closing the window stops every process tree an agent started unless pinned, asking first about a long batch job.
- **Runaways:** a tree exhausting the machine's processes is ended; one exhausting available memory is paused, with Resume or End, and the user can raise the limit for one task.
- **Stuck commands:** no pagers or git password prompts in agent shells; a command waiting for input shows Answer or Stop.
- **Non-ASCII user names:** ASCII session temp paths, and guards that resolve Windows short names.
- **Prompt floods:** routine work inside the project runs unprompted where the fence and snapshot cover it; agents Planish cannot contain keep their prompts, as Claude Code does outside Planish.
- **Flashing:** Planish's terminal keeps large flashes under three a second ([WCAG 2.3.1][wcag]); the kit passes reduced motion to Claude Code.
- **Screen readers:** every approval in Planish reads in Accessible View and the Accessible Diff Viewer.
- **Colour:** plus and minus markers in Planish's diffs; colour-blind palettes offered at set-up.
- **Distressing loops:** the in-house sidebar stops a loop of self-critical messages and offers Retry; other agents get a notice.

### Confirmations

Planish confirms acts nothing can undo:

- **Losses Restore cannot undo:** deletes and writes outside the project (caches and temp folders excepted); deleting `.git`, or more than the undo budget holds; deleting cloud-synced originals, even after a verified copy, since the deletion reaches every device; bulk deletes in online accounts or on a phone; changing files that a long batch job, or a run the user marked, is using; killing another app's processes, or a single process the session did not start.
- **Hosted systems:** changes to hosted databases, servers and cloud accounts, and the first remote command on each host; pushes that drop commits found only on the remote, or delete a remote branch or tag.
- **Machine-wide changes and switched-off checks:** start-up files, global installs, scheduled jobs, login items and remote access to the computer, such as tunnels and `authorized_keys`; switching off the computer's protections, or git's checks with `--no-verify`.
- **Secrets:** reading the project's `.env` and key files; using or copying stored logins, other projects' secrets or private keys; typing into a password, one-time-code or card field on a site that is not local, in browsers Planish provides (none planned yet).
- **Code from elsewhere:** download-and-run scripts, those the user pastes included; suspicious packages; new MCP servers, skills, plugins and extensions, and updates that add to what they can do; the first use of each MCP tool.
- **Data leaving the device:** contacting a new network host; reading personal folders, other projects, other apps' data, live customer records or the whole disk (Planish never asks for Full Disk Access itself); a computer-use session, in screen tools Planish provides (none planned yet).
- **Spending:** a token budget running out or a detected loop, which pauses the agent; paid builds, cloud resources, setting up unattended runs, many paid calls and other commands with live payment keys.
- **Acts in public or in the user's name:** messages, shown word for word first; publishing packages; pushes, merges and deploys; putting images, personal data, secrets or private references somewhere public, such as a public repository; committing dependency or build folders; saving work under someone else's name or hiding it from git; acting from an account other than the project's; an extension signing in with a consumer subscription that its provider allows only in its own tools.

A second agent in one folder is offered its own copy, and a project in a cloud-synced folder a local folder. Planish also asks once, at set-up, whether the user's commits should carry AI attribution, for the kit to apply, and says once, when an agent is connected, what its plan lets the vendor keep or train on, with a link to the setting.

Each names the resolved target, such as "the database 'prod' on supabase.co, not your local copy", and before a push or merge shows the user's latest messages. Answers are remembered per project, with three exceptions: an agent changing its own permission settings is asked every time; a yes to reading `.env` lasts a session at most; and a stored login is remembered per project and login, and asked about in the same confirmation as the push, deploy or publish that needs it. Most fire on events few newcomer sessions reach; the real rate is *(unknown)*.

### Reports in the turn review

Flags come most severe first, one sentence each, with Restore, Ask the assistant to fix, or Keep, and look only at lines the turn added, so an existing project does not light up. They report losses Restore undoes, such as files deleted unasked; work at risk, such as a project in a temp folder or chat history another tool is about to delete; a file saved in a new encoding or with new line endings, with one click to put the original back; strain on the machine, from long heavy compute to gigabytes of metered data; exposure, such as a server other devices on the network can open, a key left in an agent's saved history, a new saved sign-in or a tool uploading the whole project; protection settings changed during the turn, with Revert; an extension update, held until no agent session runs, with Roll back; risks in the new code, from insecure code to routes that let strangers spend the owner's key; spending beyond the plan; honesty, setting Planish's record against the agent's account, as with "done" without proof or tests weakened after they failed; scope, such as changes beyond the request; and the session itself, such as replies drifting out of the user's language, or a session so long that a fresh one would follow instructions better. Every turn summary also states the change's size.

A contradiction Planish can prove, such as "all tests pass" after a failed run, goes back to the agent once per turn, as do new compile errors and insecure code; no more, since each round spends the user's tokens. No default blocks a turn's end: even a harness built on a turn-end gate keeps it capped, since "a hook that can block forever is a bricked machine" ([harness turn-end gate][h-stop]).

## Opt-in packs

Packs hold harness-style rules, such as those of the open-source [next-expo-supabase-agent-harness][harness], for a user or a course to switch on. Each is configuration on the same layers, and each rule names its safe path and never blocks forever.

| Pack | Adds | Why it is not a default |
|---|---|---|
| Code quality | Clone detection, complexity and size caps, dead-code reports (never deletion, and no `knip --fix`), no comments narrating past edits, diff coverage, a naming glossary | Thresholds are taste; many newcomer projects have no tests |
| Turn-end gate | No turn ends while checks fail, capped | Each blocked end spends tokens |
| Test and check integrity | Existing tests read-only during fixes; check configurations write-protected; `--no-verify` refused; every flag sent to the agent | Blocks honest test fixes; spends tokens |
| Supply chain | Install scripts refused outside an allowlist; a release-age wait on installs; no unpinned package runners; a licence allowlist; online licence matching | Slows installs; licences are the project's choice; matching sends code out |
| Strict network | Unlisted hosts refused without asking | Breaks documentation and API work |
| Stacks | Supabase and Postgres (blocking migrations that leave tables open), Expo, Next.js, machine learning (no `trust_remote_code`; weights-only model loading) | Meaningless elsewhere |
| Team process | Branch protection, review before merge, commit formats, CODEOWNERS, a lock protecting a long run, a confirmation before every delete of existing files, a wait before agent updates longer than the default 48 hours ([fork.md](fork.md#extension-installs-and-updates)) | Team habits, not newcomer safety |
| Learning | A second opinion on plans; learn mode's [explain-back](learn.md#explain-back-on-agent-changes) | Some people want an app, not a lesson |

## Administrator lock

**Decided.** Planish offers an optional administrator lock for schools and shared machines: managed settings that only an administrator can change.

Without it, protections live in user-level settings, and changes to them are flagged in the turn review *(decided)*. User-level settings can be changed by the user, by malware running as the user, as with the three agent CLIs above, and in principle by the agent; a `--settings` flag also outranks them without touching any file ([sandboxing][cc-sandbox]). Under the lock, Codex's settings go in an administrator's `requirements.toml`, which alone can lock its policy and deny its reads ([managed configuration][codex-managed]).

## Calibration export

**Decided.** An opt-in beta export records how often each flag and confirmation fired, with no content; the user reviews it and sends it themselves, and it is never sent automatically.

With hand tests and issue reports, it is how false-flag and confirmation rates get measured without telemetry ([front page](README.md#principles-behind-every-design-choice)).

## Limits

Every agent gets the same snapshot, clean-ups, record and review; prevention is only as good as each agent's sandbox and hooks.

- **Native Windows.** Claude Code has no sandbox there ([sandboxing][cc-sandbox]), VS Code's is experimental ([VS Code][vsc-sandbox]), and NTFS has no copy-on-write for cheap snapshots; Windows releases follow macOS *(decided)*.
- **Agents that edit files without hooks.** Cline's and Kilo Code's file edits run in the extension host, which "has the same permissions as VS Code itself" ([VS Code][vscode-extsec]); short of fencing every extension, Planish stops their edits only through VS Code's file API and otherwise sees them afterwards. Claude Code's file tools, web fetches and MCP servers also run outside its sandbox, seen only by its hooks.
- **Remote work.** Nothing outside the project can be undone, nor anything sent over the network recalled, hence confirmations and fenced credentials for hosted databases, cloud accounts, GitHub and email. Another machine, over SSH or in a remote window, is beyond the snapshot, fence and supervisor: the latest reported wrong-path wipe of a home folder, on 3 November 2026, hit a remote Mac over SSH ([Antigravity forum][ag197971]), which in Planish only a hook and the first-remote-command confirmation would see.
- **Evasion.** A command crafted to slip past a hook is contained by the fence, not stopped.

## What is not known yet

A prototype settled these on 6 November 2026 ([results](../../prototypes/protection-facts/README.md)):

- **Snapshots per command are affordable** with a shadow git repository that leaves out ignored folders: 0.1–0.2 s after a typical command on a 100,000-file project, on APFS, NTFS and ext4 alike, once the first snapshot (10–33 s) is taken. A full copy takes 3–47 s each time and an APFS clone 9–17 s, so neither suits every command.
- **Cline runs commands in VS Code's terminals by default**, where Planish's fence can reach them, unless the user switches it to running them in the background as child processes of the extension host. Kilo Code 7 does not ([above](#what-each-agent-adds)).
- **Codex's hooks reach beyond shell commands**, to edits through `apply_patch`, MCP tools and its other local tools, but not hosted tools such as web search; they refuse or rewrite a call, and `ask` is not supported yet ([hooks][codex-hooks]).
- **Apple's git is too old for hooks set in configuration**: Xcode 26.6 and its command line tools ship git 2.50.1, and only git 2.54 and later run such hooks. With git 2.56, `--no-verify` skips them on commit and push, so Planish's secret check cannot rest on git's hooks alone.

The first two below decide how far the defaults reach.

| Question | What depends on it | How to settle it |
|---|---|---|
| Does Planish's environment (temp folder, git hooks, session marker) reach every command the Claude Code and Codex extensions run? Both start their programs with the extension host's environment, Claude Code adding `claudeCode.environmentVariables` and Codex the proxy settings (*from code*), so it reaches the programs if Planish puts it there; whether Claude Code's sandbox and Codex's `shell_environment_policy` pass it on to commands is untested | At least four defaults | A day of tests in a Planish build, with those in [agent-integration.md](agent-integration.md#unknowns) |
| Can Claude Code's auto-allow be limited to Planish sessions? Its docs give the setting no condition; `--settings` applies per session, but Planish does not start Claude Code ([settings][cc-settings]). Do its hooks see the sandbox-escape flag? `dangerouslyDisableSandbox` is a Bash parameter that permission rules can match, but the hooks docs do not list it in `tool_input` ([sandboxing][cc-sandbox]). Can its permission-request hook wait for the user? It can allow or deny, with the 600-second default of command hooks, and the docs do not say whether the dialog waits ([hooks][cc-hooks]). Hooks do see the permission mode | Prompts outside Planish; the evasion and Plan-mode blocks | Prototype tests with a logged-in Claude Code |
| Does Codex's turn-end hook run in the extension, and can a user trust its hooks there? The docs show trust only in the CLI's `/hooks` and the desktop app; managed hooks, from `requirements.toml`, need no trust ([hooks][codex-hooks]) | Whether Codex's guard and turn-end hooks run at all | Tests with a logged-in Codex |
| Does a sandbox denial suppress macOS's privacy prompt? | Confirmations for other apps' data | A test on a clean Mac |
| How often does each detector flag wrongly, and each confirmation fire? | Which defaults stay | Hand tests and the calibration export |

[cc82165]: https://github.com/anthropics/claude-code/issues/82165 "anthropics/claude-code#82165, 29 Jul 2026"
[vibesurvey]: https://arxiv.org/html/2605.24521v1 "Fawzy, Tahir and Blincoe, 23 May 2026"
[anth-auto]: https://www.anthropic.com/engineering/claude-code-auto-mode "Anthropic Engineering: Claude Code auto mode, 25 Mar 2026"
[guardfall]: https://labs.cloudsecurityalliance.org/research/csa-research-note-guardfall-ai-agent-shell-injection "Cloud Security Alliance: GuardFall, 1 Jul 2026"
[cc-perms]: https://code.claude.com/docs/en/permissions "Claude Code docs: permissions"
[cc-checkpoint]: https://code.claude.com/docs/en/checkpointing "Claude Code docs: checkpointing"
[cc23913]: https://github.com/anthropics/claude-code/issues/23913 "anthropics/claude-code#23913, 7 Feb 2026"
[eclectic]: https://eclecticlight.co/2026/05/10/last-week-on-my-mac-snapshots-the-elephant-in-apfs/ "Eclectic Light, 10 May 2026"
[cline-ckpt]: https://github.com/cline/cline/blob/main/docs/core-workflows/checkpoints.mdx "Cline docs: checkpoints"
[cx26262]: https://github.com/openai/codex/issues/26262 "openai/codex#26262"
[cc-sandbox]: https://code.claude.com/docs/en/sandboxing "Claude Code docs: sandboxing"
[cc-hooks]: https://code.claude.com/docs/en/hooks "Claude Code docs: hooks"
[cc-settings]: https://code.claude.com/docs/en/settings "Claude Code docs: settings"
[codex-hooks]: https://learn.chatgpt.com/docs/hooks "Codex docs: hooks"
[codex-sandbox]: https://learn.chatgpt.com/docs/sandboxing "Codex docs: sandboxing"
[codex-managed]: https://learn.chatgpt.com/docs/enterprise/managed-configuration "Codex docs: managed configuration"
[cline-hooks]: https://docs.cline.bot/sdk/plugins "Cline docs: SDK plugins, hook errors"
[roo]: https://github.com/RooCodeInc/Roo-Code "Roo Code"
[continue]: https://github.com/continuedev/continue "Continue"
[h-guard]: https://github.com/cogvera-labs/next-expo-supabase-agent-harness/blob/main/template/base/.claude/hooks/lib/guard-rules.mjs "next-expo-supabase-agent-harness: guard rules"
[h-stop]: https://github.com/cogvera-labs/next-expo-supabase-agent-harness/blob/main/template/base/.claude/hooks/stop-validate-gate.mjs "next-expo-supabase-agent-harness: turn-end gate"
[harness]: https://github.com/cogvera-labs/next-expo-supabase-agent-harness "next-expo-supabase-agent-harness"
[cline-yolo]: https://docs.cline.bot/enterprise-solutions/configuration/infrastructure-configuration/control-other-cline-features/yolo-mode "Cline docs: YOLO mode for enterprises"
[snyk-nx]: https://snyk.io/blog/weaponizing-ai-coding-agents-for-malware-in-the-nx-malicious-package/ "Snyk, 27 Aug 2025"
[firebase-keys]: https://firebase.google.com/docs/projects/api-keys "Firebase docs: API keys"
[gh-push]: https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line "GitHub docs: push protection"
[cc26911]: https://github.com/anthropics/claude-code/issues/26911 "anthropics/claude-code#26911, 19 Feb 2026"
[wcag]: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html "WCAG 2.2: three flashes or below threshold"
[vscode-extsec]: https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security "VS Code docs: extension runtime security"
[vsc-sandbox]: https://code.visualstudio.com/docs/agents/run/agent-sandboxing "VS Code docs: agent sandboxing"
[ag197971]: https://discuss.ai.google.dev/t/197971 "Antigravity forum, 3 Nov 2026"
[githooks]: https://git-scm.com/docs/githooks "git docs: githooks"
