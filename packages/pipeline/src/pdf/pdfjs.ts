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
  return items
    .filter(({ str, transform: [a, b, c, , x, y], width }) => {
      const [left, base] = [x - view[0], view[3] - y]
      const inside = cx >= left && cx <= left + width && base >= r.box.y && base <= foot
      return a > 0 && b === 0 && c === 0 && inside && bare(str).includes(bare(r.str))
    })
    .sort((p, q) => Math.abs(foot - view[3] + p.transform[5]) - Math.abs(foot - view[3] + q.transform[5]))[0]
}
