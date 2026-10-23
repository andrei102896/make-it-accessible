import type { PdfFont } from './pdfjs.ts'
import { cmapOf, glyphCount, isSfnt, withCmap } from './sfnt.ts'

// The PDF's own programs rebuilt for a browser (pdf/printedfaces.ts measures them): the program pdf.js rebuilt, its
// character map rewritten from the PDF's ToUnicode so our text reaches its glyphs.

// Per font (loadedName), each letter's code in pdf.js' program the page draws it with most (its operator list).
export type Drawn = ReadonlyMap<string, ReadonlyMap<string, number>>

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

function unicodeRange(codes: readonly number[]): string {
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
