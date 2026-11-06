# Roadmap

What Planish builds first and what follows, in phases. Each line links to the issue that tracks the work. Nothing is built yet.

The first release is decided: Planish for macOS on Apple silicon, with both lanes (learn mode through Claude Code and Codex, and the paper lane in all three formats) and the default protections against harmful agent actions. Planish's own sidebar comes after it ([decisions](https://github.com/BhodiSea/planish/blob/main/docs/decisions.md)). The rest of the order is proposed. Research issues settle what the [spec](https://github.com/BhodiSea/planish/blob/main/docs/spec/README.md) marks unknown; each comes early in the phase that depends on it and can start earlier, since the spec's [order of work](https://github.com/BhodiSea/planish/blob/main/docs/spec/README.md#order-of-work) runs them first. Issues follow the spec's marks: *(decided)* for what the maintainer has settled, *(unknown)* for what a prototype or measurement must settle, and nothing for what is proposed.

## A first build, with CI

A development build of Planish for Apple silicon that works as VS Code does, built in CI for macOS, Windows and Linux. ([fork.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/fork.md))

- [#1](https://github.com/BhodiSea/planish/issues/1) Build Planish from VSCodium's scripts, with its own names and IDs
- [#2](https://github.com/BhodiSea/planish/issues/2) Build unsigned development builds for macOS, Windows and Linux in CI
- [#3](https://github.com/BhodiSea/planish/issues/3) Require sign-off and maintainer approval for outside contributors' CI
- [#4](https://github.com/BhodiSea/planish/issues/4) Set up the development loop and the contributing guide
- [#5](https://github.com/BhodiSea/planish/issues/5) Check in CI that every edit to an upstream file is fenced
- [#6](https://github.com/BhodiSea/planish/issues/6) Measure startup and typing against VSCodium at the same VS Code release
- [#7](https://github.com/BhodiSea/planish/issues/7) Write the upstream sync guide and use it for one sync

## Lessons from Claude Code and Codex

A learner asks Claude Code or Codex for a lesson on their codebase; Planish checks it with tools and shows it beside the code, as a code tour, an explanation or a diagram. ([agent-integration.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/agent-integration.md))

- [#8](https://github.com/BhodiSea/planish/issues/8) Test Claude Code and Codex in a Planish build
- [#9](https://github.com/BhodiSea/planish/issues/9) Define the lesson templates' schemas and the validator
- [#10](https://github.com/BhodiSea/planish/issues/10) Measure how reliably each model fills the lesson templates
- [#11](https://github.com/BhodiSea/planish/issues/11) Build the lesson MCP server
- [#12](https://github.com/BhodiSea/planish/issues/12) Install the agent kit in Claude Code and Codex, with the user's consent
- [#13](https://github.com/BhodiSea/planish/issues/13) Open Claude Code and Codex with a lesson prompt filled in
- [#14](https://github.com/BhodiSea/planish/issues/14) Show code tours and explained lessons beside the code
- [#15](https://github.com/BhodiSea/planish/issues/15) Draw diagram lessons from Mermaid text in the shared webview
- [#16](https://github.com/BhodiSea/planish/issues/16) Check every lesson with the compiler, tests and find-references

## The learning loop

Learn mode places the learner, marks code stations by running the code, gives help in order, asks for an explain-back on agent changes, and brings review items back where their code is. ([learn.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/learn.md))

- [#17](https://github.com/BhodiSea/planish/issues/17) Run a project's code in a sandbox on macOS
- [#18](https://github.com/BhodiSea/planish/issues/18) Prototype where the explain-back attaches in Claude Code and Codex
- [#19](https://github.com/BhodiSea/planish/issues/19) Keep the learner model on the device, and place the learner per concept
- [#20](https://github.com/BhodiSea/planish/issues/20) Mark code stations by running the code
- [#21](https://github.com/BhodiSea/planish/issues/21) Give help in order: a hint, a worked explanation, then "show me"
- [#22](https://github.com/BhodiSea/planish/issues/22) Bring review items back where their code is, and re-teach changed code
- [#23](https://github.com/BhodiSea/planish/issues/23) Ask for an explain-back before an agent's change is accepted
- [#24](https://github.com/BhodiSea/planish/issues/24) Show equations beside their code, with the maths check ladder
- [#25](https://github.com/BhodiSea/planish/issues/25) Show progress as effort and pace, and offer a delayed re-check
- [#26](https://github.com/BhodiSea/planish/issues/26) Introduce learn mode with a four-step walkthrough

## Model checks and role-play on the user's API key

With an API key added to Planish, lessons get a sceptical model check within a budget, role-play stations question the learner, and explanations get advisory grades. ([learn.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/learn.md#checking-lessons))

- [#27](https://github.com/BhodiSea/planish/issues/27) Store API keys and call model providers through one library
- [#28](https://github.com/BhodiSea/planish/issues/28) Add the sceptical model check, with a costed pilot and a budget cap
- [#29](https://github.com/BhodiSea/planish/issues/29) Build role-play stations: a simulated reviewer or original author
- [#30](https://github.com/BhodiSea/planish/issues/30) Grade explanations, advisory until the user's model is calibrated

## The paper lane

An author rewrites an AI draft by hand, or writes first, in a live-preview editor over the paper's own pandoc Markdown, LaTeX or Typst files, with explanations, provenance and the publish gate. All three formats are in the first release *(decided)*. ([paper.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/paper.md))

- [#31](https://github.com/BhodiSea/planish/issues/31) Find or write grammars for pandoc Markdown, LaTeX and Typst
- [#32](https://github.com/BhodiSea/planish/issues/32) Size the core change that labels where edits come from
- [#33](https://github.com/BhodiSea/planish/issues/33) Build the paper editor: a live preview over the paper's own files
- [#34](https://github.com/BhodiSea/planish/issues/34) Give agents the paper lane's tools: selection, sources and checks
- [#35](https://github.com/BhodiSea/planish/issues/35) Record who wrote each sentence of a paper, on the device
- [#36](https://github.com/BhodiSea/planish/issues/36) Export and import a paper's provenance log and AI draft as one local file
- [#37](https://github.com/BhodiSea/planish/issues/37) Rewrite a draft by hand: hide, write, compare
- [#38](https://github.com/BhodiSea/planish/issues/38) Explain on request, and examine the author in a viva
- [#39](https://github.com/BhodiSea/planish/issues/39) Build papers through the project's toolchain, behind the publish gate
- [#40](https://github.com/BhodiSea/planish/issues/40) Gate claims-only papers on checked and explained claims, not overlap

## Default protections

Protections against agent actions users do not want, the same for every agent and enforced at what Planish owns: OS-level fences, a project snapshot before each turn or command, a process supervisor, per-session temp folders and an end-of-turn review *(decided)*. The blocks, confirmations and clean-ups ship in the first release, and the turn review's reports and the opt-in packs can follow *(decided)*; the first release needs [#42](https://github.com/BhodiSea/planish/issues/42) to [#49](https://github.com/BhodiSea/planish/issues/49). ([protections.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/protections.md))

- [#41](https://github.com/BhodiSea/planish/issues/41) Build the default protections against agent actions users do not want
- [#42](https://github.com/BhodiSea/planish/issues/42) Prototype the untested facts that decide how far the protections reach
- [#43](https://github.com/BhodiSea/planish/issues/43) Supervise agents' processes, with a temp folder and environment per session
- [#44](https://github.com/BhodiSea/planish/issues/44) Snapshot the project before each turn or command, with Restore
- [#45](https://github.com/BhodiSea/planish/issues/45) Set up Claude Code's and Codex's sandboxes and hooks through the kit
- [#46](https://github.com/BhodiSea/planish/issues/46) Fence agents that have no sandbox, with a network allowlist on the device
- [#47](https://github.com/BhodiSea/planish/issues/47) Block acts almost nobody wants unasked, naming a safe path
- [#48](https://github.com/BhodiSea/planish/issues/48) Confirm rare acts nothing can undo, naming the resolved target
- [#49](https://github.com/BhodiSea/planish/issues/49) Curb flashes and distressing loops, and make approvals and diffs accessible
- [#50](https://github.com/BhodiSea/planish/issues/50) Review each turn in at most three flags, most severe first
- [#51](https://github.com/BhodiSea/planish/issues/51) Offer an optional administrator lock, and flag changes to protections
- [#52](https://github.com/BhodiSea/planish/issues/52) Offer harness-style rules as opt-in packs
- [#53](https://github.com/BhodiSea/planish/issues/53) Export how often each flag and confirmation fired, for the user to send

## The first release, on Apple silicon

Planish for macOS on Apple silicon, signed, notarised and tested by hand, with both lanes, the default protections and updates. ([fork.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/fork.md#build-release-and-updates))

- [#54](https://github.com/BhodiSea/planish/issues/54) Enrol Cogvera Labs in the Apple Developer Program as an organisation
- [#55](https://github.com/BhodiSea/planish/issues/55) Sign and notarise macOS releases from a protected release job
- [#56](https://github.com/BhodiSea/planish/issues/56) Update Planish from GitHub Releases, and ship Chromium fixes within days
- [#57](https://github.com/BhodiSea/planish/issues/57) Calibrate the performance budgets and gate pull requests on them
- [#58](https://github.com/BhodiSea/planish/issues/58) Run the 100 most-installed extensions in Planish and in VS Code
- [#59](https://github.com/BhodiSea/planish/issues/59) Import settings and extensions from VS Code, Cursor and Antigravity
- [#60](https://github.com/BhodiSea/planish/issues/60) Set the security defaults for extensions and untrusted folders
- [#61](https://github.com/BhodiSea/planish/issues/61) Test every view by keyboard alone and with a screen reader
- [#78](https://github.com/BhodiSea/planish/issues/78) Planish's icons, notices and the names VSCodium and Microsoft still set
- [#62](https://github.com/BhodiSea/planish/issues/62) Release Planish for macOS on Apple silicon, tested by hand

## The in-house sidebar

After the first release *(decided)*: open-source agents over the Agent Client Protocol in Planish's own sidebar, OpenCode by default, on the user's own API keys; then lessons the learner did not ask for, and a confined learn agent for untrusted repositories. ([agent-integration.md](https://github.com/BhodiSea/planish/blob/main/docs/spec/agent-integration.md#the-in-house-sidebar))

- [#63](https://github.com/BhodiSea/planish/issues/63) Prototype OpenCode over the Agent Client Protocol inside Planish
- [#64](https://github.com/BhodiSea/planish/issues/64) Host open-source agents in Planish's own sidebar, OpenCode by default
- [#65](https://github.com/BhodiSea/planish/issues/65) Write lessons the learner did not ask for, within their budget
- [#66](https://github.com/BhodiSea/planish/issues/66) Build a confined learn agent for untrusted repositories

## Later

Windows and Linux releases once each is tested *(decided)*, and more of each lane. ([order of work](https://github.com/BhodiSea/planish/blob/main/docs/spec/README.md#order-of-work))

- [#67](https://github.com/BhodiSea/planish/issues/67) Set up Windows code signing with Azure Artifact Signing
- [#68](https://github.com/BhodiSea/planish/issues/68) Release Planish for Windows and Linux, once each is tested
- [#69](https://github.com/BhodiSea/planish/issues/69) Add Parsons problems, traces and a concept map to the catalogue
- [#70](https://github.com/BhodiSea/planish/issues/70) Check equations in Lean where its maths library has the definitions
- [#71](https://github.com/BhodiSea/planish/issues/71) Add the paper lane's later parts
- [#72](https://github.com/BhodiSea/planish/issues/72) Build the fuller code index if the search budget fails
- [#73](https://github.com/BhodiSea/planish/issues/73) Sign in to GitHub through Planish's own GitHub app
- [#74](https://github.com/BhodiSea/planish/issues/74) Build the calibration set for grading explanations
