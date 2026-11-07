# Paper lane

The paper lane is for authors who must understand everything they publish. It follows the [first principle](README.md#principles-behind-every-design-choice), machines verify and people explain: a machine can check a number against its record (the data file it came from) but cannot certify understanding, and an author can explain every line and still be wrong.

Marks follow the [front page](README.md); unknowns are marked where they arise, and [What is not known yet](#what-is-not-known-yet) gathers the rest.

## Two modes

**Decided.** The author picks a mode for each paper: rewrite an AI draft by hand, or write first and use AI only to explain and check.

To rewrite, the author names the draft, a file or a git commit, and Planish keeps a copy on the device.

## The editor

**Decided.** A paper opens in a CodeMirror 6 live preview, inside a webview, over the paper's own source files. Markup is hidden away from the cursor, and the editor never rewrites bytes the author has not touched. One key switches to the plain source in VS Code's own text editor, where every extension works.

Overleaf's Visual Editor and Obsidian's Live Preview work the same way ([Overleaf][ol-deco]; [Obsidian][obsidian]). [Source comments](#jump-to-source) show as margin markers. Pandoc Markdown and LaTeX maths renders through KaTeX with the paper's macros; how Typst maths is previewed is *(unknown)*. Only files the author adds as papers open here, through Planish's [editor resolver](fork.md#how-the-interface-is-built) and a list on the device, so no workspace setting is written.

**Why a webview.** VS Code's editor cannot hide part of a line: its maintainers called that "major work" in 2018 and had none planned in 2022 ([#50840][vsc-50840]). Microsoft's own live-preview Markdown editor, introduced in VS Code [1.131][rn-1131] and promoted in [1.144][rn-1144], is also a webview custom editor, but its parser lacks pandoc's citations, divs and attributes, and its source was not public on 4 November 2026. Planish's editor, a built-in extension, takes the same route and three of that editor's [proposed APIs](fork.md#proposed-apis), for Outline, breadcrumbs, highlighting and comments: `customTextEditorNavigation`, `documentSyntaxHighlighting` and `agentEditorComments` ([manifest][md-ext-pkg]).

**Fidelity.** Quarto's visual editor writes through pandoc and documents the rewrites, such as `_x_` becoming `*x*` ([Quarto][quarto-md]). In Planish, VS Code's text document is the one model: each preview action becomes the smallest edit to its span; outside changes, such as an agent writing to disk, map into the view without moving the cursor; and undo acts on VS Code's document. What the editor does not understand stays visible as source. A structured field, such as a MathLive equation, rewrites only its span and shows any normalisation as a diff first, since MathLive regenerates LaTeX from its own model ([changelog][mathlive-changelog]). Saving from the preview skips save participants, such as trimming trailing whitespace, that would rewrite untouched bytes (in Markdown, two trailing spaces are a line break); the plain source keeps them. CI tests that saving an unedited paper keeps its SHA-256 and an edit changes only its sentence's bytes, both with save participants on, and that preview typing interleaved with plain-source and disk edits leaves both views identical. How version conflicts are resolved, and whether skipping save participants needs a fenced core change, are *(unknown)*.

**Parsing.** Pandoc records source positions for CommonMark and djot, not its own Markdown ([pandoc manual][pandoc-manual]), so the editor parses each format with Lezer, CodeMirror's incremental, error-tolerant parser ([Lezer][lezer]); the pandoc Markdown grammar must cover citations, divs, attributes, raw blocks, YAML front matter and comments. A [prototype][grammars] has a grammar for each format: extensions to Lezer's MIT Markdown parser for pandoc, a LaTeX grammar written for Planish, since the Lezer LaTeX grammars found are AGPL, and an Apache-2.0 Typst parser whose tree matches Typst's own; on 17 public files, opening and saving without an edit keeps each SHA-256, with CRLF line ends too once the editor sets CodeMirror's line separator. Overleaf's editor is AGPL-3.0 ([licence][ol-license]), so Planish rebuilds the pattern on MIT-licensed CodeMirror ([licence][cm-license]) and copies no Overleaf code.

**Extensions and panels.** Extensions that act on text editors do not act in a webview: VSCodeVim needs a text editor's focus for 64 of its 75 keybindings ([manifest][vim-pkg]), and spell checkers and inline completions draw only in text editors; whether their diagnostics reach Problems is *(unknown)*. The plain-source key keeps the [extensions promise](README.md#1-the-extensions-promise). Problems, Outline, Timeline and Comments work as for code; an agent's proposed edit opens as a text diff, since VS Code 1.129 keeps custom editors out of diff views ([1.129][rn-1129]).

## Source formats and builds

**Decided.** The first release supports pandoc Markdown, LaTeX and Typst. Builds run through the project's own pinned toolchain, and a pandoc-to-LaTeX build serves venues that require LaTeX.

Planish bundles no pandoc, TeX or Typst, so builds match the author's own and Planish ships no GPL-2.0-or-later pandoc ([COPYRIGHT][pandoc-copyright]); build errors appear in Problems. TMLR (Transactions on Machine Learning Research) takes only PDFs "generated using the TMLR LaTeX stylefile and template" ([author guide][tmlr-guide]); arXiv makes its accessible HTML from TeX source ([arXiv HTML][arxiv-html]), and forum users report that PDF-only Typst submissions are moderated by hand ([Typst forum][typst-forum]). A build that converts maths, as pandoc does from Markdown to Typst, also converts each equation in the background and flags failures, since the converter promises no lossless round trip ([texmath][texmath]). Submission copies of TeX source lose their comments, which "are visible on arXiv" ([arxiv-latex-cleaner][latex-cleaner]); arXiv advises taking out "potentially embarrassing self-comments" ([arXiv FAQ][arxiv-whytex]).

## Rewriting by hand

**Decided.** What counts as rewritten by hand is the author's setting. By default the draft paragraph hides while the author writes their own: peeks are allowed and logged, paste from the draft is refused, numbers, equations and citations are checked against their sources rather than retyped, and an override needs a reason. Other settings include writing with the draft visible, and claims only. Under claims only, overlap with the AI draft is reported, not blocking; instead, every claim must be checked against its source and explained by the author.

With the draft visible, the default's other rules still apply. Under claims only, the draft's wording may stay, and a claim counts as explained once the author has answered the lane's question on it ([Explaining](#explaining)).

By default the lane hides each draft paragraph once read, and the author writes their own in its place; the draft then lives only in the copy on the device, so builds and agents see no duplicate. A model, through Planish's own call or the author's agent, then compares meaning, not wording, listing claims dropped, changed or added and proposing how source comments re-attach, for the author to confirm.

A completion accepted in the plain source leaves its sentence drafted. An agent may fill a placeholder from its record, as a change the author reviews. Sections the author marks as their own, such as the acknowledgements, refuse agent edits wherever Planish can stop them; elsewhere such edits are labelled.

People remember what they generate better than what they read ([Bertsch et al. 2007][bertsch]), and people who wrote essays with an LLM struggled to quote them ([Kosmyna et al., preprint][kosmyna]); no published study found in November 2026 tests a hidden-draft rewrite.

## Provenance

**Decided.** The provenance log stays on the device, outside the repository, seen only by the author, and is never uploaded. To move a paper to another of their machines, the author may export its log, with the device's copy of the AI draft, as one local file and import it there, so the rewrite and the overlap check carry on.

**Sentence states.** A sentence is *drafted* (agent text, including a draft being rewritten), *rewritten* (the author's own words, as all write-first typing is) or, after rewriting, *checked* against its source; under claims only, checking and explaining its claims counts as rewriting. States live in the log, anchored by position and a hash of the text, so the paper's files carry none; Outline shows each section's counts.

**Source comments** follow their sentences through moves, splits and merges; deleting a sentence asks what becomes of its comment, and changing a number, unit or citation flags the comment for re-checking.

**Who wrote what.** VS Code labels each edit with its source, telling typing, pasting, cutting and IME composition apart, and naming the extension and provider of an accepted completion, or the model, session and extension of a chat or agent edit ([textModelEditSource.ts][edit-source]). Planish reads the labels on the device through the proposed `textDocumentChangeReason` API ([proposal][change-reason]); whether it carries every label the lane needs is *(unknown)*. Edits extensions make through the API, including every keystroke the webview passes on, carry no source and are recorded as unknown ([mainThreadBulkEdits.ts][bulk-edits]; [editStack.ts][edit-stack]) until a [fenced](fork.md#the-repository) core change gives them one. A change from outside Planish's editors is labelled "outside change" and counts as drafted until the author names its origin, or as agent text if it matches an edit the in-house sidebar logged; whether Claude Code's and Codex's writes, which arrive this way, can be matched is *(unknown)*.

**The log** records spans and events: typing; pastes and their origin; accepted completions and their extension; agent edits and their agent; peeks; overrides and their reasons; and checks, with source and date. Grammarly's opt-in Authorship records typed, pasted and AI-assisted text alike ([Grammarly][grammarly]). The log holds no keystroke timing: behavioural data processed to identify a person is biometric data under the GDPR ([Article 4(14)][gdpr]), and timing separates assisted from unassisted writing with only 52–86% accuracy ([Kundu et al. 2024][kundu]). Nor does Planish show an AI-detector score: seven detectors flagged, on average, 61% of human-written TOEFL essays as AI-written ([Liang et al. 2023][liang]), and in NeurIPS's analysis a change of window size alone moved the share of papers scoring 90–100% from 42.7% to 12.7% ([NeurIPS blog][neurips-pos]).

## Explaining

Reading aids that explain make readers faster and surer, rarely more correct. Symbol definitions cut the time to answer questions, not the errors ([ScholarPhi][scholarphi]). Plain-language summaries left comprehension unchanged, and one participant who read only the summaries rated their understanding 5 of 5 and answered 2 of 7 questions ([Paper Plain][paperplain]). In Qlarify's study, answers were fully accurate 87.5% of the time and no participant interviewed noticed the errors ([Qlarify][qlarify]). Questions lifted understanding: Paper Plain's gains came from its key questions, and Google's Learn Your Way, which embeds questions, raised retention after three to five days from 67% to 78% ([Learn Your Way][learnyourway]). The studies are mostly small, and none tested authors reading their own AI-drafted paper.

So the lane's understanding checks ask first and explain after the author's attempt, while the author's own questions are answered at once, like a deliberate request in [learn mode](learn.md#help-when-stuck). A selection offers **Define**, **Expand** and **Why**, the menu Qlarify tested, in which Define made up 31.5% of interactions ([Qlarify][qlarify]). Every answer cites an anchor the author can open (a field in a record, code at the commit its source comment names, or a dated quotation from a cited work) or is labelled opinion. Each explanation ends with a question and uses the shared [lesson templates](learn.md#lesson-templates).

The lane's questions cover what an author must be able to trace to its source:

| Content | The author can | Machine check |
|---|---|---|
| A number from a record | name the record, field, statistic, unit and rounding | resolve the reference; recompute the statistic |
| A unit | say which unit the source uses, such as GB or GiB | compare with the record |
| A computed value | redo the arithmetic, and say if it is exact or an estimate | re-evaluate the source comment's arithmetic |
| A method sentence | say what the code does and where the prose simplifies | show prose, code and specification side by side; record conflicts |
| A citation | say what the work shows, where, and in which version | the quoted passage and the date it was read |

**The viva.** Before submission, Planish examines the author on the whole paper, as in a thesis defence: basic questions, then free-response questions on unstated rationale, background knowledge and failure modes, with follow-ups where an answer leaves something out. In one study such questions told researchers' own papers from unfamiliar ones with an AUC of 0.90, but the best false-positive rate was about 20%, and its authors say a failed test should not decide a violation ([greCAPTCHA][grecaptcha]). So the viva ends in a private report, not a verdict; questions answered "I don't know", or marked as missed, return on a spaced schedule ([learn.md](learn.md#review-in-place)). Venues have begun asking too: in August 2026 a TMLR editor-in-chief interviewed authors whose submissions were bound for desk rejection, and the authors of three of the seven papers discussed could not answer basic questions about them ([36Kr, reporting a TMLR blog post][tmlr-interviews]).

## Jump to source

A made-up example in pandoc Markdown (LaTeX writes the comment after `%`, Typst after `//`; a prototype settles the syntax):

```markdown
The cache cut median latency from 41 ms to 12 ms.
<!-- source: record bench/latency.json#/median_ms; code src/cache.py:40-72@9c1e4b2 -->
```

The resolver:

- recognises code at a commit, a field in a record (by JSON pointer), a passage in a cited work, and URLs;
- opens code read-only from git's object store at the cited commit, not the working tree;
- streams large records, and recomputes a quoted statistic from a fixed set (count, sum, mean, median, quantiles, minimum or maximum over a JSON pointer) or a comment's arithmetic without running general code; anything else runs in the [sandbox](fork.md#running-code) or is reported as not checked;
- lists each reference it cannot resolve, and why: private, not yet published, missing or unrecognised;
- obeys a deny list of paths, such as data kept blind until a pre-registered analysis, that Planish's tools, previews and model calls never open or send to a model; since Claude Code and Codex read files themselves, the lane says such files belong outside any folder an agent works in.

**Equations linked to code.** No mature tool found in November 2026 links an equation to the code that implements it: research reports "quite useful" links from an LLM in initial experiments ([Bajraktari & Vogelsang 2026][paper2code]), the best teaching examples are annotated by hand ([labml.ai][labml]), and leanblueprint links document and code in a way a machine can check ([leanblueprint][leanblueprint]). Here, an agent proposes a link from an equation to a function at a pinned commit, shown as unverified until a generated test comparing them passes.

## Maths

The lane uses the shared [maths layer](README.md#two-lanes-one-foundation).

- **Notation index.** Built from the source, not a PDF: the definition in force at the cursor, every sense of each symbol and any use before its definition, each entry confirmed by the author. In ScholarPhi's study, readers mostly missed one question because its list left out a sense of a symbol, and automatic extraction from PDFs reached 24–55% precision ([ScholarPhi][scholarphi]).
- **Preview.** KaTeX at a pinned version, since a 2026 release changed its CSS class names ([KaTeX changelog][katex-changelog]). Screen readers read KaTeX's MathML ([learn.md](learn.md#accessibility)); failing that, a MathJax 4 reading view, with line breaking, speech and Braille, serves them ([MathJax 4][mathjax4]).
- **Input.** MathLive, which is MIT-licensed, edits LaTeX maths ([MathLive][mathlive]); in Typst papers it waits until a prototype shows a lossless path.
- **Checks.** Each equation shows how far it climbed the shared [ladder](learn.md#maths); Typst equations reach it only through a flagged conversion. Before agreeing with a claim, the agent tries to break it with special cases and numeric counterexamples, and says "I could not check this" when it cannot.

## Agents

**Decided.** Any agent can work in the lane through its MCP tools for the selection, sources and checks. Agents' edits are detected and labelled agent text.

The tools exist because a webview hides its selection from other extensions. An open bug report says Codex reads the selection only from text editors, so a selection in VS Code's live-preview Markdown editor never reaches it ([Codex #49512][codex-49512]); the selection tool in Claude Code 2.1.122 (April 2026) reads only the active text editor ([package][cc-2-1-122]), and whether it still does in [2.1.318](agent-integration.md#claude-code-and-codex) is *(unknown)*. No proposed API lets one extension read another's custom-editor selection ([API proposals][api-proposals]).

| Tool | Returns |
|---|---|
| Selection | the selected text, its sentences, their states and their source comments |
| Sources | what a source reference points to, or why it cannot be opened; the deny list applies |
| Checks | the lane's checks, or the maths ladder, for a span |

No tool writes prose. The tools ship in the [lesson MCP server](agent-integration.md#the-lesson-mcp-server), reaching Claude Code and Codex through the agent kit, and every session in the in-house sidebar, which comes after the first release *(decided)*; how well Claude Code and Codex use them is *(unknown)*. Define, Expand and Why call the author's own model on their API key, or open their agent with the question filled in ([agent-integration.md](agent-integration.md#claude-code-and-codex)). The viva always runs in Planish's own view, since the gate must record an answer to every question; its questions come from Planish's own model call or, through a prompt the author sends, from their agent, as data through the lesson tools. Answers are logged on the device, and a follow-up reaches the agent only after an answer is committed. So an author with no API key in Planish still has all four, through their agent.

## Checks and the publish gate

**Decided.** The publish gate blocks on mechanical checks only. Understanding checks must be attempted; their results are recorded, not scored.

The checks run continuously as lint in Problems, and the gate applies them to the submission build:

| The gate blocks on | Meaning |
|---|---|
| Unfilled placeholders | a marker such as `{{PENDING: …}}` |
| Unresolved citations | a key missing from the bibliography; a DOI that doi.org cannot resolve; an arXiv id arXiv does not know; or a title that differs from the entry's once TeX markup, case and punctuation are removed (a near match warns). Titles come from the registration agency, such as Crossref, through [DOI content negotiation][doi-cn]; lookups send only the identifier, and an entry with neither identifier needs the author's confirmation |
| Leftover AI text | chatbot phrases such as "As an AI language model" |
| Overlap with the AI draft | runs of words shared with the draft beyond a threshold *(unknown)*, not counting numbers, equations, citations and quotations; under claims only, reported, not blocking *(decided)* |
| Sentences not yet rewritten | any sentence still drafted ([Provenance](#provenance)) |

The gate's understanding check is the viva, attempted once every question has an answer, even "I don't know". House rules, such as a venue's length limit, only warn. The gate guards Planish's own submission build, not builds made elsewhere.

Venues act on concrete evidence of unchecked output. As of 4 November 2026:

| Venue | Where AI use is disclosed | What it has acted on |
|---|---|---|
| arXiv | reported to arXiv, in no set place ([moderation][arxiv-mod]) | unchecked output, such as invented references or leftover chatbot text: a one-year ban, after which submissions must first be accepted at a peer-reviewed venue; reported by the press, not by arXiv ([Research Information][arxiv-ban]) |
| TMLR | a first-page footnote; "ideas, claims and results" should be "human-sourced" ([FAQ][tmlr-faq]) | authors facing desk rejection, questioned on their papers ([Explaining](#explaining)) |
| NeurIPS 2026, position track | how AI was used, with an attestation ([blog][neurips-pos]) | AI-detector scores: desk rejections, and version histories asked of some authors |
| NeurIPS 2026, main track | the experimental setup, when AI is an important or non-standard part of the method ([handbook][neurips-handbook]) | hallucinated citations, a breach of its Code of Conduct |
| ICLR 2026 | required for any use ([retrospective][iclr-retro]) | confirmed hallucinated references: desk rejection, after at least three people checked each flagged paper |
| ICML 2026 | encouraged for notable uses in the method ([call for papers][icml-cfp]) | references an automated checker could not verify, listed for the authors to fix ([instructions][icml-author]) |

## Disclosure statements

Venues ask for the same facts in different places: the tool, its uses and sections, how much, how its output was checked, and the authors' responsibility. Besides the places above, Elsevier wants a declaration just before the references ([Elsevier][elsevier]), IEEE the acknowledgements, naming the sections ([IEEE][ieee]), and journals following ICMJE the cover letter and the paper ([ICMJE][icmje]). The lane keeps these facts once, from the provenance log and the author's answers, and fills in each venue's form without a model; its sentences count as drafted until the author rewrites them. That rewrite matters: one statement appeared word for word in 95 ICLR 2026 submissions and was itself flagged as AI-written, and only 22–23% of the 13,867 statements studied took responsibility, though 71% of the researchers surveyed expect them to ([Mohapatra & Pruthi 2026][mohapatra]). CRediT's 14 contributor roles include none for AI, so a statement must say what a role cannot ([CRediT][credit]).

## First release

**Decided.** The first release ships both lanes together: learn mode, with Claude Code and Codex, and the paper lane, with all three formats.

The lane's first release holds its decided parts: the editor and builds, both modes and the rewrite settings, the provenance log, the publish gate and the lane's tools, with Define, Expand, Why and the viva. Later: MathLive; the notation index; the MathJax 4 reading view, if KaTeX's MathML fails the screen-reader test; links from equations to code; disclosure drafts; history compared sentence by sentence; and quoted passages from cited works, from copies the author adds, with their text extracted on the device.

## What is not known yet

Nothing in this lane has been tested with authors reading their own AI-drafted paper. Besides the unknowns marked above, a prototype must settle:

- **Editor:** whether the fidelity tests hold with edits, save participants and outside changes; the [grammars prototype][grammars] settled the unedited round trip and listed the work left for each grammar.
- **Typst:** how equations are previewed (with the project's pinned Typst, or through its pandoc with failures flagged) and checked; whether MathLive can edit them losslessly; whether a Typst source can reach a venue that requires LaTeX.
- **Builds:** how a project declares its pinned toolchain: a build script, a lock file or a container.
- **Provenance:** the core change's size and its cost at each upstream release; whether a paste from the draft can be refused in the plain source; how reliably technical prose splits into sentences, and states re-anchor after outside edits; how a co-author's change is told from an agent's.
- **Maths and access:** how screen readers handle the preview; how KaTeX and MathJax 4 compare in speed in Planish; how often models explain mathematics wrongly, and whether authors notice ([learn.md](learn.md#what-is-not-known-yet) holds the shared maths unknowns).
- **Venues:** whether any would accept evidence of how a paper was written. Of those above, only NeurIPS's position track has said what process evidence it wants, and arXiv has said nothing official on Typst.

[ol-deco]: https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/source-editor/extensions/visual/atomic-decorations.ts "Overleaf Visual Editor decorations"
[obsidian]: https://obsidian.md/help/edit-and-read "Obsidian Help: editing and reading views"
[vsc-50840]: https://github.com/microsoft/vscode/issues/50840 "VS Code issue 50840: folding ranges inside a line"
[rn-1131]: https://code.visualstudio.com/updates/v1_131 "VS Code 1.131 release notes, 29 July 2026"
[rn-1144]: https://code.visualstudio.com/updates/v1_144 "VS Code 1.144 release notes, 28 October 2026"
[rn-1129]: https://code.visualstudio.com/updates/v1_129 "VS Code 1.129 release notes, 15 July 2026"
[md-ext-pkg]: https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/package.json "VS Code built-in Markdown extension manifest"
[mathlive-changelog]: https://github.com/arnog/mathlive/blob/master/CHANGELOG.md "MathLive changelog"
[quarto-md]: https://quarto.org/docs/visual-editor/markdown "Quarto visual editor: Markdown output"
[pandoc-manual]: https://pandoc.org/MANUAL.html "Pandoc manual: the sourcepos extension"
[lezer]: https://lezer.codemirror.net/docs/guide/ "Lezer system guide"
[ol-license]: https://github.com/overleaf/overleaf/blob/main/LICENSE "Overleaf licence (AGPL-3.0)"
[cm-license]: https://github.com/codemirror/view/blob/main/LICENSE "CodeMirror view licence (MIT)"
[grammars]: https://github.com/BhodiSea/planish/blob/main/prototypes/paper-grammars/README.md "Paper grammars prototype"
[vim-pkg]: https://github.com/VSCodeVim/Vim/blob/master/package.json "VSCodeVim manifest"
[pandoc-copyright]: https://github.com/jgm/pandoc/blob/main/COPYRIGHT "Pandoc copyright (GPL-2.0-or-later)"
[tmlr-guide]: https://jmlr.org/tmlr/author-guide.html "TMLR author guide"
[arxiv-html]: https://info.arxiv.org/about/accessible_HTML.html "arXiv accessible HTML"
[typst-forum]: https://forum.typst.app/t/has-typst-had-a-discussion-with-the-arxiv-maintainers/5484 "Typst forum: Typst and arXiv"
[texmath]: https://github.com/jgm/texmath "texmath README"
[latex-cleaner]: https://github.com/google-research/arxiv-latex-cleaner "arxiv-latex-cleaner README"
[arxiv-whytex]: https://info.arxiv.org/help/faq/whytex.html "arXiv FAQ: why TeX source"
[bertsch]: https://doi.org/10.3758/BF03193441 "Bertsch et al. 2007, the generation effect: a meta-analytic review"
[kosmyna]: https://arxiv.org/abs/2506.08872 "Kosmyna et al., preprint"
[edit-source]: https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/textModelEditSource.ts "VS Code: textModelEditSource.ts"
[change-reason]: https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.textDocumentChangeReason.d.ts "VS Code: the textDocumentChangeReason proposal"
[bulk-edits]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/mainThreadBulkEdits.ts "VS Code: mainThreadBulkEdits.ts, which passes no edit source"
[edit-stack]: https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/model/editStack.ts "VS Code: editStack.ts, where a missing source becomes unknown"
[grammarly]: https://www.grammarly.com/authorship "Grammarly Authorship"
[gdpr]: https://gdpr-info.eu/art-4-gdpr/ "GDPR Article 4"
[kundu]: https://arxiv.org/abs/2406.15335 "Kundu et al., IJCB 2024"
[liang]: https://arxiv.org/abs/2304.02819 "Liang et al., Patterns, 2023"
[neurips-pos]: https://blog.neurips.cc/2026/06/02/ai-generated-papers-in-the-neurips-2026-position-paper-track/ "NeurIPS blog, 2 June 2026"
[scholarphi]: https://arxiv.org/abs/2009.14237 "Head et al., ScholarPhi, CHI 2021"
[paperplain]: https://arxiv.org/abs/2203.00130 "August et al., Paper Plain, ACM TOCHI 2023"
[qlarify]: https://arxiv.org/abs/2310.07581 "Fok et al., Qlarify, UIST 2024"
[learnyourway]: https://research.google/blog/learn-your-way-reimagining-textbooks-with-generative-ai/ "Google Research, 16 September 2025"
[grecaptcha]: https://arxiv.org/abs/2609.20481 "Payan et al., greCAPTCHA, September 2026"
[tmlr-interviews]: https://eu.36kr.com/en/p/3999670422458247 "36Kr, 26 September 2026, reporting a TMLR blog post of 16 September 2026"
[paper2code]: https://arxiv.org/abs/2604.10793 "Bajraktari & Vogelsang, April 2026"
[labml]: https://nn.labml.ai/ "labml.ai annotated implementations"
[leanblueprint]: https://github.com/PatrickMassot/leanblueprint "leanblueprint README"
[katex-changelog]: https://github.com/KaTeX/KaTeX/blob/main/CHANGELOG.md "KaTeX changelog"
[mathjax4]: https://docs.mathjax.org/en/latest/upgrading/whats-new-4.0.html "What's new in MathJax 4.0"
[mathlive]: https://github.com/arnog/mathlive "MathLive README"
[codex-49512]: https://github.com/openai/codex/issues/49512 "Codex issue 49512"
[cc-2-1-122]: https://open-vsx.org/extension/Anthropic/claude-code/2.1.122 "Claude Code 2.1.122 on Open VSX, 28 April 2026"
[api-proposals]: https://github.com/microsoft/vscode/blob/main/src/vs/platform/extensions/common/extensionsApiProposals.ts "VS Code proposed API list"
[doi-cn]: https://citation.crosscite.org/docs.html "DOI content negotiation"
[arxiv-mod]: https://info.arxiv.org/help/moderation/index.html "arXiv moderation policy"
[arxiv-ban]: https://www.researchinformation.info/news/arxiv-imposes-one-year-ban-for-unchecked-ai-generated-content/ "Research Information, 18 May 2026"
[tmlr-faq]: https://jmlr.org/tmlr/faq.html "TMLR FAQ"
[neurips-handbook]: https://neurips.cc/Conferences/2026/MainTrackHandbook "NeurIPS 2026 main track handbook"
[iclr-retro]: https://blog.iclr.cc/2026/03/31/a-retrospective-on-the-iclr-2026-review-process/ "ICLR blog, 31 March 2026"
[icml-cfp]: https://icml.cc/Conferences/2026/CallForPapers "ICML 2026 call for papers"
[icml-author]: https://icml.cc/Conferences/2026/AuthorInstructions "ICML 2026 author instructions"
[elsevier]: https://www.elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals "Elsevier generative AI policies for journals"
[ieee]: https://journals.ieeeauthorcenter.ieee.org/become-an-ieee-journal-author/publishing-ethics/guidelines-and-policies/submission-and-peer-review-policies/ "IEEE submission and peer review policies"
[icmje]: https://www.icmje.org/recommendations/browse/artificial-intelligence/ai-use-by-authors.html "ICMJE: AI use by authors"
[mohapatra]: https://arxiv.org/abs/2608.23271 "Mohapatra & Pruthi, August 2026"
[credit]: https://credit.niso.org/ "CRediT contributor roles"
