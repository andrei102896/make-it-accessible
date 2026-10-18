import type { Grid } from '../pdf/backdrop.ts'
import type { Box } from '../pdf/types.ts'
import { contrast, fromHex, hex, luminance, readableOn, type Rgb } from './color.ts'

// MID: the luminance as far from black as from white in contrast terms.
const MID = 0.179
// A backdrop this even under a box (luminance spread) is flat: its ink can move instead of taking a halo.
const FLAT = 0.08

// What a placed text shows of its printed ink (placed.ts): its colour, opacity, and its printed shadow or outline.
export type Inked = {
  box: Box
  color: string | null
  alpha: number
  shadow: Grid['shadows'][string] | null
  stroke: Grid['strokes'][string] | null
}

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
  const raw = spot.color ?? '#000000'
  const { box } = spot
  const cells: number[] = []
  if (grid) {
    const [c0, c1] = [Math.floor(box.x / grid.cell), Math.floor((box.x + box.w) / grid.cell)]
    const [r0, r1] = [Math.floor(box.y / grid.cell), Math.floor((box.y + box.h) / grid.cell)]
    for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) cells.push(r * grid.cols + c)
  }
  if (!grid || !cells.length) return { color: raw, shadow: printed }
  const ground = average(cells.map((i) => fromHex(grid.mean[i] ?? '#ffffff')))
  const ink = blend(fromHex(raw), ground, spot.alpha)
  const lo = Math.min(...cells.map((i) => grid.min[i] ?? 0))
  const hi = Math.max(...cells.map((i) => grid.max[i] ?? 1))
  const l = luminance(ink)
  const ratio = (v: number): number => (Math.max(l, v) + 0.05) / (Math.min(l, v) + 0.05)
  // A printed outline or shadow round the letters is their edge: it carries their contrast when it stands out from
  // the ink or from the ground (WCAG 1.4.3 counts an outline as the text's boundary; La Segunda's red round yellow).
  const edge = spot.stroke?.color ?? spot.shadow?.color
  if (edge && Math.max(contrast(ink, fromHex(edge)), contrast(fromHex(edge), ground)) >= target)
    return { color: hex(ink), shadow: printed }
  if (Math.min(ratio(lo), ratio(hi)) >= target) return { color: hex(ink), shadow: printed }
  // readableOn darkens on a ground lighter than MID and lightens on a darker one: only where that keeps the ink's
  // side of its ground (Gigi's white title stays light, never turned dark on its olive band).
  const sameSide = l < luminance(ground) === luminance(ground) > MID
  const moved = hi - lo <= FLAT && sameSide ? readableOn(ink, ground, target) : null
  if (moved) return { color: hex(moved), shadow: printed }
  const glow = hex(readableOn(ground, ink, target) ?? (l < MID ? [255, 255, 255] : [0, 0, 0]))
  const halo = `0 0 .04em ${glow}, 0 0 .08em ${glow}, 0 0 .3em ${glow}`
  return { color: hex(ink), shadow: spot.shadow ? `${printed}, ${halo}` : halo }
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
