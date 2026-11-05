# Learn mode

Learn mode teaches people their codebase, including what their agents write. Planish, not the agent, controls the order of steps, when answers are revealed and the answer keys, since an output style "doesn't guarantee that something always happens or never happens" ([Claude Code docs][styles]). Marks follow the [front page](README.md).

## Turning it on

**Decided.** Learn mode is opt-in. In the first release it works through Claude Code and Codex; the in-house sidebar comes after. Until the sidebar's agent is shown to be confined (read-only, reaching only its model; [fork.md](fork.md#the-agent-that-builds-lessons)), learn mode teaches only repositories the user trusts. Untrusted folders stay in Restricted Mode, and a confined learn agent for untrusted repositories is on the [roadmap](../roadmap.md).

Turning it on adds a Learn view, a status-bar count of due items and markers beside the code; turning it off restores the layout. A [walkthrough][vsc-walk], VS Code's onboarding surface, opens then, never at start-up or after an update. It connects an agent, sets how lessons are checked and a budget, places the learner in a first area, such as a folder, and opens a lesson; there is no webview wizard, which VS Code's [guidelines][vsc-webview-ux] advise against.

Learn mode's own model calls (the sceptical check, grading and role-play) need an API key added to Planish ([agent-integration.md](agent-integration.md#the-design)). Without one, as the walkthrough explains, lessons are checked by tools only and labelled "not model-checked", with no role-play or grading; whether the sceptical check could run in the user's own agent instead is *(unknown)*.

## What it teaches, and in what order

1. What the system does for its users.
2. Its architecture, as hypotheses confirmed in the code.
3. Its runtime model, or "notional machine", such as its event loop ([Sorva 2013][sorva]).
4. Its main flows, traced from their entry points.
5. The rest on demand, such as an agent's diff.

Programmers alternate top-down hypotheses with a bottom-up model of control flow ([Brooks 1983][brooks]; [von Mayrhauser & Vans 1995][vmv]), professionals built the control-flow model before the domain model ([Pennington 1987][pennington]), and maintainers who traced the whole program systematically made correct changes where as-needed readers erred ([Littman et al. 1987][littman]). Developers avoid comprehension where they can ([Roehm et al. 2012][roehm]), so the core is short. These are lab studies of short programs, and no study found tests an order for a real codebase *(unknown)*.

Lessons on an agent's change teach where it connects, what it duplicates or bypasses, and how it fails. In the closest study (21 participants, mostly students), the eight who pasted an AI's plan and code scored 0.36, against 0.76 for those who first built their own model, and seven of the eight drew the architecture incompletely or wrongly ([Alakmeh et al. 2026][aireli]). Why a change was made comes from the session's record (prompt, approved plan, tool calls, test output), checked against the diff, not the agent's summary: in one test, a reasoning model mentioned a hint it had used only a quarter of the time ([Anthropic 2025][faithful]). The kit's hook locates Claude Code's and Codex's transcripts, whose formats are undocumented *(unknown)*; only the record is kept, on the device, and without one these lessons are not offered.

An area's lessons are written on its first visit, within the learner's budget: by Claude Code or Codex from a prompt the learner sends, or unasked by the in-house sidebar ([agent-integration.md](agent-integration.md#the-design)).

### Placement

Placement is per concept: one person can be expert in a language and a novice in the library a codebase uses. Short probes, such as asking for a solution's first step, correlated up to 0.92 with full tests in a fraction of the time ([Kalyuga & Sweller 2004][kalyuga]). Novices get full scaffolding and experts skip it: heavy assistance helps learners with little prior knowledge (d = 0.51) and hurts those with a lot (d = −0.43) ([Tetzlaff et al. 2025][tetzlaff]). A prerequisite graph lets one answer place several concepts *(unknown)*; a scoped language-server query checks each link the agent proposes. A skipped concept counts as known only once its probe is passed.

## Lesson templates

**Decided.** The catalogue is fixed, and every agent fills it with data. It includes a [Mermaid][mermaid] diagram template, filled as text and rendered in the shared sandboxed webview ([fork.md](fork.md#how-the-interface-is-built)).

Schemas and the validator are in [agent-integration.md](agent-integration.md#the-lesson-contract).

| Template | The learner | Key or check |
|---|---|---|
| Code tour | steps through the real files ([CodeTour][codetour]-compatible) | each stop exists |
| Explanation with a question | reads an explanation beside the code, then answers | the lesson's checks; [marking](#marking) |
| Diagram *(decided)* | reads a diagram of the code | the lesson's checks |
| Symbol table | matches each symbol of an equation, in every sense, to its meaning, shape or unit, and variable | each variable exists |
| Equation and code | sees an equation beside its function, predicts an output, then changes a term | the [check ladder](#maths) |
| [Code station](#code-stations) | predicts an output, finds a line or fixes a bug | running the code |
| [Role-play station](#role-play) | is questioned | a separate grader |

Explanations sit beside the code: anchored explanations produced more correct comprehension answers than a chat assistant ([Yan et al. 2024][ivie]). They favour purpose, since line-by-line explanations drew the most views but were rated least useful, though not significantly ([MacNeil et al. 2023][macneil]), and end with a question, which lifted comprehension in a study of reading aids ([August et al. 2023][paperplain]). Predicting before running is the first step of PRIMM, which beat a control group across 493 pupils ([Sentance et al. 2019][primm]); tracing and explaining code together accounted for 46% of the variance in students' ability to write it ([Lopez et al. 2008][lopez]).

Parsons problems, whose results are mixed and unreplicated ([Du et al. 2020][du]), traces and a concept map come later. They need, in turn, a keyboard-operable ordering component, which no Parsons component found documents; a debugger's recording per language, through the [Debug Adapter Protocol][dap]; and a code graph.

## Stations

**Decided.** The first release has two kinds of station, each with explanations, checks and review: code stations marked by running the code (predict the output, find the line, fix the bug), and AI role-play, in which a simulated reviewer or the code's original author questions the learner. Role-play needs hidden scripts, a separate grader that alone holds the key, buffered replies with a leak guard, and its own message caps.

### Code stations

Each key comes from running the code or from the language server, never from the agent ([agent-integration.md](agent-integration.md#the-lesson-mcp-server)). A bug is real, from the project's history (a fixing commit and its test, with the fix undone), or a planted change an existing test catches; the fix goes in a scratch copy, never the learner's files. Code runs only in a sandbox that is *(unknown)* until built ([fork.md](fork.md#running-code)); code that cannot run there gets no station.

### Role-play

Planish makes the actor's and grader's calls itself, never through the Claude Code or Codex panels, so it sees every reply first.

- **Hidden script:** what the simulated person knows, revealed only as the learner's questions call for it. An original author's script cites the project's history, docs and public issues, so the actor does not invent reasons, and enters prompts only as [reference data](agent-integration.md#untrusted-repository-text). Its writer does not play it.
- **Grader:** only it sees the key, with a rubric and the finished transcript; it never talks to the learner, and its marks are [advisory](#marking) until calibrated. What the code does comes from a run, never from the actor.
- **Leak guard:** each reply is buffered whole, since a stream can split a term, and blocked if it contains a term the script protects, after normalising case, spacing, look-alikes and identifier forms. Paraphrases and replies out of role get past, for the grader to flag; how well this holds is *(unknown)*.
- **Message caps** per run and per day, at values a prototype sets *(unknown)*, show what is left: each turn costs the user money, and models drift from their instructions within eight rounds of conversation ([Li et al. 2024][drift]).

## Help when stuck

**Decided.** In code and in maths: a hint first, a worked explanation after the learner has made an attempt, and a deliberate "show me" that always gives the answer ([evidence](README.md#principles-behind-every-design-choice)).

All three are written and checked with the lesson, and need no model when used. "Show me" is never refused or delayed; its use is recorded for the learner alone, and the item is scheduled as not yet known. A wrong answer gets feedback, not necessarily a conversation: in one trial, tutoring every error cut how much pupils covered, and coverage predicted their test scores, an exploratory result ([Google and Eedi 2026][eedi]).

## Explain-back on agent changes

**Decided.** With learn mode on, a short explain-back appears before the learner accepts an agent's change. It can be skipped, and skips are logged for the learner only. If a prototype shows it can attach to Claude Code and Codex only through a second hook, the [agent kit](agent-integration.md#the-agent-kit) may add one, at user level with consent.

It asks one or two questions on the change's place in the system, such as what it connects to, and the answer becomes a review item on the changed code. Where it appears with Claude Code and Codex is *(unknown)*; in the in-house sidebar it is part of [reviewing the agent's edits](agent-integration.md#the-in-house-sidebar).

Developers barely look at AI output: inline suggestions got about 0.9 seconds of attention, half of them none ([Alakmeh, D'Angelo & Fritz 2026][eyeforai]), and 54.9% of merged pull requests written with Claude Code went in unmodified ([Watanabe et al. 2026][watanabe]). Of seven techniques, only asking learners what each step needs before its code appears brought their sense of their ability into line with their actual ability, at 1.82 times the time ([Kazemitabaar et al. 2025][lnr]).

## Review in place

**Decided.** Review items are anchored to code and appear when that code is opened, scheduled by FSRS-6; changed code is re-taught. The first release has no separate review page and no daily review session.

- **Anchor:** path, line range, enclosing symbol, a hash of the normalised text and, once committed, the commit; moved code is found by symbol and git's rename detection. Without git, which Planish offers to start, anchors are paths and hashes only, and there are no fix-the-bug stations from history.
- **Surfacing:** opening a file shows a dismissible count of its due items and a marker beside each symbol with one. Each item says why it is due: an opaque queue left one learner with "a feeling of passivity" ([Matuschak 2024][matuschak]).
- **Entry:** answering an item, editing its code or doing an explain-back, never just viewing a lesson; new items per day are capped. Familiarity with code tracked how often developers had edited it (ρ = 0.67), not how closely they had followed others' changes (ρ = 0.04) ([Krüger et al. 2018][kruger]), so code an agent committed under the user's name does not count as known.
- **Scheduling:** FSRS-6, Anki's open scheduler, from fsrs-rs 6.6.2 as [Anki 26.09][anki] ships it, or a port pinned to FSRS-6, validated on predicting recall over about 350 million reviews ([srs-benchmark][srsbench]), not on learning gains. First intervals are at least about a day: current performance is "a highly unreliable index" of learning ([Bjork & Bjork 2011][bjork]).
- **No silent rescheduling:** a change that would move due dates, such as fitting the scheduler to the learner's reviews (which beat the defaults at predicting recall in the benchmark, for FSRS-7), shows what it would move and needs the learner's agreement. Graded reviews go into an append-only log with the state before and after.

### When the code changes

When an anchor's file is opened and its hash no longer matches, Planish finds moved code and, in the background, recomputes the key by running the code and re-runs the claim checks:

| Result | What happens |
|---|---|
| Both hold | the item and its schedule stay |
| Either fails | the item is retired, and the change taught as a new item next time that code is opened; items on dependent code, found by a time-capped references query, are re-checked the same way |
| The code is gone | the item is retired |

This is untested *(unknown)*, and no learning platform found documents how it retires items.

## Marking

**Decided.** Model grading of explanations is advisory until the user's model passes a calibration set shipped with Planish; then it counts towards mastery.

- Answers are marked by running code wherever possible. Mastery rests on these and on calibrated grades, never on reading; recognition questions, such as multiple choice, are practice.
- A grader, in Planish's own call, sees only the key, a rubric for the question and the learner's final answer: a reference answer raised graders' agreement with experts (Cohen's κ) from 0.34 to 0.60, small models being near chance without one ([Koutcheme et al. 2025][koutcheme]), and a question-specific rubric raised it from 0.16 to 0.65 ([Rubric Is All You Need][rubric]). It decides each rubric line yes or no, code adds up the score, and an empty or malformed reply is unmarked.
- Generic answers score zero, as do bare openers such as "Thought process:", which alone won judges' credit ([One Token to Fool LLM-as-a-Judge][onetoken]). Disputes go to a fresh grader, never the tutor: models dropped correct verdicts when a learner pushed back or merely mentioned a wrong answer ([SycEval][syceval]; [Check My Work?][checkmywork]).
- The calibration set holds hand-graded answers to Planish's own questions, adversarial ones included; its size and pass mark are *(unknown)*. Users run it on their model, cost shown first, and again on changing model.

## Checking lessons

**Decided.** The user chooses how lessons are checked:

| Setting | What runs |
|---|---|
| Default | tools (compiler, tests, find-references), then one sceptical model check, starting with a costed pilot of 2–4 lessons, under a budget cap |
| Tools only | tools, and no model check |
| Full pipeline | tools, then several independent model checkers |

Lessons need checking: a model's explanations of code went wrong most often in comparisons and branches ([Sarsa et al. 2022][sarsa]), GPT-4 mispredicted the output of 3–13-line functions about one time in five ([Gu et al. 2024][cruxeval]), and no study found measures how accurate current models' lessons about a codebase are.

- **Tools.** Every claim cites `path:start-end` with a hash of the text and, once committed, the commit, and must match the code there or in the working tree; a claim on uncommitted text is re-anchored to the first commit containing it *(unknown)*. Claims such as "X calls Y" are settled by find-references or the type checker where a language server has indexed the project, and otherwise go to the model check or are labelled unchecked.
- **Model checks.** The sceptical check gives a fresh model each claim with its code, to mark unsupported whatever it cannot support ([why](README.md#principles-behind-every-design-choice)); the full pipeline splits claims into single assertions, and each checker sees one, with its source, and no other verdict.
- **Failures.** Only lessons that pass are shown, labelled with their checks; a failed one goes back to its writer with the failing claims ([agent-integration.md](agent-integration.md#the-lesson-contract)). A one-key "this is wrong" on any lesson or item sends it back the same way, out of review, since a lone learner has no classmates whose answers could expose a bad question.
- **Cost.** What a curriculum costs is *(unknown)*, so the pilot shows its lessons' cost first, from provider-reported usage or, with Claude Code and Codex, token counts in the agent's transcript *(unknown)*, as money only for API-key users, at list price. At the cap, the lesson tools refuse further parts and Planish stops offering prompts; only the sidebar and Planish's own calls stop mid-run. Lessons are cached by the hash of the code they cite.

## Maths

In the equation-and-code template, the learner predicts a function's output for a tiny input, runs it, then changes a term and watches the result move, after Bret Victor's explorable explanations ([Victor 2011][victor]); the link shows as unverified until a numeric test passes. In both lanes ([paper.md](paper.md#maths)), each equation shows how far it has climbed a ladder of checks, cheapest first:

1. It parses and renders.
2. SymPy shows two forms equal (`simplify(a - b) == 0`, backed by `equals()` at random points), which it calls "not infallible", so inconclusive results show as such ([SymPy][sympy]). Equations enter through its Lark parser, which refuses what it cannot read (shown as not checked), and the parsed form is shown for confirmation, since the default LaTeX parser can drop part of an expression without warning ([SymPy parsing][sympy-parsing]).
3. The formula, made a function by [`lambdify`][lambdify], is compared with the project's function on random inputs, in the sandbox, since `lambdify` runs code ([fork.md](fork.md#running-code)); Python only in the first release.
4. After the first release, Lean, where its library Mathlib has the definitions; a compiled proof certifies the statement as written, so a person confirms that it says what is meant.

Rungs 2 and 3 need Python and SymPy, which Planish does not bundle *(unknown)*. A model's verdict never counts: LLM judges accepted flawed proofs, one 74.8% of the time ([QEDBench][qedbench]), and the best model tested wrote "proofs" of altered, false theorems 29% of the time ([BrokenMath][brokenmath]).

## Progress and measurement

**Decided.** Learning records stay on the device and are never uploaded, and Planish has no telemetry ([front page](README.md#principles-behind-every-design-choice)).

- Progress shows as minutes of active work and pace, the time an area should take at the learner's recent rate, much as [Math Academy][mathacademy] counts experience points as minutes of focused effort.
- No streaks, leaderboards or daily targets: when Duolingo changed the scheduler behind a decaying skill meter, next-day practice fell 7.3%, as learners had been practising to keep the meter gold ([Settles & Meeder 2016][hlr]). Curricula for different codebases cannot be compared, so neither can their learners.
- About a week after an area is finished, the next time its code is opened, Planish offers a short re-check there with its AI help off, leaning towards why the code is built as it is and towards debugging, where engineers who learned with an AI assistant fell furthest behind ([Shen & Tamkin, Anthropic, 2026][anth]). The learner predicts their score, then sees the actual one, since self-assessment misleads: students' sense of having learned correlated negatively with their test scores ([Lee et al. 2025][socratic]), and in 2025 experienced developers believed AI had sped them up by 20% when it had slowed them by 19% ([METR 2025][metr]). This gives each learner evidence on whether learn mode works *(unknown)*.

## Accessibility

Beyond the front page's [UI and UX commitments](README.md#4-world-class-ui-and-ux), every template meets [WCAG 2.2][wcag] AA in light, dark and high-contrast themes, never shows pass or fail by colour alone, keeps timers off by default, and follows VS Code's reduced-motion setting and the editor's font size. From the first commit, CI blocks on [axe-core][axe] checks of each template in all three themes, a keyboard-path test per template, and a lint against fixed colours in place of the [theme's][vsc-theme]. Maths is read aloud from the MathML that KaTeX writes beside its HTML ([KaTeX options][katex-options]); whether screen readers read it well in Planish is *(unknown)*, and the paper lane's MathJax 4 reading view is the fallback ([paper.md](paper.md#maths)).

## What is not known yet

Each needs a prototype, a measurement or an evaluation before anything depends on it. Besides those marked above:

- **Whether learn mode works:** no published study found in November 2026 tests learning while an agent does the work, an explain-back before accepting a change, review that follows changing code, or current models grading explanations of code.
- **Extracting a prerequisite graph from code**, which no study found evaluates.
- **The explain-back with Claude Code and Codex.** Planish cannot add a step to their panels, so it may attach through a second kit hook or before the learner commits the agent's edit. Telling the agent's edits from the learner's is hard when the agent writes straight to disk.
- **The calibration set**, which needs hand-graded answers that do not exist yet.
- **Maths:** where Python and SymPy come from (the project's environment, or a pinned runtime Planish downloads with consent); comparing formulas with code in array libraries that `lambdify` has no backend for, such as PyTorch; and how accurate models' explanations of mathematics are for learners.

[styles]: https://code.claude.com/docs/en/output-styles "Claude Code docs: output styles"
[vsc-walk]: https://code.visualstudio.com/api/ux-guidelines/walkthroughs "VS Code UX guidelines: walkthroughs"
[vsc-webview-ux]: https://code.visualstudio.com/api/ux-guidelines/webviews "VS Code UX guidelines: webviews"
[sorva]: https://doi.org/10.1145/2483710.2483713 "Sorva 2013, notional machines"
[brooks]: https://doi.org/10.1016/S0020-7373%2883%2980031-5 "Brooks 1983"
[vmv]: https://doi.org/10.1109/2.402076 "von Mayrhauser & Vans 1995"
[pennington]: https://doi.org/10.1016/0010-0285%2887%2990007-7 "Pennington 1987"
[littman]: https://doi.org/10.1016/0164-1212%2887%2990033-1 "Littman et al. 1987"
[roehm]: https://doi.org/10.1109/ICSE.2012.6227188 "Roehm et al., ICSE 2012"
[aireli]: https://aireli.hasel.dev/download/aireli-preprint.pdf "Alakmeh et al., ICPC 2026"
[faithful]: https://www.anthropic.com/research/reasoning-models-dont-say-think "Anthropic, 2025"
[kalyuga]: https://doi.org/10.1037/0022-0663.96.3.558 "Kalyuga & Sweller 2004"
[tetzlaff]: https://doi.org/10.1016/j.learninstruc.2025.102142 "Tetzlaff et al. 2025"
[mermaid]: https://mermaid.js.org "Mermaid"
[codetour]: https://github.com/microsoft/codetour "CodeTour"
[dap]: https://microsoft.github.io/debug-adapter-protocol/overview "Debug Adapter Protocol"
[ivie]: https://arxiv.org/abs/2403.02491 "Yan et al., Ivie, CHI 2024"
[macneil]: https://arxiv.org/abs/2211.02265 "MacNeil et al., SIGCSE 2023"
[paperplain]: https://arxiv.org/abs/2203.00130 "August et al., Paper Plain"
[primm]: https://doi.org/10.1080/08993408.2019.1608781 "Sentance, Waite & Kallia 2019"
[lopez]: https://doi.org/10.1145/1404520.1404531 "Lopez et al., ICER 2008"
[du]: https://doi.org/10.1145/3373165.3373187 "Du et al. 2020"
[drift]: https://arxiv.org/abs/2402.10962 "Li et al., COLM 2024"
[eedi]: https://services.google.com/fh/files/misc/learnlm_oct26.pdf "Google and Eedi, October 2026"
[eyeforai]: https://eye-for-ai.hasel.dev/download/an-eye-for-ai-icse2026-preprint.pdf "Alakmeh, D'Angelo & Fritz, ICSE 2026"
[watanabe]: https://arxiv.org/abs/2509.14745 "Watanabe et al. 2026"
[lnr]: https://arxiv.org/abs/2410.08922 "Kazemitabaar et al., IUI 2025"
[matuschak]: https://notes.andymatuschak.org/Math_Academy "Matuschak, notes on Math Academy"
[kruger]: https://jacobkrueger.github.io/assets/papers/Krueger2018Remember.pdf "Krüger et al., ICSE 2018"
[anki]: https://github.com/ankitects/anki/releases "Anki releases"
[srsbench]: https://github.com/open-spaced-repetition/srs-benchmark "srs-benchmark"
[bjork]: https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf "Bjork & Bjork 2011"
[koutcheme]: https://arxiv.org/html/2407.04873v2 "Koutcheme et al., SIGCSE 2025"
[rubric]: https://arxiv.org/html/2503.23989v3 "Rubric Is All You Need, ICER 2025"
[onetoken]: https://arxiv.org/html/2507.08794v3 "One Token to Fool LLM-as-a-Judge"
[syceval]: https://arxiv.org/abs/2502.08177 "SycEval, AIES 2025"
[checkmywork]: https://arxiv.org/abs/2506.10297 "Check My Work?, 2025"
[sarsa]: https://arxiv.org/abs/2206.11861 "Sarsa et al., ICER 2022"
[cruxeval]: https://arxiv.org/abs/2401.03065 "Gu et al., CRUXEval, 2024"
[victor]: http://worrydream.com/ExplorableExplanations/ "Bret Victor, Explorable Explanations"
[sympy]: https://docs.sympy.org/latest/tutorials/intro-tutorial/gotchas.html "SymPy gotchas"
[sympy-parsing]: https://docs.sympy.org/latest/modules/parsing.html "SymPy: parsing"
[lambdify]: https://docs.sympy.org/latest/modules/utilities/lambdify.html "SymPy lambdify"
[qedbench]: https://icml.cc/virtual/2026/82524 "QEDBench, ICML 2026 workshop"
[brokenmath]: https://arxiv.org/abs/2510.04721 "BrokenMath, 2025"
[mathacademy]: https://mathacademy.com/how-it-works "Math Academy: how it works"
[hlr]: https://aclanthology.org/P16-1174.pdf "Settles & Meeder, ACL 2016"
[anth]: https://www.anthropic.com/research/AI-assistance-coding-skills "Shen & Tamkin, Anthropic, 2026"
[socratic]: https://arxiv.org/abs/2509.16262 "Lee et al., Socratic Mind, 2025"
[metr]: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ "METR, July 2025"
[wcag]: https://www.w3.org/TR/WCAG22/ "WCAG 2.2"
[katex-options]: https://katex.org/docs/options "KaTeX options"
[axe]: https://github.com/dequelabs/axe-core "axe-core"
[vsc-theme]: https://code.visualstudio.com/api/references/theme-color "VS Code theme colour reference"
