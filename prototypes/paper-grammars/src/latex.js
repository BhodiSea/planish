// SPDX-License-Identifier: Apache-2.0
// Builds the LaTeX parser from latex.grammar when loaded. The editor would
// ship the generated tables instead.

import {readFileSync} from "node:fs"
import {buildParser} from "@lezer/generator"
import {verbatimTokenizer} from "./latex-tokens.js"

const grammar = readFileSync(new URL("./latex.grammar", import.meta.url), "utf8")

export const latexParser = buildParser(grammar, {
  externalTokenizer: (name, terms) => {
    if (name == "verbatim") return verbatimTokenizer(terms)
    throw new Error(`Unknown tokenizer ${name}`)
  }
})
