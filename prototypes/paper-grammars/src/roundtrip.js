// SPDX-License-Identifier: Apache-2.0
// Opens a file as the paper editor would, in a CodeMirror state with the
// format's parser, and saves it back to bytes.

import {EditorState} from "@codemirror/state"
import {Language, defineLanguageFacet, ensureSyntaxTree} from "@codemirror/language"
import {pandocParser} from "./pandoc-markdown.js"
import {latexParser} from "./latex.js"
import {typstParser} from "codemirror-lang-typst/lezer"

const BOM = [0xef, 0xbb, 0xbf]

export const parsers = {
  markdown: pandocParser({raw: {latex: latexParser, tex: latexParser, typst: typstParser}}),
  latex: latexParser,
  typst: typstParser
}

const languages = Object.fromEntries(Object.entries(parsers).map(
  ([name, parser]) => [name, new Language(defineLanguageFacet(), parser, [], name)]))

// keepLineEnds: false is CodeMirror's default, which splits on \r\n, \r and
// \n and joins with \n. Setting a line separator keeps every other line
// ending as text, so the document's bytes survive.
export function open(bytes, format, {keepLineEnds = true} = {}) {
  let bom = BOM.every((b, i) => bytes[i] == b)
  let text = new TextDecoder("utf-8", {fatal: true}).decode(bytes)
  let extensions = [languages[format]]
  if (keepLineEnds) extensions.push(EditorState.lineSeparator.of(text.includes("\r\n") ? "\r\n" : "\n"))
  let state = EditorState.create({doc: text, extensions})
  return {state, bom}
}

// sliceDoc joins lines with the state's line break; doc.toString() uses \n.
export function save({state, bom}) {
  let body = new TextEncoder().encode(state.sliceDoc())
  return bom ? Uint8Array.from([...BOM, ...body]) : body
}

export function tree(state) {
  return ensureSyntaxTree(state, state.doc.length, 60000)
}

export function errors(t) {
  let found = []
  t.iterate({enter(n) { if (n.type.isError) found.push(n.from) }})
  return found
}

export function counts(t) {
  let c = {}
  t.iterate({enter(n) { c[n.name] = (c[n.name] || 0) + 1 }})
  return c
}
