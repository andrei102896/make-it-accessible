import { faceKey } from './face.ts'
import { webFont, type Drawn } from './ownfont.ts'
import { itemOf, type PdfFont, type PdfItem } from './pdfjs.ts'
import type { Run, RunFont } from './types.ts'

// Per printed face (faceKey), the program printing most of its letters, rebuilt for a browser to be measured
// (eval/facemetrics.ts; measuring asks no embedding permission). A face pdf.js cannot rebuild is absent.
export type PrintedFace = { font: RunFont; data: Uint8Array; range: string }

export function printedFaces(
  runs: readonly Run[],
  items: readonly PdfItem[],
  fonts: readonly PdfFont[],
  view: readonly [number, number, number, number],
  drawn: Drawn,
): Map<string, PrintedFace> {
  const byName = new Map(fonts.map((f) => [f.loadedName, f]))
  const built = new Map<string, { data: Uint8Array; range: string } | null>()
  const out = new Map<string, PrintedFace>()
  for (const [key, { font, name }] of mostPrinted(runs, items, view, new Set(byName.keys()))) {
    const pdfFont = byName.get(name)
    if (!pdfFont) continue
    if (!built.has(name)) built.set(name, webFont(pdfFont, drawn.get(name) ?? new Map()))
    const program = built.get(name)
    if (program) out.set(key, { font, ...program })
  }
  return out
}

// Per face key, the run font and the program (pdf.js loadedName among `names`) printing most of its letters:
// pdftohtml drops some weights from a name ("Oswald-Regular" and "-Light" are both "oswald:400").
export function mostPrinted(
  runs: readonly Run[],
  items: readonly PdfItem[],
  view: readonly [number, number, number, number],
  names: ReadonlySet<string>,
): Map<string, { font: RunFont; name: string }> {
  const letters = new Map<string, Map<string, number>>()
  const fontOf = new Map<string, RunFont>()
  for (const r of runs) {
    const item = r.font ? itemOf(r, items, view) : undefined
    if (!r.font || !item || !names.has(item.fontName)) continue
    const key = faceKey(r.font)
    fontOf.set(key, r.font)
    const tally = letters.get(key) ?? new Map<string, number>()
    tally.set(item.fontName, (tally.get(item.fontName) ?? 0) + r.str.length)
    letters.set(key, tally)
  }
  const out = new Map<string, { font: RunFont; name: string }>()
  for (const [key, tally] of letters) {
    const [name] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? []
    const font = fontOf.get(key)
    if (name !== undefined && font) out.set(key, { font, name })
  }
  return out
}
