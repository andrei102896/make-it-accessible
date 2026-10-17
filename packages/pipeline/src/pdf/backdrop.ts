import { z } from 'zod'
import { hex, luminance } from '../html/color.ts'
import { COVERED } from './art.ts'
import { area, intersection, union } from './geometry.ts'
import type { Pixels } from './pixels.ts'
import { attr, boxOf, colourOf, drawnElements, type Drawn, type Point } from './svg.ts'
import type { Box } from './types.ts'
import { parseVectors } from './vectors.ts'

// The printed page behind our own text (the printed view): the page's SVG without the words we place back, the light
// and colour under each spot, and how each placed word is printed (ink, opacity, its printed shadow).

// A glyph or a shape this close to a placed word belongs to it, as a share of the word's height: glyph origins sit
// on the baseline, a drop shadow drawn as paths a point or two off.
const PAD = 0.25
// The light range is kept per cell of this many points.
export const CELL = 8
// A copy of the words further off than this share of their height is no shadow of theirs; nearer than MIN_OFFSET pt
// it is the same ink drawn twice.
const SHADOW_REACH = 0.5
const MIN_OFFSET = 0.3

const Hex = z.string().regex(/^#[0-9a-f]{6}$/)
const Shadow = z.object({ color: Hex, dx: z.number(), dy: z.number() }).strict()
const Stroke = z.object({ color: Hex, width: z.number().positive() }).strict()
// pNN/backdrop.json: per cell (row by row) the darkest and lightest relative luminance and the mean colour; per
// placed word its drawn ink and opacity, its printed shadow, and whether it is drawn at all (printedOf).
const Grid = z
  .object({
    version: z.literal(2),
    cell: z.number().positive(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    min: z.array(z.number()),
    max: z.array(z.number()),
    mean: z.array(Hex),
    inks: z.record(z.string(), Hex),
    alpha: z.record(z.string(), z.number()),
    shadows: z.record(z.string(), Shadow),
    strokes: z.record(z.string(), Stroke),
    undrawn: z.array(z.string()),
  })
  .strict()
export type Grid = z.infer<typeof Grid>
export type Printed = Pick<Grid, 'inks' | 'alpha' | 'shadows' | 'strokes' | 'undrawn'>
export const parseGrid = (json: string): Grid => Grid.parse(JSON.parse(json))

type Word = { id: string; box: Box }
const zoneOf = (b: Box): Box => {
  const p = b.h * PAD
  return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p }
}
const holds = (z: Box, [x, y]: Point): boolean => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h

// The shapes that draw placed words again, fitted to the printed letters, not ours: an outline round them (Kenny &
// Ziggy's lines, La Segunda's red stroke round each yellow letter, its straight I's too) or a letter-shaped fill
// under them. A filled box behind words stays (Gigi's white strips, Boater's cream bands).
function copiesOf(svg: string, words: readonly Box[]): Drawn[] {
  const zones = words.map(zoneOf)
  const redrawn = (b: Box): boolean => {
    const near = zones.filter((z) => intersection(z, b) > 0)
    if (!near.length) return false
    const hull = near.reduce(union)
    const covered = words.reduce((sum, w) => sum + intersection(w, b), 0)
    return holds(hull, [b.x, b.y]) && holds(hull, [b.x + b.w, b.y + b.h]) && covered >= area(b) * COVERED
  }
  return parseVectors(svg).art.filter((d) => d.bound && (outline(d) || !plainBox(d)) && redrawn(d.bound))
}
const outline = ({ tag }: Drawn): boolean => attr(tag, 'fill') === 'none' && attr(tag, 'stroke') !== null
const plainBox = ({ subpaths: [only, ...more] }: Drawn): boolean => {
  if (more.length || !only || only.curved) return false
  const b = boxOf(only.points)
  const on = (v: number, a: number, c: number): boolean => Math.abs(v - a) <= 0.5 || Math.abs(v - c) <= 0.5
  return only.points.every(([x, y]) => on(x, b.x, b.x + b.w) && on(y, b.y, b.y + b.h))
}

// The page's SVG without the glyphs of `words` (the runs our text stands in for) and the copies drawn round or under
// them; words we do not place stay printed, and so do boxes, rules and pictures.
export function backdropSvg(svg: string, words: readonly Box[]): string {
  const zones = words.map(zoneOf)
  const cut = [
    ...drawnElements(svg)
      .glyphs.filter((g) => zones.some((z) => holds(z, g.at)))
      .map((g) => g.range),
    ...copiesOf(svg, words).map((d) => d.range),
  ]
  const starts = [...new Map(cut.map((r) => [r[0], r])).values()].sort((a, b) => b[0] - a[0])
  return starts.reduce((out, [from, to]) => out.slice(0, from) + out.slice(to), svg)
}

const round = (v: number): number => Math.round(v * 100) / 100
const near = (dx: number, dy: number, h: number): boolean =>
  Math.hypot(dx, dy) >= MIN_OFFSET && Math.abs(dx) <= h * SHADOW_REACH && Math.abs(dy) <= h * SHADOW_REACH

// How each placed word is printed. Its ink is the fill of the last glyph drawn in its box, at that glyph's opacity
// (Kenny & Ziggy's yellow over its black copy; Gigi's white at 84 %); glyphs in another fill a little offset, or a
// letter-shaped fill copy under it, are its printed shadow. A word with no glyph in its box is printed inside a
// picture under an invisible text layer (Stone House's cover). pdftocairo draws glyph uses in a group with their fill.
export function printedOf(svg: string, words: readonly Word[]): Printed {
  const glyphs = drawnElements(svg).glyphs.map((g) => {
    const open = svg.lastIndexOf('<g ', g.range[0])
    const between = svg.slice(open, g.range[0])
    return { ...g, fill: open >= 0 && !between.includes('</g>') ? colourOf(attr(between, 'fill')) : null }
  })
  const out: Printed = { inks: {}, alpha: {}, shadows: {}, strokes: {}, undrawn: [] }
  for (const { id, box } of words) {
    const zone = zoneOf(box)
    const own = glyphs.filter((g) => holds(zone, g.at))
    const last = own.at(-1)
    if (!last) {
      out.undrawn.push(id)
      continue
    }
    if (last.fill) out.inks[id] = last.fill
    if (last.alpha < 1) out.alpha[id] = Math.round(last.alpha * 1000) / 1000
    // Each copy glyph against its nearest inked glyph: on tight lines the zone also holds the next line's glyphs, so
    // a mean over the zone drifts by a line (Kenny & Ziggy's paragraph doubled one line down).
    const inked = own.filter((g) => g.fill === last.fill).map((g) => g.at)
    const other = own.filter((g) => g.fill !== null && g.fill !== last.fill)
    const color = other[0]?.fill
    if (!color) continue
    const pairs = other.flatMap(({ at: [x, y] }) => {
      const [nx, ny] = [...inked].sort(
        (a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y),
      )[0] ?? [x, y]
      return near(x - nx, y - ny, box.h) ? [[x - nx, y - ny] as const] : []
    })
    const mid = (vs: number[]): number => vs.sort((a, b) => a - b)[Math.floor(vs.length / 2)] ?? 0
    if (pairs.length * 2 >= other.length)
      out.shadows[id] = { color, dx: round(mid(pairs.map((p) => p[0]))), dy: round(mid(pairs.map((p) => p[1]))) }
  }
  for (const d of copiesOf(
    svg,
    words.map((w) => w.box),
  )) {
    const b = d.bound
    const covered = b ? words.filter((w) => intersection(w.box, b) > 0) : []
    const stroke = colourOf(attr(d.tag, 'stroke'))
    if (outline(d) && stroke && covered.length) {
      // The stroke's width across the line, through the matrix (vectors.ts reads rules the same way).
      const width = Number(attr(d.tag, 'stroke-width') ?? 1) * Math.hypot(d.m[0], d.m[1])
      for (const w of covered) out.strokes[w.id] ??= { color: stroke, width: round(width) }
      continue
    }
    const color = colourOf(attr(d.tag, 'fill'))
    if (!color || !b || !covered.length) continue
    const u = covered.map((w) => w.box).reduce(union)
    const [dx, dy] = [b.x + b.w / 2 - (u.x + u.w / 2), b.y + b.h / 2 - (u.y + u.h / 2)]
    if (!near(dx, dy, u.h)) continue
    for (const w of covered) out.shadows[w.id] ??= { color, dx: round(dx), dy: round(dy) }
  }
  return out
}

// Each CELL × CELL cell's darkest and lightest relative luminance and its mean colour, row by row, from pixels at
// one per point.
export function luminanceGrid(px: Pixels): Pick<Grid, 'cols' | 'rows' | 'min' | 'max' | 'mean'> {
  const cols = Math.ceil(px.width / CELL)
  const rows = Math.ceil(px.height / CELL)
  const min = Array.from({ length: cols * rows }, () => 1)
  const max = Array.from({ length: cols * rows }, () => 0)
  const sums = Array.from({ length: cols * rows }, () => ({ r: 0, g: 0, b: 0, n: 0 }))
  for (let y = 0; y < px.height; y++)
    for (let x = 0; x < px.width; x++) {
      const i = Math.floor(y / CELL) * cols + Math.floor(x / CELL)
      const c = px.at(x, y)
      const l = luminance(c)
      min[i] = Math.min(min[i] ?? 1, l)
      max[i] = Math.max(max[i] ?? 0, l)
      const s = sums[i]
      if (s) {
        s.r += c[0]
        s.g += c[1]
        s.b += c[2]
        s.n += 1
      }
    }
  const r3 = (v: number): number => Math.round(v * 1000) / 1000
  const colours = sums.map((s) => hex([s.r / Math.max(1, s.n), s.g / Math.max(1, s.n), s.b / Math.max(1, s.n)]))
  return { cols, rows, min: min.map(r3), max: max.map(r3), mean: colours }
}
