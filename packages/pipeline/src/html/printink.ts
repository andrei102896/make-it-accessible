import { sameInk, type Grid } from '../pdf/backdrop.ts'
import type { Box } from '../pdf/types.ts'
import { average, contrast, fromHex, luminance, type Rgb } from './color.ts'
import type { HtmlPage } from './types.ts'

// The letters' bodies sit in the middle of a word's box: a cell counts when at least half of it lies within the
// box inset by this share of its height top and bottom (BOOK NOW's row touching its QR code above does not).
const INSET = 0.25

// What a placed text shows of its printed ink (placed.ts): its colour, opacity, and its printed shadow or outline.
type Inked = {
  box: Box
  color: string | null
  alpha: number
  shadow: Grid['shadows'][string] | null
  stroke: Grid['strokes'][string] | null
}
type Measured = { ink: Rgb; ground: Rgb; lo: number; hi: number }
function measured(spot: Inked, grid: Grid | null): Measured | null {
  const { box } = spot
  const cells: number[] = []
  if (grid) {
    const [c0, c1] = [Math.floor(box.x / grid.cell), Math.floor((box.x + box.w) / grid.cell)]
    const [top, bottom] = [box.y + box.h * INSET, box.y + box.h * (1 - INSET)]
    const [r0, r1] = [Math.floor(top / grid.cell), Math.floor(bottom / grid.cell)]
    const within = (r: number): number => Math.min(bottom, (r + 1) * grid.cell) - Math.max(top, r * grid.cell)
    const rows = []
    for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++)
      if (within(r) >= Math.min(grid.cell, bottom - top) / 2) rows.push(r)
    for (const r of rows.length ? rows : [Math.min(grid.rows - 1, Math.floor((top + bottom) / 2 / grid.cell))])
      for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) cells.push(r * grid.cols + c)
  }
  if (!grid || !cells.length) return null
  const ground = average(cells.map((i) => fromHex(grid.mean[i] ?? '#ffffff')))
  const ink = blend(fromHex(spot.color ?? '#000000'), ground, spot.alpha)
  const lo = Math.min(...cells.map((i) => grid.min[i] ?? 0))
  const hi = Math.max(...cells.map((i) => grid.max[i] ?? 1))
  return { ink, ground, lo, hi }
}
// A printed outline or shadow round the letters is their edge: it carries their contrast when it stands out from the
// ink or from the ground (WCAG 1.4.3 counts an outline as the text's boundary; La Segunda's red round yellow).
const edged = (spot: Inked, { ink, ground }: Measured, target: number): boolean => {
  const edge = spot.stroke?.color ?? spot.shadow?.color
  return !!edge && Math.max(contrast(ink, fromHex(edge)), contrast(fromHex(edge), ground)) >= target
}

// Whether the printed ink reads on its ground as the print shows it (the printed view, uncorrected): the cells under
// it hold its own letters too (the backdrop keeps them), so its ground is their extreme farthest from the ink.
export function printedReads(spot: Inked, grid: Grid | null, target: number): boolean | null {
  const m = measured(spot, grid)
  if (!m) return null
  if (edged(spot, m, target)) return true
  const l = luminance(m.ink)
  const ratio = (v: number): number => (Math.max(l, v) + 0.05) / (Math.min(l, v) + 0.05)
  return Math.max(ratio(m.lo), ratio(m.hi)) >= target
}

// The page with each word's colour as drawn, named by the brand ink it matches: the text layer can put a colour on
// the wrong letters (Kenny & Ziggy's orange on C and P, its gold "&" dark), and `.ink-` spans follow these colours.
export function asDrawn(page: HtmlPage, inks: ReadonlySet<string>): HtmlPage {
  const drawn = page.backdrop?.grid.inks
  if (!drawn) return page
  const runs = page.extraction.runs.map((r) => {
    const ink = drawn[r.id]
    const agrees = ink === undefined || sameInk(ink, r.color ?? null)
    const color = agrees ? r.color : ([...inks].find((b) => sameInk(b, ink)) ?? ink)
    return color === r.color ? r : { ...r, color }
  })
  return { ...page, extraction: { ...page.extraction, runs } }
}

const blend = (c: Rgb, under: Rgb, alpha: number): Rgb => [
  c[0] * alpha + under[0] * (1 - alpha),
  c[1] * alpha + under[1] * (1 - alpha),
  c[2] * alpha + under[2] * (1 - alpha),
]
