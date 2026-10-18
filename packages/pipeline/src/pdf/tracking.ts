import { z } from 'zod'
import type { Run } from './types.ts'

// Printed letter spacing (tracking) per word: its printed width against the sum of its letters' advance widths in
// the PDF's own font (pdf.js), shared by the gaps between its letters (Poppler's word box ends at the last letter's
// advance, without its spacing). In ems, so it follows our size when a line is shrunk to fit.

// Under this (in ems) a word is set as its face is drawn: box rounding and kerning stay below it.
const TRACKED = 0.03
// Past this the measure is not tracking (a word matched to the wrong font or text item).
const IMPLAUSIBLE = 0.5

// What the measure reads of pdf.js: text items (getTextContent) and font objects (commonObjs, fontExtraProperties).
// Arrays are sparse (a code with no entry is a hole); a standard font the PDF does not embed has its widths by code
// in an object.
export const PdfItem = z.object({
  str: z.string(),
  transform: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  width: z.number(),
  fontName: z.string(),
})
export const PdfFont = z.object({
  loadedName: z.string(),
  isType3Font: z.boolean(),
  defaultWidth: z.number(),
  widths: z.union([z.array(z.number().optional()), z.record(z.string(), z.number())]),
  toUnicode: z.object({ _map: z.array(z.string().optional()) }).optional(),
})
export type PdfItem = z.infer<typeof PdfItem>
export type PdfFont = z.infer<typeof PdfFont>

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
  const bare = (t: string): string => t.replace(/\s/g, '')
  const out: Record<string, number> = {}
  for (const r of runs) {
    const cx = r.box.x + r.box.w / 2
    // A tall word's box also holds the baselines of lines above it (Bannatyne's script under its name): the item
    // must print the word (pdf.js spaces out tracked letters: "R I C H"), the nearest baseline to its foot wins.
    const foot = r.box.y + r.box.h
    const item = items
      .filter(({ str, transform: [a, b, c, , x, y], width }) => {
        const [left, base] = [x - view[0], view[3] - y]
        const inside = cx >= left && cx <= left + width && base >= r.box.y && base <= foot
        return a > 0 && b === 0 && c === 0 && inside && bare(str).includes(bare(r.str))
      })
      .sort((p, q) => Math.abs(foot - view[3] + p.transform[5]) - Math.abs(foot - view[3] + q.transform[5]))[0]
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
