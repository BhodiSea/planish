// SPDX-License-Identifier: Apache-2.0
// Pandoc Markdown extensions for @lezer/markdown: citations, fenced divs,
// attributes, raw blocks and spans, YAML metadata blocks and TeX maths.
// Comments are CommonMark's HTML comments, which the base parser has.

import {parser as baseParser, GFM, Superscript, Subscript} from "@lezer/markdown"
import {parseMixed} from "@lezer/common"
import {parser as yamlParser} from "@lezer/yaml"

// Pandoc's manual: a key starts with a letter, digit or _, and may hold
// alphanumerics, _ and internal punctuation :.#$%&-+?<>~/.
const KEY = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/](?=[\p{L}\p{N}_]))*/u
const BRACED_KEY = /^\{[^{}]*\}/
const WORD = /[\p{L}\p{N}_]/u

function keyLength(text) {
  let m = KEY.exec(text) || BRACED_KEY.exec(text)
  return m ? m[0].length : -1
}

// Attributes: {#id .class key=value key="value"} or {=format}.
const ATTR = /^\{\s*(?:=[\w-]+|(?:(?:#[\w:.-]+|\.[\w:-]+|[\w-]+=(?:"[^"]*"|'[^']*'|[^\s}]*)|-)\s*)+)\}/

function attributeLength(text) {
  let m = ATTR.exec(text)
  return m ? m[0].length : -1
}

const Citations = {
  defineNodes: ["Citation", "CitationMark", "CitationKey", "CitationText"],
  parseInline: [{
    // [see @doe99, pp. 33-35; also @smith04, chap. 1] and [-@doe99]
    name: "BracketedCitation",
    before: "Link",
    parse(cx, next, pos) {
      if (next != 91 /* [ */) return -1
      let rest = cx.slice(pos, cx.end)
      let m = /^\[[^\[\]]*\]/.exec(rest)
      if (!m || !/(?:^|[\s\[;-])@/.test(m[0])) return -1
      let end = pos + m[0].length, children = [cx.elt("CitationMark", pos, pos + 1)]
      let items = [], key = /(?:^|[\s;\[-])-?@/g, found
      let body = m[0]
      while ((found = key.exec(body))) {
        let at = found.index + found[0].length
        let len = keyLength(body.slice(at))
        if (len < 0) continue
        items.push(cx.elt("CitationKey", pos + at - 1, pos + at + len))
        key.lastIndex = at + len
      }
      if (!items.length) return -1
      children.push(...items, cx.elt("CitationMark", end - 1, end))
      return cx.addElement(cx.elt("Citation", pos, end, children))
    }
  }, {
    // @doe99 and @doe99 [p. 33]
    name: "InTextCitation",
    before: "Link",
    parse(cx, next, pos) {
      if (next != 64 /* @ */) return -1
      if (pos > cx.offset && WORD.test(cx.slice(pos - 1, pos))) return -1
      let len = keyLength(cx.slice(pos + 1, cx.end))
      if (len < 0) return -1
      let end = pos + 1 + len, children = [cx.elt("CitationKey", pos, end)]
      let suffix = /^ \[[^\[\]@]*\]/.exec(cx.slice(end, cx.end))
      if (suffix) {
        children.push(cx.elt("CitationText", end + 1, end + suffix[0].length))
        end += suffix[0].length
      }
      return cx.addElement(cx.elt("Citation", pos, end, children))
    }
  }]
}

const Attributes = {
  defineNodes: ["Attribute"],
  parseInline: [{
    // After a span, link, image or inline code, or ending a heading line.
    name: "Attribute",
    before: "Link",
    parse(cx, next, pos) {
      if (next != 123 /* { */) return -1
      let len = attributeLength(cx.slice(pos, cx.end))
      if (len < 0) return -1
      let before = cx.slice(pos - 1, pos)
      let after = cx.slice(pos + len, cx.end)
      if (!/[\]`)]/.test(before) && !(/^\s$/.test(before) && /^\s*$/.test(after.split("\n")[0])))
        return -1
      return cx.addElement(cx.elt("Attribute", pos, pos + len))
    }
  }]
}

// Fenced divs are left flat, an opening and a closing fence, so a missing
// fence costs nothing; the editor pairs them in a pass over the tree.
const FencedDivs = {
  defineNodes: [
    {name: "FencedDivOpen", block: true},
    {name: "FencedDivClose", block: true},
    "DivMark"
  ],
  parseBlock: [{
    name: "FencedDiv",
    before: "FencedCode",
    parse(cx, line) {
      let text = line.text.slice(line.pos)
      let m = /^(:{3,})[ \t]*(.*?)[ \t]*$/.exec(text)
      if (!m) return false
      let from = cx.lineStart + line.pos, marks = [cx.elt("DivMark", from, from + m[1].length)]
      let info = m[2]
      if (!info || /^:*$/.test(info)) {
        if (info) marks.push(cx.elt("DivMark", from + text.indexOf(info), from + text.indexOf(info) + info.length))
        cx.nextLine()
        cx.addElement(cx.elt("FencedDivClose", from, cx.prevLineEnd(), marks))
        return true
      }
      let infoFrom = from + text.indexOf(info, m[1].length)
      let attr = /^(\{[^}]*\}|[\w-]+)(?:[ \t]*(:*))?$/.exec(info)
      if (!attr) return false
      marks.push(cx.elt("Attribute", infoFrom, infoFrom + attr[1].length))
      if (attr[2]) {
        let trailFrom = infoFrom + info.lastIndexOf(attr[2])
        marks.push(cx.elt("DivMark", trailFrom, trailFrom + attr[2].length))
      }
      cx.nextLine()
      cx.addElement(cx.elt("FencedDivOpen", from, cx.prevLineEnd(), marks))
      return true
    },
    // A fence ends a paragraph without a blank line, as in pandoc.
    endLeaf(cx, line) { return /^:{3,}/.test(line.text.slice(line.pos)) }
  }]
}

// A YAML metadata block: a line of --- that does not end a paragraph and is
// followed by a line that is not blank, up to a line of --- or ....
const YAMLMetadata = {
  defineNodes: [{name: "YAMLMetadata", block: true}, "YAMLMark", "YAMLContent"],
  parseBlock: [{
    name: "YAMLMetadata",
    before: "HorizontalRule",
    parse(cx, line) {
      if (line.pos || !/^---[ \t]*$/.test(line.text) || /^\s*$/.test(cx.peekLine())) return false
      let from = cx.lineStart, openEnd = from + line.text.length
      cx.nextLine()
      let contentFrom = cx.lineStart, contentTo = contentFrom, closed = false
      do {
        if (/^(---|\.\.\.)[ \t]*$/.test(line.text)) { closed = true; break }
        contentTo = cx.lineStart + line.text.length
      } while (cx.nextLine())
      let marks = [cx.elt("YAMLMark", from, openEnd), cx.elt("YAMLContent", contentFrom, contentTo)]
      if (closed) {
        marks.push(cx.elt("YAMLMark", cx.lineStart, cx.lineStart + line.text.length))
        cx.nextLine()
      }
      cx.addElement(cx.elt("YAMLMetadata", from, cx.prevLineEnd(), marks))
      return true
    }
  }]
}

// TeX maths: $...$ with no space inside either dollar and no digit after the
// closing one, and $$...$$.
const TeXMath = {
  defineNodes: ["InlineMath", "DisplayMath", "MathMark"],
  parseInline: [{
    name: "TeXMath",
    before: "Emphasis",
    parse(cx, next, pos) {
      if (next != 36 /* $ */) return -1
      let display = cx.char(pos + 1) == 36
      let open = display ? 2 : 1, text = cx.slice(pos, cx.end)
      if (display) {
        let close = text.indexOf("$$", 2)
        if (close < 0) return -1
        let end = pos + close + 2
        return cx.addElement(cx.elt("DisplayMath", pos, end,
          [cx.elt("MathMark", pos, pos + 2), cx.elt("MathMark", end - 2, end)]))
      }
      if (/^\s/.test(text.slice(1))) return -1
      for (let i = 1; i < text.length; i++) {
        let ch = text[i]
        if (ch == "\\") { i++; continue }
        if (ch == "\n" && text[i + 1] == "\n" || ch == "$" && text[i + 1] == "$") return -1
        if (ch == "$" && !/\s/.test(text[i - 1]) && !/[0-9]/.test(text[i + 1] || "")) {
          let end = pos + i + 1
          return cx.addElement(cx.elt("InlineMath", pos, end,
            [cx.elt("MathMark", pos, pos + open), cx.elt("MathMark", end - 1, end)]))
        }
      }
      return -1
    }
  }]
}

export const PandocExtensions = [GFM, Superscript, Subscript, Citations, Attributes, FencedDivs, YAMLMetadata, TeXMath]

// Raw blocks (```{=latex}) and raw spans (`x`{=latex}) are fenced and inline
// code with a {=format} attribute; nested parsers are mounted by format.
export function pandocParser({raw = {}} = {}) {
  return baseParser.configure([...PandocExtensions, {
    wrap: parseMixed((node, input) => {
      if (node.name == "YAMLContent") return {parser: yamlParser}
      if (node.name == "CodeText") {
        let info = node.node.parent.getChild("CodeInfo")
        let format = info && /^\{=([\w-]+)\}$/.exec(input.read(info.from, info.to))
        if (format && raw[format[1]]) return {parser: raw[format[1]]}
      }
      return null
    })
  }])
}
