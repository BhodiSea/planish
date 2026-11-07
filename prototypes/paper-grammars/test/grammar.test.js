// SPDX-License-Identifier: Apache-2.0
// Each construct the paper editor must see parses as the node it names.

import {test} from "node:test"
import assert from "node:assert/strict"
import {parsers} from "../src/roundtrip.js"

function nodes(format, text, wanted) {
  let found = []
  let tree = parsers[format].parse(text)
  tree.iterate({enter(n) { if (wanted.includes(n.name)) found.push(`${n.name} ${text.slice(n.from, n.to)}`) }})
  return found
}

test("pandoc Markdown: citations", () => {
  let text = "As @doe99 [p. 33] says [see @doe99, pp. 33-35; also -@smith04]. Mail a@b.org.\n"
  assert.deepEqual(nodes("markdown", text, ["Citation", "CitationKey"]), [
    "Citation @doe99 [p. 33]", "CitationKey @doe99",
    "Citation [see @doe99, pp. 33-35; also -@smith04]", "CitationKey @doe99", "CitationKey @smith04"
  ])
})

test("pandoc Markdown: citation keys end before trailing punctuation", () => {
  assert.deepEqual(nodes("markdown", "See @doi:10.1/x.y. And @{a b}.\n", ["CitationKey"]),
    ["CitationKey @doi:10.1/x.y", "CitationKey @{a b}"])
})

test("pandoc Markdown: fenced divs, closing without a blank line", () => {
  let text = "::: {#warn .callout}\nText\n:::\n\n:::: columns ::::\n::::\n"
  assert.deepEqual(nodes("markdown", text, ["FencedDivOpen", "FencedDivClose", "Attribute"]), [
    "FencedDivOpen ::: {#warn .callout}", "Attribute {#warn .callout}", "FencedDivClose :::",
    "FencedDivOpen :::: columns ::::", "Attribute columns", "FencedDivClose ::::"
  ])
})

test("pandoc Markdown: attributes on headings, spans, links and code", () => {
  let text = "# Intro {#sec:intro}\n\n[small]{.smallcaps} [x](y){width=50%} `z`{.py}\n\nA {.notattr} here.\n"
  assert.deepEqual(nodes("markdown", text, ["Attribute"]),
    ["Attribute {#sec:intro}", "Attribute {.smallcaps}", "Attribute {width=50%}", "Attribute {.py}"])
})

test("pandoc Markdown: raw blocks and spans mount the LaTeX parser", () => {
  let text = "```{=latex}\n\\begin{table}\\end{table}\n```\n\nSee `\\ref{t}`{=latex}.\n"
  assert.deepEqual(nodes("markdown", text, ["CodeInfo", "Begin", "End", "Attribute"]),
    ["CodeInfo {=latex}", "Begin \\begin{table}", "End \\end{table}", "Attribute {=latex}"])
})

test("pandoc Markdown: YAML metadata, mid-document too", () => {
  let text = "---\ntitle: A\n...\n\nText\n\n---\nabstract: B\n---\n\n---\n\nRule above.\n"
  assert.deepEqual(nodes("markdown", text, ["YAMLMetadata", "HorizontalRule", "Pair"]), [
    "YAMLMetadata ---\ntitle: A\n...", "Pair title: A",
    "YAMLMetadata ---\nabstract: B\n---", "Pair abstract: B",
    "HorizontalRule ---"
  ])
})

test("pandoc Markdown: comments", () => {
  let text = "<!-- a note -->\n\nText <!-- inline --> more.\n"
  assert.deepEqual(nodes("markdown", text, ["CommentBlock", "Comment"]),
    ["CommentBlock <!-- a note -->", "Comment <!-- inline -->"])
})

test("pandoc Markdown: TeX maths", () => {
  let text = "Let $x^2$ cost $5 and $6, and $$\\int_0^1 f$$ hold.\n"
  assert.deepEqual(nodes("markdown", text, ["InlineMath", "DisplayMath"]),
    ["InlineMath $x^2$", "DisplayMath $$\\int_0^1 f$$"])
})

test("LaTeX: commands, groups, environments and maths", () => {
  let text = "\\section{Intro}\n\\begin{equation}\nE = mc^2 % energy\n\\end{equation}\nInline $a_{i}$ and \\[b\\] and \\(c\\).\n"
  assert.deepEqual(nodes("latex", text, ["Command", "Begin", "End", "Comment", "InlineMath", "BracketMath", "ParenMath"]), [
    "Command \\section", "Begin \\begin{equation}", "Comment % energy", "End \\end{equation}",
    "InlineMath $a_{i}$", "BracketMath \\[b\\]", "ParenMath \\(c\\)"
  ])
})

test("LaTeX: verbatim text hides commands, comments and braces", () => {
  let text = "\\verb|\\x{| and \\url{a%20b}\n\\begin{verbatim}\n} $ % \\end{other}\n\\end{verbatim}\n"
  assert.deepEqual(nodes("latex", text, ["Verbatim", "VerbatimEnvironment", "Comment", "⚠"]), [
    "Verbatim \\verb|\\x{|", "Verbatim \\url{a%20b}",
    "VerbatimEnvironment \\begin{verbatim}\n} $ % \\end{other}\n\\end{verbatim}"
  ])
})

test("LaTeX: an environment opened in one group and closed in another is not an error", () => {
  let text = "\\newenvironment{x}{\\begin{center}}{\\end{center}}\n"
  assert.deepEqual(nodes("latex", text, ["⚠"]), [])
})

test("Typst: markup, code and maths", () => {
  let text = "= Intro <intro>\nSee @intro and $x^2$.\n#let a = 1\n"
  assert.deepEqual(nodes("typst", text, ["Heading", "Label", "Ref", "Equation", "LetBinding"]), [
    "Heading = Intro", "Label <intro>", "Ref @intro", "Equation $x^2$", "LetBinding let a = 1"
  ])
})
