import { createHash } from 'node:crypto'
import { itemOf, type PdfFont, type PdfItem } from './pdfjs.ts'
import { cmapOf, glyphCount, isSfnt, withCmap } from './sfnt.ts'
import type { Run } from './types.ts'

// The PDF's own fonts for the printed view, where their makers permit embedding (Andrei, 2026-10-17): the program
// pdf.js rebuilt for a browser, its character map rewritten from the PDF's ToUnicode so our text reaches its glyphs.

// The letters a face draws, as a CSS unicode-range ("U+41-5A, U+61"); our text uses it only where it covers them all.
export type OwnFace = { range: string; notice: string }
export type OwnFonts = {
  faces: Record<string, string>
  fonts: Record<string, OwnFace>
  files: Map<string, Uint8Array>
}
// A face's id and family: its program's content, so one subset used on several pages is one file.
const ID_HEX = 12

// The fonts whose makers permit embedding (eval/rawfonts.ts): per PostScript name its notice and whether its
// program is bare CFF (pdf.js then serves it as OpenType CFF), so a TrueType of the same name never vouches for it.
export type Permitted = ReadonlyMap<string, { notice: string; cff: boolean }>
// Per font (loadedName), each letter's code in pdf.js' program the page draws it with most (its operator list).
export type Drawn = ReadonlyMap<string, ReadonlyMap<string, number>>

// Per run, the PDF face it is printed in (by the text item that prints it), for the permitted fonts.
export function ownFonts(
  runs: readonly Run[],
  items: readonly PdfItem[],
  fonts: readonly PdfFont[],
  view: readonly [number, number, number, number],
  permitted: Permitted,
  drawn: Drawn,
): OwnFonts {
  const out: OwnFonts = { faces: {}, fonts: {}, files: new Map() }
  const ids = new Map<string, string | null>()
  const idOf = (f: PdfFont): string | null => {
    if (ids.has(f.loadedName)) return ids.get(f.loadedName) ?? null
    const allowed = permitted.get((f.name ?? '').replace(/^[A-Z]{6}\+/, ''))
    const cff = f.data !== undefined && f.data.length >= 4 && String.fromCharCode(...f.data.subarray(0, 4)) === 'OTTO'
    const built = allowed?.cff === cff ? webFont(f, drawn.get(f.loadedName) ?? new Map()) : null
    const id = built ? `pdf-${createHash('sha256').update(built.data).digest('hex').slice(0, ID_HEX)}` : null
    if (id && built) {
      out.fonts[id] = { range: built.range, notice: allowed?.notice ?? '' }
      out.files.set(id, built.data)
    }
    ids.set(f.loadedName, id)
    return id
  }
  const byName = new Map(fonts.map((f) => [f.loadedName, f]))
  for (const r of runs) {
    const font = byName.get(itemOf(r, items, view)?.fontName ?? '')
    const id = font ? idOf(font) : null
    if (id) out.faces[r.id] = id
  }
  return out
}

// The font as a browser reads it: Unicode → the glyph each code draws, for every code whose ToUnicode is one BMP
// letter that pdf.js' own cmap lists (a multi-letter entry, "Th", maps its first letter to the ligature; a code it
// does not list draws .notdef). A letter several codes draw with different glyphs (Cormorant's two figure styles)
// takes the one the page draws most (`drawn`), or is left out. Null when nothing is covered or no sfnt.
export function webFont(f: PdfFont, drawn: ReadonlyMap<string, number>): { data: Uint8Array; range: string } | null {
  if (f.missingFile === true || f.isType3Font || !f.data || !isSfnt(f.data)) return null
  const glyphs = cmapOf(f.data)
  const count = glyphCount(f.data)
  const choices = new Map<number, Map<number, number>>()
  for (const [code, u] of (f.toUnicode?._map ?? []).entries()) {
    const cp = u?.codePointAt(0)
    const fontChar = f.toFontChar?.[code]
    if (u === undefined || cp === undefined || fontChar === undefined || u.length !== 1 || cp < 0x20 || cp >= 0xffff)
      continue
    const glyph = glyphs.get(fontChar)
    if (glyph === undefined || glyph >= count) continue
    const options = choices.get(cp) ?? new Map<number, number>()
    options.set(glyph, fontChar)
    choices.set(cp, options)
  }
  const map = new Map<number, number>()
  for (const [cp, options] of choices) {
    const used = drawn.get(String.fromCodePoint(cp))
    const pick = options.size === 1 ? [...options.keys()][0] : [...options].find(([, c]) => c === used)?.[0]
    if (pick !== undefined) map.set(cp, pick)
  }
  const data = map.size ? withCmap(f.data, map) : null
  return data ? { data, range: unicodeRange([...map.keys()]) } : null
}

// A face drawing capitals for lowercase (eval/facemetrics.ts capsFaces) maps each letter's other case to the same
// glyph: the layer sets "two" and "COURSES" by whichever codes the PDF used, and ours asks for either (Howies' Lulo).
export function caseFilled(data: Uint8Array): { data: Uint8Array; range: string } | null {
  const map = new Map(cmapOf(data))
  for (const [cp, glyph] of [...map]) {
    const letter = String.fromCodePoint(cp)
    for (const other of [letter.toUpperCase(), letter.toLowerCase()]) {
      const code = other.codePointAt(0)
      if (other.length === 1 && code !== undefined && code !== cp && !map.has(code)) map.set(code, glyph)
    }
  }
  const filled = withCmap(data, map)
  return filled ? { data: filled, range: unicodeRange([...map.keys()]) } : null
}

export function unicodeRange(codes: readonly number[]): string {
  const sorted = [...new Set(codes)].sort((a, b) => a - b)
  const spans: [number, number][] = []
  for (const c of sorted) {
    const last = spans.at(-1)
    if (last && c === last[1] + 1) last[1] = c
    else spans.push([c, c])
  }
  const hex = (n: number): string => n.toString(16).toUpperCase()
  return spans.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(', ')
}
