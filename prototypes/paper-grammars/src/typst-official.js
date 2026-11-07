// SPDX-License-Identifier: Apache-2.0
// The official typst-syntax parser, as WebAssembly, which codemirror-lang-typst
// also ships, to check its Lezer tree against. Needs Node's
// --experimental-wasm-modules.

// The package does not export its WebAssembly, so it is loaded by path.
const {TypstWasmParser} = await import(new URL("../node_modules/codemirror-lang-typst/wasm/typst_syntax.js", import.meta.url))

const kinds = Object.fromEntries(TypstWasmParser.get_node_types().map(([n, k]) => [k, n]))

// Every node as from:to:name, the root left out, as the Lezer tree names it
// Typst where typst-syntax names it Markup.
export function officialNodes(text) {
  let parser = new TypstWasmParser(text), nodes = new Set()
  let walk = (node, from) => {
    nodes.add(`${from}:${from + node.length}:${kinds[node.kind]}`)
    for (let child of node.children) { walk(child, from); from += child.length }
  }
  let root = parser.tree(), from = 0
  for (let child of root.children) { walk(child, from); from += child.length }
  parser.free()
  return nodes
}

export function lezerNodes(tree) {
  let nodes = new Set()
  tree.iterate({enter(n) { if (n.from != 0 || n.to != tree.length || n.type.id != tree.type.id) nodes.add(`${n.from}:${n.to}:${n.name}`) }})
  return nodes
}
