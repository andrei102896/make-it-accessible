import { inflateSync } from 'node:zlib'

// How far before a stream its dictionary may start: a font file's or a page content's dictionary is a few entries.
const DICT_REACH = 400
// A stream inflating past this is no font or page text (the PDF's bytes are untrusted): it is skipped.
const MAX_INFLATED = 64 * 1024 * 1024

// Every FlateDecode stream of a PDF, decompressed, as its maker wrote it (pdf.js and Poppler hand back only what they
// read of them: fonts rebuilt, marked-content text dropped); a stream that does not inflate is skipped.
export function flateStreams(pdf: Uint8Array): Uint8Array[] {
  const text = Buffer.from(pdf).toString('latin1')
  return [...text.matchAll(/stream\r?\n/g)].flatMap((m) => {
    const start = m.index + m[0].length
    const end = text.indexOf('endstream', start)
    const dict = text.slice(Math.max(0, m.index - DICT_REACH), m.index)
    if (end < 0 || !/FlateDecode/.test(dict.slice(dict.lastIndexOf('<<')))) return []
    const data = inflated(pdf.subarray(start, end))
    return data ? [data] : []
  })
}

// A stream ends before "endstream" with an end-of-line Poppler and others write either way; a corrupt one is skipped.
const inflated = (bytes: Uint8Array): Uint8Array | null => {
  for (const cut of [0, 1, 2])
    try {
      return inflateSync(bytes.subarray(0, bytes.length - cut), { maxOutputLength: MAX_INFLATED })
    } catch {
      continue
    }
  return null
}
