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
