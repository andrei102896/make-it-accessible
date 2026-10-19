import { sameInk, type Grid } from '../pdf/backdrop.ts'
import type { Box, Run } from '../pdf/types.ts'
import { contrast, fromHex, hex, luminance, type Rgb } from './color.ts'
import { unionOf } from './profile.ts'
import type { HtmlPage } from './types.ts'

// A backdrop this even under a box (spread of its cells' mean luminance) is flat: its ink stays as printed with no
// halo, unless the box's extremes are further apart than a hairline or a panel's edge makes them.
const FLAT = 0.08
const EDGE = 0.35
// The letters' bodies sit in the middle of a word's box: a cell counts when at least half of it lies within the
// box inset by this share of its height top and bottom (BOOK NOW's row touching its QR code above does not).
const INSET = 0.25

// What a placed text shows of its printed ink (placed.ts): its colour, opacity, and its printed shadow or outline.
export type Inked = {
  box: Box
  color: string | null
  alpha: number
  shadow: Grid['shadows'][string] | null
  stroke: Grid['strokes'][string] | null
}
// Words of a placed text printed in another brand ink (`cls`, their `.ink-` span): as drawn, under their own box.
export type Inline = { cls: string; color: string; alpha: number; box: Box }

// The printed ink where it reads on the backdrop under its box, blended at its printed opacity over the backdrop's
// colour there. Its printed shadow is drawn as printed and carries the contrast when it reaches the target; else on
// a flat backdrop the ink moves in lightness, keeping its hue; else a halo in the backdrop's own hue moved to the
// target, dense at the letters (one wide blur covers a thin stroke's edge only a fifth of the way).
export function inkOn(
  spot: Inked,
  grid: Grid | null,
  target: number,
  u: (v: number) => string,
): { color: string; shadow: string } {
  const printed = spot.shadow
    ? `calc(${u(spot.shadow.dx)} * 1cqw) calc(${u(spot.shadow.dy)} * 1cqw) 0 ${spot.shadow.color}`
    : 'none'
  const m = measured(spot, grid)
  if (!m) return { color: spot.color ?? '#000000', shadow: printed }
  const { ink, ground } = m
  if (reads(spot, m, target)) return { color: hex(ink), shadow: printed }
  // On a flat ground the printed ink stays as printed, however faint (Andrei, 2026-10-18: Howies' gold prices
  // darkened to brown read as the wrong colour); the text view is the conforming version. Elsewhere a halo.
  if (isFlat(m)) return { color: hex(ink), shadow: printed }
  // The halo covers the busy ground in the ground's own colour: one moved to a contrast target turns dark round a
  // gold or grey word on a white page and reads as a smear (Howies' "Vegan", 2026-10-19).
  const glow = hex(ground)
  const halo = `0 0 .04em ${glow}, 0 0 .08em ${glow}, 0 0 .3em ${glow}`
  return { color: hex(ink), shadow: spot.shadow ? `${printed}, ${halo}` : halo }
}

// A word's own brand ink as printed, where it reads under its box by the test its line passes as printed; else null
// and it keeps its line's colour (never moved or haloed on its own).
export function inlineInk(spot: Inked, grid: Grid | null, target: number): string | null {
  const m = measured(spot, grid)
  return m && (reads(spot, m, target) || isFlat(m)) ? hex(m.ink) : null
}

// A ground this even keeps the printed ink as printed (Andrei, 2026-10-18), for a line and for a word in it alike.
const isFlat = ({ lo, hi, spread }: Measured): boolean => spread <= FLAT && hi - lo <= EDGE

type Measured = { ink: Rgb; ground: Rgb; lo: number; hi: number; spread: number }
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
  const means = cells.map((i) => luminance(fromHex(grid.mean[i] ?? '#ffffff')))
  return { ink, ground, lo, hi, spread: Math.max(...means) - Math.min(...means) }
}
// A printed outline or shadow round the letters is their edge: it carries their contrast when it stands out from the
// ink or from the ground (WCAG 1.4.3 counts an outline as the text's boundary; La Segunda's red round yellow).
function reads(spot: Inked, { ink, ground, lo, hi }: Measured, target: number): boolean {
  const edge = spot.stroke?.color ?? spot.shadow?.color
  if (edge && Math.max(contrast(ink, fromHex(edge)), contrast(fromHex(edge), ground)) >= target) return true
  const l = luminance(ink)
  const ratio = (v: number): number => (Math.max(l, v) + 0.05) / (Math.min(l, v) + 0.05)
  return Math.min(ratio(lo), ratio(hi)) >= target
}

// A placed text's words in a brand ink other than its line's, each ink with its letters' drawn colour and box.
export function inlinesOf(
  runs: readonly Run[],
  drawn: Pick<Grid, 'inks' | 'alpha'>,
  inks: ReadonlySet<string>,
  line: string | null,
): Inline[] {
  const marked = Map.groupBy(
    runs.filter((r) => r.color !== undefined && inks.has(r.color)),
    (r) => r.color ?? '',
  )
  return [...marked].flatMap(([cls, words]) => {
    const color = mostOf(words, (r) => drawn.inks[r.id] ?? cls) ?? cls
    const box = unionOf(words)
    if (!box || sameInk(color, line)) return []
    return [{ cls, color, alpha: mostOf(words, (r) => drawn.alpha[r.id] ?? 1) ?? 1, box }]
  })
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

// The value most of the words' letters show.
function mostOf<T>(words: readonly Run[], value: (r: Run) => T): T | undefined {
  const tally = new Map<T, number>()
  for (const r of words) tally.set(value(r), (tally.get(value(r)) ?? 0) + r.str.length)
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0]
}
const average = (cs: readonly Rgb[]): Rgb => {
  const of = (k: 0 | 1 | 2): number => cs.reduce((s, c) => s + c[k], 0) / Math.max(1, cs.length)
  return [of(0), of(1), of(2)]
}
const blend = (c: Rgb, under: Rgb, alpha: number): Rgb => [
  c[0] * alpha + under[0] * (1 - alpha),
  c[1] * alpha + under[1] * (1 - alpha),
  c[2] * alpha + under[2] * (1 - alpha),
]
