import { z } from 'zod'
import type { Run } from './types.ts'

// What the pipeline reads of pdf.js (eval reads the PDF with it): text items (getTextContent) and font objects
// (commonObjs, fontExtraProperties), parsed at the boundary.

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
  // The PostScript name as embedded (subset prefix kept), the program pdf.js rebuilt for a browser, and its map
  // from the PDF's character codes to the codes of that program's own cmap.
  name: z.string().optional(),
  data: z.instanceof(Uint8Array).optional(),
  toFontChar: z.array(z.number().optional()).optional(),
  missingFile: z.boolean().optional(),
})
export type PdfItem = z.infer<typeof PdfItem>
export type PdfFont = z.infer<typeof PdfFont>

// A forward shear (c/d) past this slants the print: an italic leans 8–20°; the set's sheared items lean 0.14–0.35
// (Carmine's DINPro 0.18, Gargiulo's Garamond 0.33), level ones 0.
const SLANT = 0.1
const LEVEL = 1e-6
// Items on one baseline within this (pt) of each other.
const SAME_BASELINE = 0.5

// The runs whose print leans: on the baseline nearest a run's foot, items sheared forward (b = 0, a, d > 0) cover more
// of its width than level ones; back slants, mirrored and rotated items are not italic.
export function slanted(
  runs: readonly Run[],
  items: readonly PdfItem[],
  view: readonly [number, number, number, number],
): Set<string> {
  // pdf.js' end-of-line items are empty and zero-wide: they would set the nearest baseline.
  const upright = items.filter(
    ({ str, width, transform: [a, b, , d] }) => str.trim() && width > 0 && a > 0 && d > 0 && Math.abs(b) < LEVEL,
  )
  const lean = ({ transform: [, , c, d] }: PdfItem): boolean => c / d >= SLANT
  const flat = ({ transform: [, , c] }: PdfItem): boolean => Math.abs(c) < LEVEL
  const out = new Set<string>()
  for (const r of runs) {
    if (!r.str.trim()) continue
    const foot = r.box.y + r.box.h
    const onRun = upright.filter((i) => {
      const y = view[3] - i.transform[5]
      const left = i.transform[4] - view[0]
      return y >= r.box.y && y <= foot && left < r.box.x + r.box.w && left + i.width > r.box.x
    })
    const nearest = Math.min(...onRun.map((i) => Math.abs(foot - view[3] + i.transform[5])))
    const line = onRun.filter((i) => Math.abs(Math.abs(foot - view[3] + i.transform[5]) - nearest) <= SAME_BASELINE)
    const covered = (kind: (i: PdfItem) => boolean): number =>
      coverage(
        line.filter(kind).map((i) => [i.transform[4] - view[0], i.transform[4] - view[0] + i.width] as const),
        r.box.x,
        r.box.x + r.box.w,
      )
    const leaning = covered(lean)
    if (leaning > 0 && leaning > covered(flat)) out.add(r.id)
  }
  return out
}

// The length of [from, to] the spans cover, overlaps counted once.
function coverage(spans: readonly (readonly [number, number])[], from: number, to: number): number {
  let total = 0
  let end = from
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    const [lo, hi] = [Math.max(a, end), Math.min(b, to)]
    if (hi > lo) total += hi - lo
    end = Math.max(end, Math.min(b, to))
  }
  return total
}

// The horizontal text item that prints a run: its span holds the run's centre on its baseline (`view`: the page's
// box). A tall word's box also holds the baselines of lines above it (Bannatyne's script under its name): the item
// must print the word (pdf.js spaces out tracked letters: "R I C H"), the nearest baseline to its foot wins.
export function itemOf(
  r: Run,
  items: readonly PdfItem[],
  view: readonly [number, number, number, number],
): PdfItem | undefined {
  const bare = (t: string): string => t.replace(/\s/g, '')
  const cx = r.box.x + r.box.w / 2
  const foot = r.box.y + r.box.h
  const level = ({ transform: [a, b, c] }: PdfItem): boolean => a > 0 && b === 0 && c === 0
  const onLine = ({ transform: [, , , , , y] }: PdfItem): boolean => view[3] - y >= r.box.y && view[3] - y <= foot
  const found = items
    .filter((i) => {
      const left = i.transform[4] - view[0]
      return level(i) && onLine(i) && cx >= left && cx <= left + i.width && bare(i.str).includes(bare(r.str))
    })
    .sort((p, q) => Math.abs(foot - view[3] + p.transform[5]) - Math.abs(foot - view[3] + q.transform[5]))[0]
  if (found || !r.restored) return found
  // A word sewn with its dropped ligature (pdf/ligatures.ts: "Pance" + "tta") is printed by no one item: the
  // overlapping item sharing most of its letters (its start or end) prints it.
  const word = bare(r.str)
  const shared = (s: string): number =>
    Array.from({ length: word.length }, (_, k) => k + 1).reduce(
      (most, k) => (s.startsWith(word.slice(-k)) || s.endsWith(word.slice(0, k)) ? k : most),
      0,
    )
  return items
    .filter((i) => {
      const left = i.transform[4] - view[0]
      return level(i) && onLine(i) && left < r.box.x + r.box.w && left + i.width > r.box.x && shared(bare(i.str)) > 0
    })
    .sort((p, q) => shared(bare(q.str)) - shared(bare(p.str)))[0]
}
