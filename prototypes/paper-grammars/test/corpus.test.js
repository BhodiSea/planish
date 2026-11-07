// SPDX-License-Identifier: Apache-2.0
// Opening and saving each public paper without an edit keeps its SHA-256,
// its parse has no error nodes, and an edit and its undo change nothing.

import {test} from "node:test"
import assert from "node:assert/strict"
import {ChangeSet} from "@codemirror/state"
import {corpus, fetchPaper, name, sha256, variants} from "../src/corpus.js"
import {open, save, tree, errors, parsers} from "../src/roundtrip.js"
import {officialNodes, lezerNodes} from "../src/typst-official.js"

for (let entry of corpus) {
  test(name(entry), async t => {
    let bytes = await fetchPaper(entry)

    await t.test("parses with no error nodes", () => {
      let doc = open(bytes, entry.format), parsed = tree(doc.state)
      assert.equal(parsed.length, doc.state.doc.length)
      let found = errors(parsed)
      assert.deepEqual(found, [], `error nodes at ${found.slice(0, 5)}`)
    })

    for (let [variant, input] of Object.entries(variants(bytes))) {
      await t.test(`opening and saving keeps the SHA-256 (${variant})`, () => {
        let doc = open(input, entry.format)
        tree(doc.state)
        assert.equal(sha256(save(doc)), sha256(input))
      })
    }

    await t.test("CodeMirror's default line breaks rewrite CRLF files", () => {
      let input = variants(bytes).crlf
      assert.notEqual(sha256(save(open(input, entry.format, {keepLineEnds: false}))), sha256(input))
    })

    await t.test("an edit and its undo leave the bytes and the tree unchanged", () => {
      let doc = open(bytes, entry.format), state = doc.state
      let before = tree(state).toString()
      let at = Math.floor(state.doc.length / 2)
      let edit = ChangeSet.of({from: at, insert: "x"}, state.doc.length)
      let edited = state.update({changes: edit}).state
      tree(edited)
      let undone = edited.update({changes: edit.invert(state.doc)}).state
      assert.equal(tree(undone).toString(), before)
      assert.equal(sha256(save({state: undone, bom: doc.bom})), sha256(bytes))
    })

    if (entry.format == "typst") {
      await t.test("the Lezer tree matches typst-syntax's", () => {
        let text = new TextDecoder().decode(bytes)
        let official = officialNodes(text), lezer = lezerNodes(parsers.typst.parse(text))
        assert.deepEqual([...official].filter(n => !lezer.has(n)).slice(0, 10), [])
        assert.deepEqual([...lezer].filter(n => !official.has(n)).slice(0, 10), [])
      })
    }
  })
}
