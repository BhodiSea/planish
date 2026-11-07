# Planish specification

Draft of 4 November 2026; nothing here is built yet.

This page says what Planish is, what it commits to and why; the [other spec files](#the-spec-files) say how each part works. Statements are marked by how settled they are:

- **decided**: settled by the maintainer and listed on the [decisions page](../decisions.md);
- **proposed**: this spec's design, open to change;
- **unknown**: to be settled by a prototype, a measurement or an evaluation before anything depends on it.

A paragraph or bullet that opens with **Decided.**, **Proposed.** or **Unknown.** has that status, and *(decided)*, *(proposed)* or *(unknown)* marks a single statement. A sentence that cites a source reports that source. Any other design statement is proposed.

## What Planish is

Planish is an open-source code editor that teaches people to understand what AI agents make for them: the code in their repository, the mathematics in it and the research papers they publish. It is VS Code's open-source code ([Code - OSS](https://github.com/microsoft/vscode)) built with [VSCodium](https://github.com/VSCodium/vscodium)'s scripts, so it works like VS Code, with two lanes added. In learn mode, whichever agent the user runs fills lesson templates to build a curriculum of their codebase, from first principles and at their level. In the paper lane, an author works on a paper's own source files in a live-preview editor, beside an agent that explains anything they do not understand. The first release has both lanes, on macOS for Apple silicon; Windows and Linux are built from the start and follow once tested. Planish is built in public and led by Cogvera Labs, with one maintainer for now and a second when review load demands it. All of this is decided.

## Who it is for

- **People learning to understand code that agents wrote**, from a first program to an unfamiliar codebase, placed per concept *(proposed)*: across 60 experiments, heavy guidance helped newcomers to a topic and hindered those who already knew it ([Tetzlaff et al., 2025](https://doi.org/10.1016/j.learninstruc.2025.102142)).
- **Authors who must understand an AI-drafted paper before publishing it.**

Both are decided, as is the age limit of 18 and over, for now; younger learners would need a design of their own. Several AI services that learners would bring set the same limit, among them the [Gemini API](https://aistudio.google.com/docs/terms) and [OpenRouter](https://openrouter.ai/terms).

## What it is not

Both points are decided.

- **Not a new coding agent.** Planish hosts the agents people already use: Claude Code and Codex as ordinary extensions with their own logins and, after the first release, open-source agents in its own sidebar, [OpenCode](https://opencode.ai) by default, on the user's API keys ([agent-integration.md](agent-integration.md)).
- **Not a model seller.** Cogvera Labs pays none of its users' model costs: users bring their own API keys or subscriptions, and Planish ships no model access, credits or proxy paid for by Cogvera Labs.

Planish runs on the user's computer. Today no Planish server stands between users and their models, though an optional hosted service is not ruled out. Planish's own model calls, such as the sceptical lesson check, use an API key the user adds.

## Two lanes, one foundation

Everything in this table is decided; the user can change the defaults it names.

| | [Learn mode](learn.md) | [Paper lane](paper.md) |
|---|---|---|
| The person | Does exercises marked by running the code, is questioned by an AI playing a reviewer or the code's original author, and explains an agent's change before accepting it, or skips | Rewrites an AI draft by hand, by default with the draft hidden, or writes first and uses AI only to explain and check; chosen per paper |
| Checks | Before a lesson is shown: tools such as the compiler, and by default one sceptical model check | The publish gate blocks the submission build only on mechanical checks; understanding checks must be attempted, and are recorded, not scored |

Both lanes share three parts:

- **One learner model** on the device, whose review items, anchored to the user's code, return when that code is opened and are re-taught when it changes *(decided)*.
- **One maths layer**: one ladder of checks, cheapest first, from parsing through [SymPy](https://www.sympy.org) to a numeric test against the code and, after the first release, [Lean](https://lean-lang.org); a model's opinion never counts ([learn.md](learn.md#maths)).
- **One fixed catalogue of lesson templates**, which every agent fills with data. It includes a diagram template: agents write Mermaid text, and Planish draws it in its shared sandboxed webview *(both decided)*. The paper lane's explanations use the catalogue too.

## The four requirements, as commitments

All four are decided, the extensions promise word for word; the other commitments and all the checks are proposed, except where marked.

### 1. The extensions promise

> Runs the VS Code extensions you already use, from Open VSX or any .vsix you are licensed to use; for Microsoft's few extensions licensed only for its products, we list open replacements. An extension that works in VS Code at the same version but not here is a bug.

**Check:** those of the Marketplace's 100 most-installed extensions that can be installed here run on a schedule in Planish and in VS Code, with published results ([fork.md](fork.md#extensions)).

### 2. Fast on very large codebases

With learning features off, Planish matches the startup, typing and memory of the same VS Code release, both as VSCodium builds it and as Microsoft builds it, and a regression is a bug *(decided)*; with them on, it keeps to budgets a prototype must calibrate ([fork.md](fork.md#performance)). Its target is to be faster than Microsoft's build in the large-repository scenarios of [#57](https://github.com/BhodiSea/planish/issues/57); the target guides Planish's own work and is not a claim Planish makes *(decided)*.

AI-focused forks have slowed down in two ways. In two forum reports, it was because of what they added: agent state kept in memory over long sessions ([Cursor forum](https://forum.cursor.com/t/cursor-consuming-22-gb-ram-across-dozens-of-helper-processes-ide-becomes-extremely-slow/158844)) and re-indexing set off by build output ([Google AI forum](https://discuss.ai.google.dev/t/critical-macos-crash-40gb-memory-exhaustion-caused-by-recursive-workspace-indexing-during-next-js-build/147515)). The other is trailing upstream, with work repeated in every window. Users' About dialogs have shown Antigravity's IDE on VS Code 1.107 since February 2026 ([Google AI forum](https://discuss.ai.google.dev/t/bug-report-high-cpu-usage-400-by-language-server-macos-arm-on-latest-macos/120629)), a reply on Google's forum says each of its windows runs its own extension host and file-indexing processes ([Google AI forum](https://discuss.ai.google.dev/t/antigravity-ide-crashes-after-using-more-than-20-gb-of-memory-when-i-reopen-it/173600)), and a user traced its main process running out of memory after a day or two to a leak upstream fixed in VS Code 1.138 ([Google AI forum](https://discuss.ai.google.dev/t/antigravity-ide-macos-quits-without-warning-main-browser-process-hits-v8-heap-oom-after-1-2-days-uptime/189171); [vscode#323980](https://github.com/microsoft/vscode/pull/323980)).

### 3. Familiar to VS Code, Cursor and Antigravity users

- **One-click import** of settings, keybindings, extensions and profiles from all three.
- **No core key rebound:** Planish's commands take only keys VS Code leaves free, as VS Code's guidelines say not to overwrite existing shortcuts ([command palette guidelines](https://code.visualstudio.com/api/ux-guidelines/command-palette)).
- **Layouts never change on update:** an update never moves, opens or closes a view, and learn mode is opt-in *(decided)*. Cursor 2.0 and Antigravity 2.0 each pushed the editor aside in an update and backed off after users objected ([Cursor forum](https://forum.cursor.com/t/megathread-cursor-layout-and-ui-feedback/146790); [Google AI forum](https://discuss.ai.google.dev/t/antigravity-2-0-breaks-core-developer-tools/146988)).

**Checks:** a scripted import from each editor, default keybindings compared with upstream's, and an update test on a customised layout, run by CI on macOS (`test/smoke/import.sh`, `keybindings.sh` and `layout.sh`).

### 4. World-class UI and UX

- **The editor stays home:** learn mode opens beside the editor, never in its place, and turning it on or off leaves editors and views where they were.
- **Native parts first:** a webview is used only for what native parts cannot show: the paper editor, maths and diagrams ([VS Code guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews)). Every view follows the user's theme.
- **Accessible from the first release:** every view works by keyboard alone and with a screen reader, tested before each release; native parts inherit [VS Code's support](https://code.visualstudio.com/docs/configure/accessibility/accessibility), and webviews must rebuild it.
- **Prompts where the work is:** learning prompts appear only beside the code or change they concern, with no separate review page or daily review session in the first release *(decided)*.

## Principles behind every design choice

1. **Machines verify, people explain.** A program checks whatever it can, from marking exercises to the publish gate *(decided)*, and a model judges only the rest. Asking a model whether a code summary was wrong scored F1 0.24–0.45, against 0.73 when static analysis found each code entity the summary named and a model checked each separately ([ETF, ACL 2025](https://arxiv.org/abs/2410.14748)). So model grades of explanations stay advisory until the user's model passes a calibration set shipped with Planish *(decided)*. People supply the explanation, in their own words.
2. **The learner thinks before the agent answers.** Help, in code and in maths, comes as a hint, then a worked explanation after an attempt, then a deliberate "show me" that always gives the answer *(decided)*. In randomised trials, engineers who learned a new library with an AI assistant scored 50% on a later quiz, against 67% for those who coded by hand ([Shen & Tamkin, Anthropic, 2026](https://www.anthropic.com/research/AI-assistance-coding-skills)), and students who practised maths with plain GPT-4 did worse on the exam once access ended, unlike those whose tutor gave hints instead of answers ([Bastani et al., 2025](https://doi.org/10.1073/pnas.2422633122)). A tutor that withheld answers altogether mostly went unused ([FutureEd, 2026](https://www.future-ed.org/students-tried-khanmigos-ai-tutor-most-didnt-want-its-help/)), which is why "show me" always answers.
3. **Local-first privacy.** Planish has no telemetry: it never sends usage data automatically *(decided)*. Learning records, the paper lane's provenance log and agents' session logs stay on the device, outside the repository, seen only by the user, and are never uploaded, though the author may export a paper's provenance log, with the device's copy of the AI draft, as one local file and import it on another of their machines, so the rewrite and the overlap check carry on there *(all decided)*. An agent receives from these records only what Planish's tools return ([agent-integration.md](agent-integration.md#the-lesson-mcp-server)), and before the first model request Planish tells the user that their provider sees whatever the agent sends ([the agent kit](agent-integration.md#the-agent-kit)).
4. **Agents fill templates with data, never HTML.** Agents send data through Planish's [MCP](https://modelcontextprotocol.io) tools; Planish owns the templates, the validator and the components that draw them, and shows only valid data ([agent-integration.md](agent-integration.md#the-lesson-contract)). So theming, accessibility, speed and safety stay in Planish's hands whichever agent writes, and repository text reaches the screen as data, never as markup.
5. **A thin fork.** VS Code ships a release every week ([VS Code 1.111 notes](https://code.visualstudio.com/updates/v1_111)), and a fork's cost of keeping up grows with every upstream file it edits. So Planish builds on VSCodium, which already strips Microsoft's branding, telemetry, Marketplace and closed Copilot parts, keeps its own upstream edits few and fenced ([fork.md](fork.md#the-repository)), and changes nothing in VS Code's core for its sidebar *(all decided)*.

## Order of work

Proposed, except where marked; the [roadmap](../roadmap.md) lists what each step holds.

1. **Foundation:** unsigned development builds from VSCodium's scripts, in CI for all three platforms from the start *(decided)*.
2. **The unknowns the rest depends on:** Claude Code and Codex at runtime, the template evaluation, the sandbox, the paper grammars, the labelling of where edits come from and how far the protections reach ([below](#what-is-not-known-yet)).
3. **Learn mode with Claude Code and Codex.**
4. **Planish's own model calls:** the sceptical check, grading, and role-play, which the first release includes *(decided)*.
5. **The paper lane**, built on steps 3 and 4.
6. **Fast on very large codebases:** large-repository defaults, upstream's startup optimisations, TypeScript 7, git's file-system monitor and a local code index ([fork.md](fork.md#performance)).
7. **First release**, tested by hand on Apple silicon: learn mode with Claude Code and Codex, the paper lane with pandoc Markdown, LaTeX and Typst, and the default protections against harmful agent actions, at least the blocks, confirmations and clean-ups, while the turn review's reports and the opt-in packs can follow *(all decided)*; their spec is [protections.md](protections.md).
8. **After it:** the in-house sidebar *(decided)*, then lessons the learner did not ask for and a confined learn agent for untrusted repositories; Windows and Linux releases once each is tested *(decided)*; more templates, Lean checks and the paper lane's [later parts](paper.md#first-release).

## What is not known yet

Each of these is unknown; its linked file says how it will be settled.

- **Whether the learning design works:** no published study found in November 2026 tests it ([learn.md](learn.md#what-is-not-known-yet)).
- **How reliably models fill the templates** ([agent-integration.md](agent-integration.md#unknowns)), and **whether a sandbox can safely run any project's code** ([fork.md](fork.md#running-code)).
- **Where the explain-back attaches to Claude Code and Codex.** If a prototype shows that only a second hook works, the agent kit may add one, at user level with consent *(decided)* ([learn.md](learn.md#what-is-not-known-yet)).
- **Whether the sidebar's agent can be confined**, read-only and reaching only its model. Untrusted folders stay in Restricted Mode, and until that is shown, learn mode teaches only repositories the user trusts *(both decided)* ([fork.md](fork.md#the-agent-that-builds-lessons)).
- **The paper editor's foundations** ([paper.md](paper.md#what-is-not-known-yet)), and **whether extensions that feed VS Code's hidden chat keep working** ([agent-integration.md](agent-integration.md#unknowns)).
- **How far the default protections reach:** whether Planish's environment reaches every command the Claude Code and Codex extensions run, and whether Claude Code's auto-allow can be limited to Planish sessions ([protections.md](protections.md#what-is-not-known-yet)).

## The spec files

- [fork.md](fork.md): building, updating, securing and releasing Planish.
- [agent-integration.md](agent-integration.md): how agents build lessons, in Claude Code, Codex and the in-house sidebar.
- [learn.md](learn.md): learn mode, from curriculum to marking and review.
- [paper.md](paper.md): the paper lane, from the editor to the publish gate.
- [protections.md](protections.md): default protections, the same for every agent, against agent actions users do not want.
