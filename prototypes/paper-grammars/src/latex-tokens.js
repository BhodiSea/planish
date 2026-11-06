// SPDX-License-Identifier: Apache-2.0
// Verbatim text, which LaTeX reads without commands, comments or groups:
// \verb|...|, \url{...} and environments such as verbatim and lstlisting.

import {ExternalTokenizer} from "@lezer/lr"

const VERBATIM_ENVIRONMENTS = new Set([
  "verbatim", "verbatim*", "Verbatim", "Verbatim*", "BVerbatim", "LVerbatim",
  "lstlisting", "minted", "comment", "filecontents", "filecontents*"
])
const BRACED = new Set(["url", "path", "nolinkurl"])

function read(input, from, length) {
  let s = ""
  for (let i = from; i < from + length; i++) {
    let ch = input.peek(i)
    if (ch < 0) break
    s += String.fromCharCode(ch)
  }
  return s
}

export function verbatimTokenizer(terms) {
  return new ExternalTokenizer((input) => {
    if (input.next != 92 /* \ */) return
    let head = read(input, 0, 40)
    let m = /^\\(verb\*?|lstinline)([^a-zA-Z\s*{[])/.exec(head)
    if (m) {
      let delim = m[2].charCodeAt(0), i = m[0].length
      for (let ch; (ch = input.peek(i)) >= 0 && ch != 10; i++)
        if (ch == delim) { input.acceptToken(terms.Verbatim, i + 1); return }
      return
    }
    m = /^\\([a-zA-Z]+)\{/.exec(head)
    if (m && BRACED.has(m[1])) {
      let depth = 0
      for (let i = m[0].length - 1, ch; (ch = input.peek(i)) >= 0; i++) {
        if (ch == 123) depth++
        else if (ch == 125 && --depth == 0) { input.acceptToken(terms.Verbatim, i + 1); return }
        else if (ch == 10 && input.peek(i + 1) == 10) return
      }
      return
    }
    m = /^\\begin\{([a-zA-Z*]+)\}/.exec(head)
    if (m && VERBATIM_ENVIRONMENTS.has(m[1])) {
      let close = `\\end{${m[1]}}`
      for (let i = m[0].length; input.peek(i) >= 0; i++) {
        if (input.peek(i) == 92 && read(input, i, close.length) == close) {
          input.acceptToken(terms.VerbatimEnvironment, i + close.length)
          return
        }
      }
    }
  })
}
