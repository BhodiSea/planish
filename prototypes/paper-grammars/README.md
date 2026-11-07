<!-- SPDX-License-Identifier: Apache-2.0 -->

# Paper grammars prototype

The prototype for [#31](https://github.com/BhodiSea/planish/issues/31): Lezer grammars for the paper lane's three formats, and a test that opening and saving a paper without an edit keeps its SHA-256 ([paper.md, The editor](../../docs/spec/paper.md#the-editor)). It is not the editor; [#33](https://github.com/BhodiSea/planish/issues/33) builds that and takes these grammars with it.

```sh
npm ci
npm test         # the grammars' unit tests and the round trip on the corpus
npm run report   # what each grammar found, beside pandoc's own reading
```

The corpus, in [corpus.json](corpus.json), is 17 public files fetched from GitHub at pinned commits and checked against their SHA-256: papers, templates with full sample text, and pandoc's own test files. Each keeps its own licence, so none is committed.

## Existing grammars

Searched on npm and GitHub on 6 November 2026.

| Format | Grammar | Licence | What it covers | Usable |
|---|---|---|---|---|
| Markdown | [@lezer/markdown](https://www.npmjs.com/package/@lezer/markdown) 1.8.1 | MIT | CommonMark, GFM, superscript, subscript; an extension API for blocks and inline syntax | Yes, as the base |
| Markdown | [@codemirror/lang-yaml](https://www.npmjs.com/package/@codemirror/lang-yaml) 6.1.3 `yamlFrontmatter` | MIT | Front matter at the top of the file only, not pandoc's metadata blocks further down | Its YAML parser, [@lezer/yaml](https://www.npmjs.com/package/@lezer/yaml) |
| Markdown | [Zettlr](https://github.com/Zettlr/Zettlr)'s Markdown parser | GPL-3.0 | Citations, attributes, divs and spans, footnotes, grid tables, maths, front matter | No: copyleft |
| Markdown | [Pandown](https://github.com/MountLynx/pandown)'s `@pandown/grammar` | MIT | Citations, superscript and subscript; unpublished | Too little |
| LaTeX | [@overleaf/lezer-latex](https://www.npmjs.com/package/@overleaf/lezer-latex) 0.1.0 | AGPL-3.0-only | Overleaf's full grammar | No: copyleft, and the spec rules out Overleaf code |
| LaTeX | [codemirror-lang-latex](https://github.com/TeXlyre/codemirror-lang-latex) 0.6.1 | AGPL-3.0-or-later | A Lezer LaTeX grammar | No: copyleft |
| LaTeX | [@codemirror/legacy-modes](https://www.npmjs.com/package/@codemirror/legacy-modes) `stex` | MIT | A CodeMirror 5 tokeniser: highlighting with no tree | No: no structure to hide markup by |
| Typst | [codemirror-lang-typst](https://github.com/kxxt/codemirror-lang-typst) 0.6.0, `/lezer` entry | Apache-2.0 | A Lezer parser for Typst 0.15, with typst-syntax's node names; marked experimental | Yes |

## What the prototype has

- **Pandoc Markdown** ([src/pandoc-markdown.js](src/pandoc-markdown.js)): @lezer/markdown with extensions for citations (bracketed, in-text, with a suffix, braced keys), fenced divs, attributes on headings, spans, links, images and code, raw blocks with their format's parser mounted, raw spans, YAML metadata blocks anywhere with @lezer/yaml mounted, and TeX maths. Comments are CommonMark's HTML comments, which the base parser already has.
- **LaTeX** ([src/latex.grammar](src/latex.grammar), [src/latex-tokens.js](src/latex-tokens.js)): written here, about 100 lines. Commands, groups, the four maths delimiters, comments, `\verb`, `\url` and verbatim environments. `\begin` and `\end` are left flat, since a macro may open an environment in one group and close it in another (`\newenvironment{x}{\begin{center}}{\end{center}}`).
- **Typst**: codemirror-lang-typst's Lezer parser, unchanged. The test checks its tree against typst-syntax's, which the package also ships as WebAssembly.

## Results

On all 17 files, in Node 22 and 24:

- Opening each file in a CodeMirror state with its parser and saving it keeps its SHA-256, and so do the same files with CRLF line ends, with a byte order mark, and with mixed line ends.
- No parse has an error node.
- An edit and its undo leave the bytes and the incremental parse as they were.
- The Typst Lezer tree is node for node the same as typst-syntax's on all five Typst files.
- Against pandoc 3.1.3, the Markdown grammar finds the same citations, fenced divs, maths and metadata in the papers and templates, but for one citation and one bare TeX command (see below).

Two findings for the editor:

- **CodeMirror rewrites line ends by default.** It splits on `\r\n`, `\r` and `\n` and joins with `\n`, so a CRLF file saved from the preview changes every line. The editor must set `EditorState.lineSeparator` and save with `state.sliceDoc()`, not `doc.toString()`, which always joins with `\n`; the test shows the default failing.
- **VS Code normalises mixed line ends when it opens a file.** Its text buffer turns every line end into the file's commonest one ([pieceTreeTextBufferBuilder.ts](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.ts)). An unedited file is not saved, as it is not dirty, but the first edit to a mixed file saves every line end changed. Since VS Code's document is the editor's one model, this is VS Code's behaviour and #33's fidelity test meets it there.

## Work left for each grammar

**Pandoc Markdown.** The six constructs the spec names parse. Left:

- Pair fenced divs into a tree for folding and hiding; they are flat now.
- Mount a raw span's parser (`` `\ref{x}`{=latex} ``), as raw blocks do.
- Pandoc's `raw_tex`: bare LaTeX in Markdown, such as `\cite[22-23]{smith.1899}` or a `tabular` block, which pandoc reads as raw TeX (one in the JSS template, two in pandoc's test suite).
- Footnotes (`[^1]`, `[^1]:` and `^[inline]`), which parse as links now.
- Title blocks (`% Title`), definition lists, grid, simple and multiline tables, line blocks, example lists and fancy list markers.
- Where pandoc and CommonMark read the same text differently. In the corpus: a line shaped like a link definition whose label starts with `@`, which pandoc reads as a citation and CommonMark as a definition (Manubot uses it), and HTML `<div>`s, which pandoc makes divs. Pandoc also wants a blank line before a heading. These change what the preview shows, never the bytes.
- An unclosed `---` metadata block runs to the end of the file; pandoc falls back to a rule.

**LaTeX.** Left:

- Pair `\begin` and `\end`, flag mismatched names, and pick out maths environments (`equation`, `align` and the rest) for KaTeX.
- Know which groups and brackets are a command's arguments, from a table of signatures, for `\cite`, `\ref`, `\label` and sectioning. [unified-latex](https://github.com/siefkenj/unified-latex)'s CTAN tables are MIT.
- A paper's own macros (`\newcommand`, `\def`), for KaTeX and for argument counts.
- Papers split across files with `\input` and `\include`.
- Catcode changes beyond `@` as a letter, and `\iffalse` blocks.
- Ship the parser's generated tables rather than building it from the grammar at load.

**Typst.** Little to write. Pin the package, keep the test against typst-syntax at each update, and report differences upstream. It is marked experimental, has one maintainer, and follows one Typst release (0.15), so a paper's pinned Typst may be newer than the grammar. Use only its `/lezer` entry; the main one loads the WebAssembly.
