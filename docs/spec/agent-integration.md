# Agent integration

How agents write lessons, how Planish works with the Claude Code and Codex extensions, and how its own sidebar hosts open-source agents. Marks follow the [front page](README.md); *from code* marks behaviour read from an extension's shipped code but not yet run. Sources were read on 4 November 2026.

## The design

Neither Claude Code nor Codex documents support for MCP Apps, the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) extension that lets a tool show an interface ([Claude Code][cc-mcp]; [Codex][codex-mcp]), but any agent can call an MCP tool that writes a file. So agents write lessons as data, and Planish checks and draws them ([front page](README.md#principles-behind-every-design-choice)).

| Work | Runs in | Model access |
|---|---|---|
| Lessons the learner asks for | Claude Code, Codex or the in-house sidebar | The extension's own login; in the sidebar, the user's API key *(decided)* |
| Lessons the learner did not ask for, such as an area's on its first visit | The in-house sidebar, since Planish never starts a run in Claude Code or Codex; it shows the estimated cost first and stops at the learner's budget ([learn.md](learn.md#checking-lessons)) | The user's API key |
| The sceptical lesson check, grading of explanations and role-play | Planish itself ([learn.md](learn.md#role-play)) | An API key the user adds to Planish, through one provider library; the [Vercel AI SDK][ai-sdk] (Apache-2.0) is the candidate |

## The lesson contract

**Decided.** The template catalogue is fixed, and every agent fills it with data ([learn.md](learn.md#lesson-templates)). It includes a diagram template, which agents fill with Mermaid text and Planish renders in the shared sandboxed webview ([fork.md](fork.md#how-the-interface-is-built)). Lessons live in the project, in a folder excluded from git without touching the user's `.gitignore`.

**Proposed.**

- **Schemas.** Each template has a versioned JSON Schema (2020-12) bundled with Planish, which never fetches a remote `$schema`: the 2025 IDEsaster attacks leaked data in part by having an agent write JSON that pointed at a remote schema, which the IDE then fetched ([IDEsaster][idesaster]). Versions follow Google's A2UI catalogues ([A2UI][a2ui-catalogs]): a template's id is its schema's `$id`, a breaking change gets a new major version at a new path, other changes only add, and old major versions keep rendering. A lesson is a flat list of parts that refer to each other by id, as in A2UI and Vercel's [json-render][json-render], since Claude's strict tool use rejects recursive schemas ([docs][claude-strict]).
- **The validator alone decides what renders.** It checks each part against its schema, then what schemas cannot express, such as references between parts, and shows a lesson only once [lesson checking](learn.md#checking-lessons) has passed it. A failed lesson is not shown; Planish lists the errors with a pre-filled "fix these" prompt for the agent that wrote it, and never repairs a lesson by guessing, which made failed turns look like successes in one generative-interface library ([Very Good Ventures][vgv]).
- **Lesson files are untrusted**, since a repository could ship its own: text renders as escaped data, and nothing remote is fetched.
- **Storage.** Lessons go in `.planish/` at the project root, listed in git's per-repository ignore file (`git rev-parse --git-path info/exclude`), which is never committed or shared ([git docs][git-ignore]). Station answer keys stay on the device with the learning records ([front page](README.md#principles-behind-every-design-choice)), since any agent can read the project's files.

## The lesson MCP server

**Decided.** The agent kit registers the server with Claude Code and Codex, and the in-house sidebar injects its tools into every session.

**Proposed.** One server ships inside Planish. Each agent runs it as a local subprocess over stdio, and it reaches Planish through files and, for live state, a local socket only the user's account can open; Planish opens no network port (one possible exception is under [Unknowns](#unknowns)). Until June 2025, Claude Code's IDE extensions accepted WebSocket connections from any website, which could then read files ([CVE-2025-52882][cve]). Each call names its project folder, since MCP has deprecated Roots; the server accepts only folders open in a Planish window and writes only in their `.planish/`. It also serves the paper lane's tools ([paper.md](paper.md#agents)).

| Tool | What it does |
|---|---|
| `lesson_create` | Starts a lesson on a concept, at a commit or on the working tree, and returns a handle, since MCP keeps no session between calls ([changelog][mcp-changelog]) |
| One per template and major version, such as `lesson_code_tour_v1` | Validates and writes one part of a lesson |
| `learner_state` | The learner's level and goals for the concepts in scope |
| `curriculum_state` | Which lessons exist, are done, are due for review, or are stale |
| `station_result` | A code station's answer key and the learner's answer, once the learner has committed an answer or asked to see it |

- A failed call returns `isError: true`, a [JSON Pointer][json-pointer] to the bad field and how to fix it, since the MCP spec has servers validate inputs and report failures as errors a model can act on ([tools][mcp-tools]). After two failed attempts at a part, the part is left out and the learner told.
- No tool that creates a station returns its key ([learn.md](learn.md#code-stations)), which keeps keys out of a tutoring agent's context, though not from one that searches the disk: the risk is a helpful tutor giving the answer away, not an attacker.
- The server implements `server/discover`, which the 2026-07-28 MCP revision requires, beside older versions; lists its tools in a fixed order, which that revision recommends for prompt caching; and uses none of the deprecated Roots, Sampling and Logging ([changelog][mcp-changelog]).

| Client | Limit | So the server |
|---|---|---|
| Claude Code | Flattens a root-level `anyOf`, `oneOf` or `allOf`; can drop tools whose schema fails the 2020-12 meta-schema; cuts server instructions at 4,096 characters by default; warns when a result passes 10,000 tokens ([docs][cc-mcp]) | Has no root-level unions, tests every schema against the meta-schema, and keeps instructions and results short |
| Codex | 10 seconds to start and 60 per call by default; reads project-level servers only in trusted projects ([docs][codex-mcp]) | Starts quickly and returns before slow checks, which Planish runs once the file lands; is installed at user level |
| ACP agents | Must accept stdio servers; should connect to all of them ([ACP][acp-session]) | Is tested with each supported agent, since "should" lets one skip it |

## The agent kit

**Decided.** A `build-lessons` skill, the lesson server's entry and a validator hook are installed once at user level in each agent's settings, after the user agrees; installing the kit writes nothing into any repository. If a prototype shows the explain-back can attach to Claude Code and Codex only through a second hook, the kit may add it, at user level with consent like the rest.

**Proposed.**

| | Claude Code | Codex |
|---|---|---|
| Skill | `~/.claude/skills/build-lessons/` ([docs][cc-skills]) | `~/.agents/skills/build-lessons/` ([docs][codex-skills]) |
| Server entry | User scope, in `~/.claude.json` ([docs][cc-mcp]) | `~/.codex/config.toml`, shared by Codex's CLI, IDE extension and desktop app ([docs][codex-mcp]) |
| Validator hook | Stop hook in `~/.claude/settings.json`, which runs in the extension; exit code 2 keeps Claude working on the errors ([docs][cc-hooks]) | Stop hook in `~/.codex/hooks.json`, which runs once the learner trusts it, a step the docs show only for the CLI and desktop app; `"decision": "block"` sends the errors back as the next prompt ([docs][codex-hooks]) |
| Invoked as | `/build-lessons` | `$build-lessons` |

- The consent screen says what each piece does, where it is written, what the agent's model provider will see, and how to remove it. Planish writes the entries itself, so it needs neither agent's command-line tool, keeps each file's comments and layout, and removes the entries on request; whether writing `~/.claude.json` while Claude Code runs is safe is *(unknown)*.
- One short skill text serves both, using only the standard [Agent Skills][skills-spec] fields, since Claude Code's extra fields break Anthropic's other skill loaders ([docs][cc-skills]); template guidance travels in the server's instructions and tool descriptions, which update with Planish. Every lesson prompt Planish fills in names the skill, since agents often leave a skill unused unless told ([Vercel][vercel-evals], a vendor's evaluation).
- The kit reaches sessions outside Planish too, so its hooks act only in Planish sessions *(decided)*, and the skill acts only when named; the validator hook also exits at once when no lesson file changed.
- The kit also installs the guard hooks and agent settings the [protections](protections.md#what-each-agent-adds) need. Settings that cannot be scoped to Planish sessions, which switch on an agent's own sandbox or lock its bypass modes, apply machine-wide, and the consent screen says so *(decided)*.
- Hooks are a guardrail, "not a complete enforcement boundary" in Codex's words ([docs][codex-hooks]); the validator decides, and Planish says where to approve a Codex hook not yet trusted.
- The entry and the hook call a small launcher kept outside the app, which does nothing once Planish is gone, since deleting a macOS app runs no uninstaller.

## Claude Code and Codex

**Decided.** Both stay ordinary extensions with their own logins, as in VS Code. Planish never starts a run on a user's subscription login and never wraps their command-line tools; it reaches them only through the agent kit and by opening their panel with a pre-filled prompt, which the learner sends.

The vendors' terms point the same way: Anthropic "does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users" ([Anthropic][cc-legal]), and OpenAI recommends API keys for automation ([OpenAI][codex-auth]).

**Proposed.** One function makes every hand-off: it builds a short prompt with the learner's level and goals, asked in Planish's own interface rather than through MCP forms, selects the code and opens the panel. Undocumented routes are used only on tested versions, each with a fallback. VS Code hands an extension only links in the product's own scheme, such as `planish://anthropic.claude-code/open?prompt=…`; Planish opens them through a workbench command that uses the URL service's `trusted` option, skipping the "Allow … to open this URI?" question for its own calls only (*from code*; [extensionUrlHandler.ts][url-handler]), rather than adding either extension to `trustedExtensionProtocolHandlers`, which would also trust links from web pages.

As of Claude Code 2.1.318 and the Codex release of 26 October 2026:

| | Claude Code | Codex |
|---|---|---|
| Open with a pre-filled prompt | Documented link (since 2.1.72): the prompt "is pre-filled but not submitted automatically" ([docs][cc-vscode]) | Undocumented ([docs][codex-ide]); its home view reads a `prompt` parameter (*from code*). Fallback: open its sidebar and attach the file |
| Another extension sends a prompt | No (*from code*) | No (*from code*) |
| MCP forms (elicitation) | Declined; no form appears (*from code*) | Shown (*from code*) |
| Proposed APIs | None | Two, allow-listed ([fork.md](fork.md#proposed-apis)); without them it loses only a listing in VS Code's sessions view and Copilot-billed inference (*from code*) |

## The in-house sidebar

**Decided.** Planish's own built-in extension hosts open-source agents over the Agent Client Protocol (ACP), each as a separate process, with no change to VS Code's core; OpenCode is the default engine, and any ACP agent can be swapped in. It injects the lesson tools into every session and runs on the user's own API keys only. VS Code's built-in chat is hidden, not forked ([fork.md](fork.md#microsofts-agent-stack)). Learn mode teaches only repositories the user trusts until the sidebar's agent is shown to be confined, read-only and reaching only its model ([fork.md](fork.md#the-agent-that-builds-lessons)); untrusted folders stay in [Restricted Mode][trust-docs], and a confined learn agent for them is on the roadmap.

In [ACP][acp-overview] (Apache-2.0), agents run as subprocesses of the editor, which handles their permission requests, file access and terminals; each session starts with a working directory and a list of MCP servers ([session setup][acp-session]). About 50 agents are listed ([agents][acp-agents]), among them [OpenCode][opencode], which is MIT-licensed. Open agents come and go, so the engine must stay swappable: between May and June 2026, Roo Code shut down, Void was archived and Continue became read-only ([Roo Code][roo]; [Void][void]; [Continue][continue]).

**Proposed.**

- The sidebar is a view in VS Code's secondary sidebar, where Claude Code and Codex put theirs. Its sessions also get the build-lessons instructions, and failed lessons go straight back to the agent, so it needs no hook.
- Requests go from the user's machine straight to the provider, as in VS Code's own bring-your-own-key chat ([VS Code 1.122][vsc-1122]), with keys kept as [fork.md](fork.md#api-keys) describes. Planish runs no server between users and their models today, though an optional hosted service is not ruled out.
- Each turn shows its cost: the token usage the provider reports, cached input included, times a price table Planish keeps. Anthropic, OpenAI and Gemini all report cached input ([Anthropic][anthropic-cache]; [OpenAI][openai-cache]; [Gemini][gemini-cache]), and the fixed catalogue keeps tool definitions and skill text stable, so they cache well.
- Planish neither ships nor suggests adapters that run Claude Code or Codex; one a learner swaps in runs only on the API key Planish supplies.
- Interface, in this order: chat with approvals docked above the message box and a visible, editable plan; review of agent edits in VS Code's diff editor, with the explain-back first when learn mode is on ([learn.md](learn.md#explain-back-on-agent-changes)); checkpoints; comments on lessons and plans. [Cursor 3][cursor-3] and [Antigravity][ag-changelog] set this bar.

## Untrusted repository text

**Proposed.** Every prompt Planish builds, from pre-filled prompts to grader calls, carries repository text and role-play scripts only inside marked reference blocks, after instructions to explain such text, never obey it. Hidden instructions in what agents read, such as invisible Unicode in a rules file, have steered agents into inserting malicious code and leaking private code ([Pillar Security][pillar]; [Legit Security][camoleak]), and learn mode, by design, reads code the user did not write. The blocks lower that risk without removing it, so nothing else depends on them.

- Invisible Unicode is stripped and HTML comments are flagged before text reaches a model, and both are shown to the learner; a paper's source comments reach a model only as parsed fields.
- A session should hold at most two of untrusted input, sensitive data and outside communication ([Meta][rule-of-two]), hence the limits on the sidebar's agent ([fork.md](fork.md#the-agent-that-builds-lessons)).
- The kit lives at user level, where a repository cannot change it.

Claude Code and Codex also read the repository themselves, beyond these measures.

## Order of work

**Decided.** The first release carries both lanes, with Claude Code and Codex covering learn mode; the in-house sidebar comes after it. The first release also ships the default protections against agent actions users do not want, at least the blocks, confirmations and clean-ups; the turn review's reports and the opt-in packs can follow ([protections.md](protections.md#the-default-policy)). The rest of the order is on the [front page](README.md#order-of-work).

## Unknowns

| Question | What depends on it | Cheapest way to settle it |
|---|---|---|
| Does what is marked *from code* hold at runtime, with `planish://` links and hooks working in both panels, and can only Planish's own code call the `trusted` command? Can a Codex user trust a hook without the CLI or desktop app? Where can the explain-back attach? | Opening the agents; the repair loop; a second hook | A day of tests in a Planish build |
| How often does each model fill each template validly, and do Claude Code or Codex constrain tool arguments to the schema? On one vendor's benchmark of generic interfaces, the nine best models produced valid output 96.2–99.5% of the time and Ministral 8B 27.2% ([OpenUI][openui]); nothing measures lessons | Which templates each model is offered; how often repair runs | An evaluation per model and template |
| How does OpenCode take API keys, report each turn's usage, connect to the lesson server and behave over ACP, and can it be kept from loading a repository's own agent configuration? If it reports no usage, a relay in the sidebar's extension, on a loopback port with a per-session secret, could read usage from the provider's replies and hand the agent a placeholder key ([fork.md](fork.md#api-keys)) | The default engine; per-turn cost | A prototype |
| Can each agent be held to the API key Planish supplies when the user's own CLI has stored a subscription login? The Claude ACP adapter has a flag that refuses such turns ([claude-agent-acp][hide-auth]); codex-acp supports ChatGPT login ([codex-acp][codex-acp]) | API keys only | The same prototype |
| Do extensions that give VS Code's chat language-model tools or MCP servers keep working with that chat hidden? Planish's sidebar can declare the proposed `mcpServerDefinitions` API ([VS Code source][copilot-ext]), which may not be enough | The extensions promise ([fork.md](fork.md#extensions)) | Test the most-installed such extensions |

[cc-mcp]: https://code.claude.com/docs/en/mcp "Claude Code docs: MCP"
[codex-mcp]: https://learn.chatgpt.com/docs/extend/mcp?surface=cli "Codex docs: MCP"
[ai-sdk]: https://github.com/vercel/ai "Vercel AI SDK"
[idesaster]: https://maccarita.com/posts/idesaster/ "IDEsaster, 6 Dec 2025"
[a2ui-catalogs]: https://a2ui.org/concepts/catalogs/ "A2UI: catalogs"
[json-render]: https://github.com/vercel-labs/json-render "Vercel json-render"
[claude-strict]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs "Claude docs: structured outputs"
[vgv]: https://verygood.ventures/blog/benchmarking-llms-for-gen-ui/ "Very Good Ventures, 23 Jul 2026"
[git-ignore]: https://git-scm.com/docs/gitignore "git docs: gitignore"
[cve]: https://www.cve.org/CVERecord?id=CVE-2025-52882 "CVE-2025-52882"
[mcp-changelog]: https://modelcontextprotocol.io/specification/2026-07-28/changelog "MCP 2026-07-28: changes"
[json-pointer]: https://www.rfc-editor.org/rfc/rfc6901 "RFC 6901: JSON Pointer"
[mcp-tools]: https://modelcontextprotocol.io/specification/2026-07-28/server/tools "MCP 2026-07-28: tools"
[acp-session]: https://agentclientprotocol.com/protocol/session-setup "ACP: session setup"
[cc-skills]: https://code.claude.com/docs/en/skills "Claude Code docs: skills"
[cc-hooks]: https://code.claude.com/docs/en/hooks "Claude Code docs: hooks"
[codex-skills]: https://learn.chatgpt.com/docs/build-skills "Codex docs: skills"
[codex-hooks]: https://learn.chatgpt.com/docs/hooks "Codex docs: hooks"
[cc-vscode]: https://code.claude.com/docs/en/vs-code "Claude Code docs: VS Code"
[skills-spec]: https://agentskills.io/specification "Agent Skills specification"
[vercel-evals]: https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals "Vercel, 27 Jan 2026"
[cc-legal]: https://code.claude.com/docs/en/legal-and-compliance "Claude Code docs: legal and compliance"
[codex-auth]: https://learn.chatgpt.com/docs/auth "Codex docs: authentication"
[url-handler]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/browser/extensionUrlHandler.ts "VS Code: extensionUrlHandler.ts"
[codex-ide]: https://learn.chatgpt.com/docs/codex/ide "Codex docs: IDE extension"
[trust-docs]: https://code.visualstudio.com/docs/editing/workspaces/workspace-trust "VS Code docs: Workspace Trust"
[acp-overview]: https://agentclientprotocol.com/protocol/overview "ACP: overview"
[acp-agents]: https://agentclientprotocol.com/get-started/agents "ACP: agents"
[opencode]: https://github.com/anomalyco/opencode "OpenCode"
[roo]: https://github.com/RooCodeInc/Roo-Code "Roo Code"
[void]: https://github.com/voideditor/void "Void"
[continue]: https://github.com/continuedev/continue "Continue"
[vsc-1122]: https://code.visualstudio.com/updates/v1_122 "VS Code 1.122 release notes"
[anthropic-cache]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching "Anthropic: prompt caching"
[openai-cache]: https://developers.openai.com/api/docs/guides/prompt-caching "OpenAI: prompt caching"
[gemini-cache]: https://aistudio.google.com/docs/caching "Gemini API: caching"
[cursor-3]: https://cursor.com/blog/cursor-3 "Cursor 3, 2 Apr 2026"
[ag-changelog]: https://antigravity.google/docs/changelog/ "Antigravity changelog"
[pillar]: https://www.pillar.security/blog/new-vulnerability-in-github-copilot-and-cursor-how-hackers-can-weaponize-code-agents "Pillar Security, 18 Mar 2025"
[camoleak]: https://www.legitsecurity.com/blog/camoleak-critical-github-copilot-vulnerability-leaks-private-source-code "Legit Security, 30 Sep 2025"
[rule-of-two]: https://ai.meta.com/blog/practical-ai-agent-security/ "Meta AI: Agents Rule of Two, 31 Oct 2025"
[openui]: https://www.openui.com/benchmarks/agent.md "OpenUI benchmark, 25 Aug 2026"
[hide-auth]: https://github.com/agentclientprotocol/claude-agent-acp/blob/main/src/hide-claude-auth.ts "claude-agent-acp: hide-claude-auth"
[codex-acp]: https://github.com/agentclientprotocol/codex-acp "codex-acp"
[copilot-ext]: https://github.com/microsoft/vscode/blob/1.144.0/extensions/copilot/package.json "VS Code 1.144.0: Copilot extension manifest"
