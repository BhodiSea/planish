// SPDX-License-Identifier: Apache-2.0
// Prints, for each paper, the parse time and what the grammars found, and for
// pandoc Markdown the same counts from pandoc itself when it is installed.

import {execFileSync} from "node:child_process"
import {appendFileSync} from "node:fs"
import {corpus, fetchPaper, name} from "./src/corpus.js"
import {open, tree, errors, counts} from "./src/roundtrip.js"

function pandocCounts(bytes) {
  let ast
  try {
    ast = JSON.parse(execFileSync("pandoc", ["-f", "markdown", "-t", "json"], {input: bytes, maxBuffer: 1 << 28}))
  } catch (e) {
    if (e.code == "ENOENT") return null
    throw e
  }
  let c = {cite: 0, div: 0, inlineMath: 0, displayMath: 0, raw: 0}
  let walk = v => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v != "object") return
    if (v.t == "Cite") c.cite += v.c[0].length
    if (v.t == "Div") c.div++
    if (v.t == "Math") c[v.c[0].t == "DisplayMath" ? "displayMath" : "inlineMath"]++
    // HTML is raw to pandoc but plain CommonMark to the grammar.
    if ((v.t == "RawBlock" || v.t == "RawInline") && v.c[0] != "html") c.raw++
    Object.values(v).forEach(walk)
  }
  walk(ast.blocks)
  c.meta = Object.keys(ast.meta).length > 0
  return c
}

let rows = ["| Paper | Format | Bytes | Parse (ms) | Error nodes | Found | pandoc found |", "|---|---|---|---|---|---|---|"]
for (let entry of corpus) {
  let bytes = await fetchPaper(entry)
  let doc = open(bytes, entry.format)
  let start = performance.now()
  let parsed = tree(doc.state)
  let ms = (performance.now() - start).toFixed(0)
  let c = counts(parsed), found = "", theirs = ""
  if (entry.format == "markdown") {
    let raw = 0
    parsed.iterate({enter(n) {
      if (n.name == "CodeInfo" || n.name == "Attribute") {
        if (/^\{=/.test(doc.state.sliceDoc(n.from, n.to))) raw++
      }
    }})
    found = `${c.CitationKey || 0} cites, ${c.FencedDivOpen || 0} divs, ${c.InlineMath || 0}+${c.DisplayMath || 0} maths, ${raw} raw, ${c.YAMLMetadata ? "metadata" : "no metadata"}`
    let p = pandocCounts(bytes)
    theirs = p ? `${p.cite} cites, ${p.div} divs, ${p.inlineMath}+${p.displayMath} maths, ${p.raw} raw, ${p.meta ? "metadata" : "no metadata"}` : "pandoc not installed"
  } else if (entry.format == "latex") {
    found = `${c.Command || 0} commands, ${c.Begin || 0} begins, ${c.End || 0} ends, ${(c.InlineMath || 0) + (c.DisplayMath || 0) + (c.BracketMath || 0) + (c.ParenMath || 0)} maths`
  } else {
    found = `${c.Heading || 0} headings, ${c.Equation || 0} equations, ${c.FuncCall || 0} calls`
  }
  rows.push(`| [${name(entry)}](https://github.com/${entry.repository}/blob/${entry.commit}/${entry.path}) | ${entry.format} | ${entry.bytes} | ${ms} | ${errors(parsed).length} | ${found} | ${theirs} |`)
}
let table = rows.join("\n") + "\n"
process.stdout.write(table)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table)
