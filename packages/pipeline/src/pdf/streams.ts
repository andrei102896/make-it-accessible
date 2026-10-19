import { inflateSync } from 'node:zlib'
import { Refused } from './refused.ts'

// How far before a stream its dictionary may start: a font file's or a page content's dictionary is a few entries.
const DICT_REACH = 400
// A stream inflating past this is no font or page text (the PDF's bytes are untrusted): it is skipped.
const MAX_INFLATED = 64 * 1024 * 1024
// All of a document's streams together, every attempt charged: the most measured (2026-10-19, 66 test documents) is
// 177 MB (Akash's trifold), Lidl DE's 73 pages 169 MB; past this a document is refused.
export const MAX_DOCUMENT_INFLATED = 600 * 1024 * 1024

export type Budget = { left: number }

// Every FlateDecode stream of a PDF, decompressed, as its maker wrote it (pdf.js and Poppler hand back only what they
// read of them: fonts rebuilt, marked-content text dropped); a stream that does not inflate is skipped.
export const flateStreams = (pdf: Uint8Array, budget?: Budget): Uint8Array[] => [...streamsOf(pdf, budget)]

// The same, one at a time (a scan keeps none in memory); throws Refused once the budget is spent.
export function* streamsOf(pdf: Uint8Array, budget: Budget = { left: MAX_DOCUMENT_INFLATED }): Generator<Uint8Array> {
  const text = Buffer.from(pdf).toString('latin1')
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length
    const end = text.indexOf('endstream', start)
    const dict = text.slice(Math.max(0, m.index - DICT_REACH), m.index)
    if (end < 0 || !/FlateDecode/.test(dict.slice(dict.lastIndexOf('<<')))) continue
    const data = inflated(pdf.subarray(start, end), budget)
    if (budget.left <= 0)
      throw new Refused('the PDF inflates past its budget (a decompression bomb, or far larger than any menu)')
    if (data) yield data
  }
}

// A stream ends before "endstream" with an end-of-line Poppler and others write either way; a corrupt one is skipped.
// Every attempt is charged; one past the per-stream cap is not retried (a bomb would cost three times).
function inflated(bytes: Uint8Array, budget: Budget): Uint8Array | null {
  for (const cut of [0, 1, 2]) {
    const cap = Math.min(MAX_INFLATED, budget.left)
    try {
      const out = inflateSync(bytes.subarray(0, bytes.length - cut), { maxOutputLength: cap })
      budget.left -= out.length
      return out
    } catch (e) {
      if (e instanceof RangeError || (e instanceof Error && 'code' in e && e.code === 'ERR_BUFFER_TOO_LARGE')) {
        budget.left -= cap
        return null
      }
    }
  }
  return null
}

// The bytes every stream inflates to, none kept: a scan that refuses a bomb before any other work.
export function inflatedSize(pdf: Uint8Array, budget: Budget): number {
  let bytes = 0
  for (const data of streamsOf(pdf, budget)) bytes += data.length
  return bytes
}
