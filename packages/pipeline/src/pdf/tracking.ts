import { itemOf, type PdfFont, type PdfItem } from './pdfjs.ts'
import type { Run } from './types.ts'

// Printed letter spacing (tracking) per word: its printed width against the sum of its letters' advance widths in
// the PDF's own font (pdf.js), shared by the gaps between its letters (Poppler's word box ends at the last letter's
// advance, without its spacing). In ems, so it follows our size when a line is shrunk to fit.

// Under this (in ems) a word is set as its face is drawn: box rounding and kerning stay below it.
const TRACKED = 0.03
// Past this the measure is not tracking (a word matched to the wrong font or text item).
const IMPLAUSIBLE = 0.5

// Per run id, its tracking in ems where tracked: measured in the font of the horizontal text item spanning its centre
// on its baseline (`view`: the page's box); a letter with no code in that font leaves the run unmeasured.
export function trackingOf(
  runs: readonly Run[],
  items: readonly PdfItem[],
  fonts: readonly PdfFont[],
  view: readonly [number, number, number, number],
): Record<string, number> {
  const advance = (f: PdfFont, code: number): number =>
    (Array.isArray(f.widths) ? f.widths[code] : f.widths[String(code)]) ?? f.defaultWidth
  const byName = new Map(fonts.map((f) => [f.loadedName, f]))
  const codes = new Map<PdfFont, Map<string, number>>()
  const codeOf = (f: PdfFont, ch: string): number | undefined => {
    let map = codes.get(f)
    if (!map) {
      map = new Map()
      // A letter drawn by several codes (alternates, small caps) has no one advance: it is left unmeasured.
      for (const [code, u] of (f.toUnicode?._map ?? []).entries()) if (u) map.set(u, map.has(u) ? NaN : code)
      codes.set(f, map)
    }
    return map.get(ch)
  }
  const out: Record<string, number> = {}
  for (const r of runs) {
    const item = itemOf(r, items, view)
    const font = item && byName.get(item.fontName)
    if (!item || !font || font.isType3Font) continue
    // Horizontal scaling (Tz) narrows the advances, not the size: [0] is the width scale, [3] the size.
    const [wide, , , size] = item.transform
    const letters = Array.from(r.str).filter((ch) => ch.trim())
    if (letters.length < 2) continue
    let natural = 0
    for (const ch of letters) {
      const code = codeOf(font, ch)
      if (code === undefined || Number.isNaN(code)) {
        natural = NaN
        break
      }
      natural += (advance(font, code) * wide) / 1000
    }
    const em = (r.box.w - natural) / (letters.length - 1) / size
    if (Number.isFinite(em) && Math.abs(em) >= TRACKED && Math.abs(em) < IMPLAUSIBLE)
      out[r.id] = Math.round(em * 1000) / 1000
  }
  return out
}
