import { inflateSync } from 'node:zlib'
import type { Permitted } from '@make-it-accessible/pipeline/pdf/ownfont'
import { fsTypeOf, isSfnt, nameOf, permitsEmbedding } from '@make-it-accessible/pipeline/pdf/sfnt'

// The font programs embedded in a PDF as its maker wrote them: pdf.js rebuilds the ones it serves, zeroing their
// embedding flags and names, so permission and licence text come only from these (the raw FlateDecode streams).

// How far before a stream its dictionary may start: a font file's dictionary is a few entries long.
const DICT_REACH = 400

// Per PostScript name (subset prefix dropped), its licence notice and outline kind, for the names whose every
// program permits embedding (a name with no program found is absent: nothing matched is nothing permitted).
export function permittedFonts(pdf: Uint8Array): Permitted {
  const text = Buffer.from(pdf).toString('latin1')
  const seen = new Map<string, { ok: boolean; notice: string; cff: boolean }>()
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length
    const end = text.indexOf('endstream', start)
    const dict = text.slice(Math.max(0, m.index - DICT_REACH), m.index)
    if (end < 0 || !/FlateDecode/.test(dict.slice(dict.lastIndexOf('<<')))) continue
    const data = inflated(pdf.subarray(start, end))
    const program = data && isSfnt(data) ? read(data) : null
    if (!program) continue
    const before = seen.get(program.name)
    seen.set(program.name, {
      ok: (before?.ok ?? true) && program.ok && (before?.cff ?? program.cff) === program.cff,
      notice: before?.notice || program.notice,
      cff: program.cff,
    })
  }
  return new Map([...seen].flatMap(([name, s]) => (s.ok ? [[name, { notice: s.notice, cff: s.cff }] as const] : [])))
}

// A program's name, permission, notice and kind; null when its tables are cut short (the PDF's bytes, untrusted).
function read(data: Uint8Array): { name: string; ok: boolean; notice: string; cff: boolean } | null {
  try {
    const name = nameOf(data, 6)?.replace(/^[A-Z]{6}\+/, '')
    if (!name) return null
    const notice = [0, 13, 14]
      .map((id) => nameOf(data, id) ?? '')
      .filter(Boolean)
      .join(' ')
    const cff = String.fromCharCode(...data.subarray(0, 4)) === 'OTTO'
    return { name, ok: permitsEmbedding(fsTypeOf(data)), notice, cff }
  } catch {
    return null
  }
}

// A stream ends before "endstream" with an end-of-line Poppler and others write either way; a corrupt one is skipped.
const inflated = (bytes: Uint8Array): Uint8Array | null => {
  for (const cut of [0, 1, 2])
    try {
      return inflateSync(bytes.subarray(0, bytes.length - cut))
    } catch {
      continue
    }
  return null
}
