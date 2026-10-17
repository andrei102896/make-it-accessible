import { z } from 'zod'
import { luminance } from '../html/color.ts'
import { COVERED } from './art.ts'
import { area, intersection } from './geometry.ts'
import type { Pixels } from './pixels.ts'
import { attr, boxOf, colourOf, drawnElements, type Drawn, type Point } from './svg.ts'
import type { Box } from './types.ts'
import { parseVectors } from './vectors.ts'

// The printed page behind our own text (the printed view): the page's SVG without the words we place back, and the
// light range under each spot so placed text can be made readable on it.

// A glyph or a shape this close to a placed word belongs to it, as a share of the word's height: glyph origins sit
// on the baseline, a drop shadow drawn as paths a point or two off.
const PAD = 0.25
// The light range is kept per cell of this many points.
export const CELL = 8

// pNN/backdrop.json: each cell's darkest and lightest relative luminance, row by row.
const Grid = z
  .object({
    version: z.literal(1),
    cell: z.number().positive(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    min: z.array(z.number()),
    max: z.array(z.number()),
    // Each placed word's ink as drawn (inksOf); the text layer's colour misses a fill drawn over a shadow.
    inks: z.record(z.string(), z.string().regex(/^#[0-9a-f]{6}$/)),
  })
  .strict()
export type Grid = z.infer<typeof Grid>
export const parseGrid = (json: string): Grid => Grid.parse(JSON.parse(json))

// The page's SVG without the glyphs of `words` (the runs our text stands in for) and without the outlines drawn
// round them (Kenny & Ziggy's lines); words we do not place stay printed, and so do fills, rules and pictures.
export function backdropSvg(svg: string, words: readonly Box[]): string {
  const zones = words.map((b) => {
    const p = b.h * PAD
    return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p }
  })
  const holds = (z: Box, [x, y]: Point): boolean => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
  const redrawn = (b: Box): boolean => {
    const near = zones.filter((z) => intersection(z, b) > 0)
    if (!near.length) return false
    const hull = boxOf(
      near.flatMap((z): Point[] => [
        [z.x, z.y],
        [z.x + z.w, z.y + z.h],
      ]),
    )
    const covered = words.reduce((sum, w) => sum + intersection(w, b), 0)
    return holds(hull, [b.x, b.y]) && holds(hull, [b.x + b.w, b.y + b.h]) && covered >= area(b) * COVERED
  }
  const cut = [
    ...drawnElements(svg)
      .glyphs.filter((g) => zones.some((z) => holds(z, g.at)))
      .map((g) => g.range),
    ...parseVectors(svg)
      .art.filter((d) => d.bound && outline(d) && !plainBox(d) && redrawn(d.bound))
      .map((d) => d.range),
  ]
  const starts = [...new Map(cut.map((r) => [r[0], r])).values()].sort((a, b) => b[0] - a[0])
  return starts.reduce((out, [from, to]) => out.slice(0, from) + out.slice(to), svg)
}

// Only a stroked outline round the words goes: it fits the printed letters, not ours. A fill stays, whatever its
// shape (a strip, a box, a shadow): it is the words' own ground (Boater's cream strips, Gigi's white box).
const outline = ({ tag }: Drawn): boolean => attr(tag, 'fill') === 'none' && attr(tag, 'stroke') !== null
// A box drawn behind words (Gigi's white strips under its cover lines) stays: words redrawn are letter shapes.
const plainBox = ({ subpaths: [only, ...more] }: Drawn): boolean => {
  if (more.length || !only || only.curved) return false
  const b = boxOf(only.points)
  const on = (v: number, a: number, c: number): boolean => Math.abs(v - a) <= 0.5 || Math.abs(v - c) <= 0.5
  return only.points.every(([x, y]) => on(x, b.x, b.x + b.w) && on(y, b.y, b.y + b.h))
}

// Each word's ink: the fill of the last glyph drawn in its box (Kenny & Ziggy's yellow over its black shadow).
// pdftocairo draws glyph uses in a group that holds their fill.
export function inksOf(svg: string, words: readonly { id: string; box: Box }[]): Record<string, string> {
  const fills = drawnElements(svg).glyphs.flatMap((g) => {
    const open = svg.lastIndexOf('<g ', g.range[0])
    const between = svg.slice(open, g.range[0])
    const fill = open >= 0 && !between.includes('</g>') ? colourOf(attr(between, 'fill')) : null
    return fill ? [{ at: g.at, fill }] : []
  })
  const out: Record<string, string> = {}
  for (const { id, box: b } of words) {
    const p = b.h * PAD
    const last = fills.findLast(
      ({ at: [x, y] }) => x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p,
    )
    if (last) out[id] = last.fill
  }
  return out
}

// Each CELL × CELL cell's darkest and lightest relative luminance, row by row, from pixels at one per point.
export function luminanceGrid(px: Pixels): Omit<Grid, 'version' | 'cell' | 'inks'> {
  const cols = Math.ceil(px.width / CELL)
  const rows = Math.ceil(px.height / CELL)
  const min = Array.from({ length: cols * rows }, () => 1)
  const max = Array.from({ length: cols * rows }, () => 0)
  for (let y = 0; y < px.height; y++)
    for (let x = 0; x < px.width; x++) {
      const i = Math.floor(y / CELL) * cols + Math.floor(x / CELL)
      const l = luminance(px.at(x, y))
      min[i] = Math.min(min[i] ?? 1, l)
      max[i] = Math.max(max[i] ?? 0, l)
    }
  const round = (v: number): number => Math.round(v * 1000) / 1000
  return { cols, rows, min: min.map(round), max: max.map(round) }
}
