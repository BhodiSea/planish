# Decisions

These are Planish's decisions, made by the maintainer: the ones that set what Planish is, how it is built and how the project is run. Each links to the spec section or file that carries it. Everything else in the [spec](spec/README.md) is a proposal or an open question, and is marked as such.

## What Planish is

- **An open-source code editor that teaches people to understand what AI agents make for them**: the code in their repository, the mathematics in it and the research papers they publish. It is VS Code's open-source code built with VSCodium's scripts, with two lanes on top. In learn mode, whichever agent the user runs fills a fixed catalogue of lesson templates to build a curriculum of their codebase, and Planish checks each lesson against the code before showing it. In the paper lane, an author works on a paper's own source files in a live-preview editor, beside an agent that explains anything they do not understand. ([What Planish is](spec/README.md#what-planish-is))
- **For people aged 18 and over, for now.** It serves people learning to understand code that agents wrote, from a first program to an unfamiliar codebase, and authors who must understand an AI-drafted paper before publishing it. Younger learners would need a design of their own. ([Who it is for](spec/README.md#who-it-is-for))
- **Not a new coding agent or a model seller.** Planish hosts the agents people already use. Cogvera Labs pays none of its users' model costs: users bring their own API keys or subscriptions, and Planish ships no model access, credits or proxy paid for by Cogvera Labs. ([What it is not](spec/README.md#what-it-is-not))
- **Four requirements.** Planish runs the extensions people already use, in the words of the promise below; it is fast on very large codebases; it is familiar to people coming from VS Code, Cursor and Antigravity; and its interface is world-class. ([The four requirements](spec/README.md#the-four-requirements-as-commitments))
- **No telemetry, and records stay on the device.** Planish never sends usage data automatically. Learning records, the paper lane's provenance log and agents' session logs stay on the user's device, outside the repository, seen only by the user, and are never uploaded. To move a paper between their own machines, the author exports its provenance log, with the device's copy of the AI draft, as one local file and imports it on the other, so the rewrite and the overlap check carry on there. ([Principles](spec/README.md#principles-behind-every-design-choice); [Provenance](spec/paper.md#provenance))

## The first release

- **Both lanes, on macOS for Apple silicon.** The first release carries learn mode, through Claude Code and Codex, and the paper lane, with pandoc Markdown, LaTeX and Typst. It is tested by hand on Apple silicon; CI builds Windows and Linux from the start, and each is released once tested. ([Order of work](spec/README.md#order-of-work); [Build, release and updates](spec/fork.md#build-release-and-updates))
- **Default protections against harmful agent actions**: the blocks, confirmations and clean-ups ship in the first release; the turn review's reports and the opt-in packs can follow. ([The default policy](spec/protections.md#the-default-policy))
- **Planish's own sidebar comes after the first release.** ([Order of work](spec/agent-integration.md#order-of-work))

## The fork

- **A fork of VSCodium's MIT build repository.** It holds no VS Code source: the build fetches VS Code at a pinned release tag and applies VSCodium's patches, which strip Microsoft's branding, telemetry, Marketplace and closed Copilot parts; Planish's own patches and folders sit on top. Planish's edits to upstream files are fenced and kept few. ([The repository](spec/fork.md#the-repository))
- **Removals are fenced too.** A line Planish removes from a VSCodium or VS Code file is kept in a fence as a comment, as Positron does, so that no change to an upstream file goes unmarked. So is a line that a change to one of VSCodium's patches drops: it stays in the patch as a comment in a fence, a VS Code line whose removal Planish undoes is added back in a fence, and in strict JSON the patch keeps the line and an overlay changes it. ([The repository](spec/fork.md#the-repository))
- **The name is Planish**, and the launcher, the URL scheme and other lowercase identifiers are `planish`. ([The repository](spec/fork.md#the-repository))
- **Upstream release tags only, kept current.** Planish rebases onto each VS Code release that VSCodium adopts, and moves to a newer release itself once it is 8 weeks behind upstream or when the Electron it ships nears its end of life. It never builds upstream's `main`. Fixes for Chromium bugs exploited in the wild ship within days. ([Keeping up with upstream](spec/fork.md#keeping-up-with-upstream); [Electron and Chromium](spec/fork.md#electron-and-chromium))
- **Microsoft's closed agent parts are deleted, as VSCodium deletes them, and VS Code's MIT chat interface stays hidden, not forked.** Planish's own sidebar is a view of its own. ([Microsoft's agent stack](spec/fork.md#microsofts-agent-stack))
- **The extensions promise**, word for word: "Runs the VS Code extensions you already use, from Open VSX or any .vsix you are licensed to use; for Microsoft's few extensions licensed only for its products, we list open replacements. An extension that works in VS Code at the same version but not here is a bug." Open VSX is the registry, as VSCodium sets it. ([Extensions](spec/fork.md#extensions); [Services Microsoft runs](spec/fork.md#services-microsoft-runs))
- **Open stand-ins are recommended, never bundled.** When a file type calls for a Microsoft extension licensed only for Microsoft's products, Planish recommends an open stand-in, such as basedpyright, clangd, CodeLLDB, open-remote-ssh or open-remote-wsl. ([Stand-ins for Microsoft's extensions](spec/fork.md#stand-ins-for-microsofts-extensions))
- **Releases are signed as Cogvera Labs**: on macOS through the Apple Developer Program as an organisation, and on Windows with Azure Artifact Signing. Development builds stay unsigned until releases begin. ([Build, release and updates](spec/fork.md#build-release-and-updates))
- **Releases update from a `versions` branch of this repository**, which a release workflow writes with its own token when a release is published. A release whose notes have a line starting `Security fix:` is offered at once, without the 120-hour wait, and so is a release published within that release's wait, which holds its fix. ([Build, release and updates](spec/fork.md#build-release-and-updates))
- **An Electron raise for a Chromium fix may move to any newer Electron release within VS Code's Electron major version.** ([Electron and Chromium](spec/fork.md#electron-and-chromium))
- **Prototypes live in a top-level `prototypes/<name>/` folder**, each with its own README and workflow, outside the build. ([The repository](spec/fork.md#the-repository))
- **CI builds Planish in its own workflow, `ci.yml`**: macOS on Apple silicon, Windows x64 and Linux x64, with no secrets and least privilege. VSCodium's build and release workflows are deleted, and each sync keeps them deleted. ([Build, release and updates](spec/fork.md#build-release-and-updates))

## Speed on very large codebases

Decided on 7 November 2026.

- **Parity with VS Code, and a target beyond it.** With learning features off, Planish matches the startup, typing and memory of the same VS Code release, checked against Microsoft's build as well as VSCodium's. Its target is to be faster than Microsoft's build in the large-repository scenarios; the target guides Planish's own work and is not a claim Planish makes. ([Fast on very large codebases](spec/README.md#2-fast-on-very-large-codebases); [Large repositories](spec/fork.md#large-repositories))
- **Large-repository defaults ship from a built-in extension with no code**, which excludes dependency and build folders from watching and turns off following symlinks in search. This replaces the rule that VS Code's watcher and search settings stay as shipped. ([Indexing](spec/fork.md#indexing))
- **TypeScript 7 is bundled and on by default**, and projects that rely on tsserver plugins keep the JavaScript-based server. ([Large repositories](spec/fork.md#large-repositories))
- **The editor's own git status calls use git's file-system monitor in large repositories**, and Planish offers, with the user's consent, to optimise the repository's own configuration. ([Large repositories](spec/fork.md#large-repositories))
- **A local n-gram code index is planned now**, not only if the code-search budget fails. ([Indexing](spec/fork.md#indexing))
- **Planish keeps the startup work in upstream's build**: its build passes `--mangle-privates`, which VSCodium's drops, and CI checks that each build has the Node compile cache VS Code packages for its platform. ([Large repositories](spec/fork.md#large-repositories))

## Agents

- **Claude Code and Codex stay ordinary extensions with their own logins**, as in VS Code. Planish never starts a run on a user's subscription login and never wraps their command-line tools. It reaches them through the agent kit, and by opening their panel with a prompt filled in, which the user sends. ([Claude Code and Codex](spec/agent-integration.md#claude-code-and-codex))
- **The agent kit** is a build-lessons skill, the lesson MCP server's entry and a validator hook, installed once at user level in each agent's settings after the user agrees. Installing it writes nothing into any repository. If a prototype shows that the explain-back can attach to Claude Code and Codex only through a second hook, the kit may add one, installed the same way. ([The agent kit](spec/agent-integration.md#the-agent-kit))
- **The in-house sidebar** is Planish's own built-in extension. It hosts open-source agents over the Agent Client Protocol (ACP), each as a separate process, with no change to VS Code's core. OpenCode is the default engine, and any ACP agent can be swapped in. The lesson tools are injected into every session, and the sidebar runs on the user's own API keys only. ([The in-house sidebar](spec/agent-integration.md#the-in-house-sidebar))
- **Lessons live in the project**, in a folder excluded from git automatically; the user's `.gitignore` is not touched. ([The lesson contract](spec/agent-integration.md#the-lesson-contract))

## Learn mode

- **Opt-in, and only in repositories the user trusts** until the in-house sidebar's agent is shown to be confined: read-only, and reaching only its model. Untrusted folders stay in Restricted Mode, and a confined learn agent for untrusted repositories is on the [roadmap](roadmap.md). ([Turning it on](spec/learn.md#turning-it-on); [The agent that builds lessons](spec/fork.md#the-agent-that-builds-lessons))
- **One fixed catalogue of lesson templates**, which every agent fills with data. It includes a diagram template: agents write Mermaid text, and Planish draws it in its shared sandboxed webview. ([Lesson templates](spec/learn.md#lesson-templates))
- **The user chooses how lessons are checked.** By default: tools (the compiler, tests and find-references), then one sceptical model check, starting with a costed pilot of 2–4 lessons under a budget cap. The other settings are tools only, and a full pipeline of several model checkers. ([Checking lessons](spec/learn.md#checking-lessons))
- **Two kinds of station in the first release.** Code stations are marked by running the code: predict the output, find the line, fix the bug. In AI role-play, a simulated reviewer or the code's original author questions the learner; it needs hidden scripts, a separate grader that alone holds the key, buffered replies with a leak guard, and its own message caps. ([Stations](spec/learn.md#stations))
- **Help when stuck, in code and in maths:** a hint first, a worked explanation after the learner has made an attempt, and a deliberate "show me" that always gives the answer. ([Help when stuck](spec/learn.md#help-when-stuck))
- **An explain-back on agent changes.** With learn mode on, a short explain-back appears before the learner accepts an agent's change. It can be skipped, and skips are logged for the learner only. ([Explain-back on agent changes](spec/learn.md#explain-back-on-agent-changes))
- **Review in place.** Review items are anchored to code and appear when that code is opened, scheduled by FSRS-6, and changed code is re-taught. The first release has no separate review page and no daily review session. ([Review in place](spec/learn.md#review-in-place))
- **Model grades of explanations are advisory** until the user's model passes a calibration set shipped with Planish; then they count towards mastery. ([Marking](spec/learn.md#marking))
- **Runs of a project's code refuse loopback by default**, as they refuse the network; the learner may allow loopback for one project, with a warning. ([Running code](spec/fork.md#running-code))

## The paper lane

- **Two modes, chosen for each paper:** rewrite an AI draft by hand, or write first and use AI only to explain and check. ([Two modes](spec/paper.md#two-modes))
- **What counts as rewritten by hand is the author's setting.** By default the draft paragraph hides while the author writes their own: peeks are logged, paste from the draft is refused, numbers, equations and citations are checked against their sources rather than retyped, and an override needs a reason. Other settings include writing with the draft visible, and claims only, under which overlap with the AI draft is reported, not blocking, and every claim must instead be checked against its source and explained by the author. ([Rewriting by hand](spec/paper.md#rewriting-by-hand))
- **The editor is a CodeMirror 6 live preview in a webview, over the paper's own files.** It never rewrites bytes the author has not touched, and one key switches to the plain source in VS Code's own editor, where every extension works. ([The editor](spec/paper.md#the-editor))
- **Three source formats: pandoc Markdown, LaTeX and Typst.** Builds use the project's own pinned toolchain, with a pandoc-to-LaTeX build for venues that require LaTeX. ([Source formats and builds](spec/paper.md#source-formats-and-builds))
- **Any agent can work in the lane** through its MCP tools for the selection, sources and checks. Agents' edits are detected and labelled as agent text. ([Agents](spec/paper.md#agents))
- **The publish gate blocks on mechanical checks only**: unfilled placeholders, unresolved citations, leftover AI text, overlap with the AI draft (except under claims only) and sentences not yet rewritten. Understanding checks must be attempted, and their results are recorded, not scored. ([Checks and the publish gate](spec/paper.md#checks-and-the-publish-gate))

## Protections

- **One policy for every agent, enforced at what Planish owns**: OS-level fences, a project snapshot before each turn or command, a process supervisor, per-session temp folders and an end-of-turn review of at most three flags. Agents' hooks explain a refusal to the agent but are not the boundary. ([The approach](spec/protections.md#the-approach))
- **The default policy**: 15 narrow blocks, 11 silent clean-ups, 51 confirmations for rare acts nothing can undo, 48 reports after the turn and 11 opt-ins; harness-style rules are opt-in packs. ([The default policy](spec/protections.md#the-default-policy))
- **The agent kit's hooks act only in Planish sessions.** Settings that cannot be scoped, which switch on an agent's own sandbox or lock its bypass modes, apply machine-wide, and the consent screen says so. ([What each agent adds](spec/protections.md#what-each-agent-adds))
- **A network filter on the device for agents without a sandbox of their own** (Cline, Kilo Code and the in-house sidebar): an allowlist holding the model provider and the hosts the user approves, each asked once, with no Cogvera Labs server involved. ([What each agent adds](spec/protections.md#what-each-agent-adds))
- **An optional administrator lock** for schools and shared machines: managed settings that only an administrator can change. Without it, protections live in user-level settings, and changes to them are flagged in the turn review. ([Administrator lock](spec/protections.md#administrator-lock))
- **An opt-in calibration export, in beta**, of how often each flag and confirmation fired, with no content. The user reviews it and sends it themselves; it is never sent automatically. ([Calibration export](spec/protections.md#calibration-export))

## How the project is run

- **Built in public, and led by Cogvera Labs**, with one maintainer for now and a second when review load demands it. ([What Planish is](spec/README.md#what-planish-is))
- **New code is Apache-2.0.** VS Code's source and the files from VSCodium stay MIT. ([Licences and sign-off](spec/fork.md#licences-and-sign-off))
- **Every commit new to Planish is signed off under the Developer Certificate of Origin, and there is no contributor licence agreement.** VSCodium's commits, which each sync brings in, are exempt. ([Licences and sign-off](spec/fork.md#licences-and-sign-off))
- **The code of conduct is the Contributor Covenant**, with info@cogveralabs.ai as the contact. ([Code of conduct](https://github.com/BhodiSea/planish/blob/main/CODE_OF_CONDUCT.md))
