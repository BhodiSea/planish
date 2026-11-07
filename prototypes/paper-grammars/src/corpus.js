// SPDX-License-Identifier: Apache-2.0
// Fetches the corpus of public papers, pinned by commit and SHA-256, into a
// local cache. The papers are not committed: each keeps its own licence.

import {createHash} from "node:crypto"
import {mkdirSync, readFileSync, writeFileSync, existsSync} from "node:fs"

export const corpus = JSON.parse(readFileSync(new URL("../corpus.json", import.meta.url), "utf8"))
const cache = new URL("../.cache/", import.meta.url)

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex")

export function name(entry) {
  return `${entry.repository}/${entry.path}`
}

export async function fetchPaper(entry) {
  let file = new URL(entry.sha256, cache)
  if (existsSync(file)) return new Uint8Array(readFileSync(file))
  let url = `https://raw.githubusercontent.com/${entry.repository}/${entry.commit}/${entry.path}`
  let response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  let bytes = new Uint8Array(await response.arrayBuffer())
  if (sha256(bytes) != entry.sha256) throw new Error(`${url}: SHA-256 differs from corpus.json`)
  mkdirSync(cache, {recursive: true})
  writeFileSync(file, bytes)
  return bytes
}

// The same text with CRLF line ends, with a byte order mark, and with mixed
// line ends, since the public papers are all LF without a mark.
export function variants(bytes) {
  let text = new TextDecoder().decode(bytes)
  let lines = text.split("\n")
  let enc = s => new TextEncoder().encode(s)
  return {
    original: bytes,
    crlf: enc(lines.join("\r\n")),
    bom: Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]),
    mixed: enc(lines.map((l, i) => l + (i == lines.length - 1 ? "" : i % 3 ? "\n" : "\r\n")).join(""))
  }
}
