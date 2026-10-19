import { z } from 'zod'
import { hex, luminance } from '../html/color.ts'
import { copiesOf, holds, outline, zoneOf } from './copies.ts'
import { intersection, union } from './geometry.ts'
import type { Pixels } from './pixels.ts'
import { attr, colourOf, drawnElements, type Glyph, type Point } from './svg.ts'
import type { Box } from './types.ts'

// The printed page behind our own text (the printed view): the page's SVG without the words we place back, the light
// and colour under each spot, and how each placed word is printed (ink, opacity, its printed shadow).

// The light range is kept per cell of this many points.
export const CELL = 8
// backdrop.json's shape; a build writes it afresh before reading it, so an older file is never read.
export const BACKDROP_VERSION = 7
// A copy of the words further off than this share of their height is no shadow of theirs; nearer than MIN_OFFSET pt
// it is the same ink drawn twice.
const SHADOW_REACH = 0.5
const MIN_OFFSET = 0.3
// A word tilted by this much (rise over run of its glyph origins, ~1.7°) is set at an angle, not on the line.
const TILT = 0.03
// Its glyph origins lie on one straight line within this (pt): a raised letter ("1st") or a swash is no tilt.
const ON_LINE = 0.5
// A baseline lies below this share of its word's box (ascent above it); higher is the line above's.
const BASELINE_FLOOR = 0.3
// Boxes up to this ratio of the shortest one's height are words of one line; a taller one is a script over them.
const SAME_LINE = 1.2
// A letter and its copy drawn on one spot start this close (pt; Kenny & Ziggy's 0.02); another line's glyph is further
// off (Moosewood's 0.49).
const ONE_SPOT = 0.05
// A copy glyph sits at its letter's offset within this (pt); two inks this close (sum over RGB, 0–255) are one ink.
const SAME_SPOT = 0.5
const SAME_INK = 48
export const sameInk = (a: string, b: string | null): boolean =>
  b !== null &&
  [1, 3, 5].reduce((sum, i) => sum + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0) <=
    SAME_INK
// A glyph's origin sits on its word's left edge; the next word's first glyph sits on this word's right edge.
const EDGE = 0.5

const Hex = z.string().regex(/^#[0-9a-f]{6}$/)
const Shadow = z.object({ color: Hex, dx: z.number(), dy: z.number() }).strict()
// A face id is its family and file name; its range goes into CSS: both from our own bytes, checked all the same.
const FaceId = z.string().regex(/^pdf-[0-9a-f]+$/)
const RANGE = /^U\+[0-9A-F]+(-[0-9A-F]+)?(, U\+[0-9A-F]+(-[0-9A-F]+)?)*$/
// `lower`: the size scale giving the lookalike the printed x-height; `caps`: the printed cap height; a line blends
// them by its share of lowercase letters (placed.ts). `weight`: the lookalike weight with the printed stem.
const FaceMetrics = z
  .object({
    lower: z.number().positive().nullable(),
    caps: z.number().positive().nullable(),
    weight: z.number().int().positive(),
  })
  .strict()
export type FaceMetrics = z.infer<typeof FaceMetrics>
const Stroke = z.object({ color: Hex, width: z.number().positive() }).strict()
// pNN/backdrop.json: per cell (row by row) the darkest and lightest relative luminance and the mean colour; per
// placed word its drawn ink and opacity, its printed shadow, and whether it is drawn at all (printedOf).
const Grid = z
  .object({
    version: z.literal(BACKDROP_VERSION),
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
    // Per placed word its printed baseline (pt from the page's top): its first letter's origin.
    baselines: z.record(z.string(), z.number()),
    // Words the backdrop keeps as printed and ours only read: set at an angle, or in a hand we cannot draw
    // (keptRuns, eval: a script face neither embeddable nor stood in for; Fig's stamp and signature).
    kept: z.array(z.string()),
    // Per placed word its printed letter spacing in ems (pdf/tracking.ts), where tracked.
    tracking: z.record(z.string(), z.number()),
    // Per placed word the PDF's own face it is printed in, and per face the letters it draws and its maker's
    // notice (pdf/ownfont.ts); its file is fonts/<face>.otf beside the page.
    faces: z.record(z.string(), FaceId),
    fonts: z.record(FaceId, z.object({ range: z.string().regex(RANGE), notice: z.string() }).strict()),
    // Per printed face (pdf/face.ts faceKey) set in a lookalike: its size scales and weight (eval/facemetrics.ts).
    metrics: z.record(z.string(), FaceMetrics),
    // Printed faces whose lowercase glyphs are capitals (Howies' Lulo Clean): the layer's "dinner menu" prints
    // DINNER MENU, and so does ours.
    capsFaces: z.array(z.string()),
  })
  .strict()
export type Grid = z.infer<typeof Grid>
export type Printed = Pick<Grid, 'inks' | 'alpha' | 'shadows' | 'strokes' | 'undrawn' | 'baselines'>
export const parseGrid = (json: string): Grid => Grid.parse(JSON.parse(json))

type Word = { id: string; box: Box }
// The page's SVG without the glyphs of `placed` words and the copies drawn round or under them; `unplaced` words,
// boxes, rules and pictures stay. A glyph on an unplaced word's baseline is that word's, even inside a placed zone.
export function backdropSvg(svg: string, placed: readonly Box[], unplaced: readonly Box[] = []): string {
  const zones = placed.map(zoneOf)
  const ownedBy = (boxes: readonly Box[], at: Point): boolean =>
    boxes.some((b) =>
      holds({ x: b.x - EDGE, y: b.y + b.h * BASELINE_FLOOR, w: b.w, h: b.h * (1 - BASELINE_FLOOR) }, at),
    )
  const glyphs = drawnElements(svg).glyphs
  const cuts = (g: Glyph): boolean =>
    zones.some((z) => holds(z, g.at)) && (ownedBy(placed, g.at) || !ownedBy(unplaced, g.at))
  // A glyph drawn through a reused definition is one range for every instance: cut only when all of them go.
  const mixed = new Set(instancesOf(glyphs).flatMap(([key, all]) => (all.every(cuts) || !all.some(cuts) ? [] : [key])))
  const cut = [
    ...glyphs.filter((g) => cuts(g) && !mixed.has(g.range.join())).map((g) => g.range),
    ...copiesOf(svg, placed).map((d) => d.range),
  ]
  const starts = [...new Map(cut.map((r) => [r[0], r])).values()].sort((a, b) => b[0] - a[0])
  return starts.reduce((out, [from, to]) => out.slice(0, from) + out.slice(to), svg)
}

// Glyph instances by their range in the SVG text (instances of one reused definition share it).
const instancesOf = (glyphs: readonly Glyph[]): [string, Glyph[]][] => {
  const by = new Map<string, Glyph[]>()
  for (const g of glyphs) by.set(g.range.join(), [...(by.get(g.range.join()) ?? []), g])
  return [...by].filter(([, all]) => all.length > 1)
}

// The placed words holding an instance of a reused glyph that is also drawn outside every placed zone: its range
// cannot be cut for one instance alone, so the word stays printed (eval/backdrop.ts) rather than show twice.
export function sharedGlyphWords(svg: string, placed: readonly Box[]): number[] {
  const zones = placed.map(zoneOf)
  const out = new Set<number>()
  for (const [, all] of instancesOf(drawnElements(svg).glyphs)) {
    const inside = all.map((g) => zones.findIndex((z) => holds(z, g.at)))
    if (inside.some((i) => i < 0)) for (const i of inside) if (i >= 0) out.add(i)
  }
  return [...out]
}

const round = (v: number): number => Math.round(v * 100) / 100
const near = (dx: number, dy: number, h: number): boolean =>
  Math.hypot(dx, dy) >= MIN_OFFSET && Math.abs(dx) <= h * SHADOW_REACH && Math.abs(dy) <= h * SHADOW_REACH

// How each placed word is printed: ink, opacity and baseline from its first letter; glyphs in another ink a little
// offset, or a letter-shaped fill under it, are its shadow; with no glyph it is inside a picture (Stone House's cover).
export function printedOf(svg: string, words: readonly Word[]): Printed {
  // pdftocairo draws glyph uses in a group with their fill.
  const glyphs = drawnElements(svg).glyphs.map((g) => {
    const open = svg.lastIndexOf('<g ', g.range[0])
    const between = svg.slice(open, g.range[0])
    return { ...g, fill: open >= 0 && !between.includes('</g>') ? colourOf(attr(between, 'fill')) : null }
  })
  const out: Printed = { inks: {}, alpha: {}, shadows: {}, strokes: {}, undrawn: [], baselines: {} }
  // A word's own glyphs: origins in the lower part of its box, as its top reaches the line above's baseline (Kenny &
  // Ziggy's tight lines). Another word's glyph is never its ink or copy (Ferrara's black asterisks by the red SYRUPS).
  const boxes = words.map(({ box: b }) => ({
    x: b.x - EDGE,
    y: b.y + b.h * BASELINE_FLOOR,
    w: b.w,
    h: b.h * (1 - BASELINE_FLOOR),
  }))
  // Boxes overlap: a glyph belongs to the word of its line starting last before it (Kenny & Ziggy's letter-by-letter
  // titles), never to a script's tall box over that line (Moosewood's entrees over its burger).
  const owner = glyphs.map((g) => {
    const held = boxes.flatMap((b, k) => (holds(b, g.at) ? [{ k, b }] : []))
    const shortest = Math.min(...held.map(({ b }) => b.h))
    return held.filter(({ b }) => b.h <= shortest * SAME_LINE).sort((p, q) => q.b.x - p.b.x)[0]?.k ?? -1
  })
  for (const [i, { id, box }] of words.entries()) {
    const zone = zoneOf(box)
    const around = glyphs.flatMap((g, k) => (holds(zone, g.at) ? [{ ...g, owner: owner[k] ?? -1 }] : []))
    const mine = around.filter((g) => g.owner === i)
    // Its first letter: the glyph nearest its left edge, drawn last on that spot (the ink over its copy, not a space
    // drawn after it: Kenny & Ziggy's gold "&"); a glyph of the line under a tall box is not on it (Moosewood's soups).
    const lead = (g: { at: Point }): number => Math.abs(g.at[0] - box.x)
    const nearest = Math.min(...mine.map(lead))
    const foot = mine.filter((g) => lead(g) <= nearest + ONE_SPOT).at(-1)
    const letter = foot ?? around.at(-1)
    if (!letter) {
      out.undrawn.push(id)
      continue
    }
    if (letter.fill) out.inks[id] = letter.fill
    if (letter.alpha < 1) out.alpha[id] = Math.round(letter.alpha * 1000) / 1000
    if (foot) out.baselines[id] = round(foot.at[1])
    // Each copy glyph against its nearest inked glyph: on tight lines the zone also holds the next line's glyphs, so
    // a mean over the zone drifts by a line (Kenny & Ziggy's paragraph doubled one line down).
    const inked = mine.filter((g) => g.fill === letter.fill).map((g) => g.at)
    const other = around.filter((g) => g.fill !== null && g.fill !== letter.fill && (g.owner === -1 || g.owner === i))
    const color = other[0]?.fill
    if (!color) continue
    const pairs = other.flatMap(({ at: [x, y] }) => {
      const [nx, ny] = [...inked].sort(
        (a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y),
      )[0] ?? [x, y]
      return near(x - nx, y - ny, box.h) ? [[x - nx, y - ny] as const] : []
    })
    const mid = (vs: number[]): number => vs.sort((a, b) => a - b)[Math.floor(vs.length / 2)] ?? 0
    const [dx, dy] = [mid(pairs.map((p) => p[0])), mid(pairs.map((p) => p[1]))]
    // A shadow redraws the word letter by letter at one offset, at least two of them and most, in an ink that
    // shows: a neighbour's glyph on the line, or the same ink drawn twice, is none (Almond, Osteria, Moosewood).
    const copied = inked.filter(([x, y]) =>
      other.some((g) => Math.abs(g.at[0] - x - dx) <= SAME_SPOT && Math.abs(g.at[1] - y - dy) <= SAME_SPOT),
    ).length
    if (copied >= 2 && copied * 2 >= inked.length && pairs.length * 2 >= other.length && !sameInk(color, letter.fill))
      out.shadows[id] = { color, dx: round(dx), dy: round(dy) }
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

// The words printed at an angle (Fig's rubber stamp): their glyph origins, two or more, rise or fall along one line.
export function tiltedOf(svg: string, words: readonly Word[]): Set<string> {
  const glyphs = drawnElements(svg).glyphs
  const out = new Set<string>()
  for (const { id, box } of words) {
    const own = glyphs.filter(
      ({ at: [x, y] }) => x >= box.x - EDGE && x < box.x + box.w && y >= box.y && y <= box.y + box.h,
    )
    const [first, last] = [own[0]?.at, own.at(-1)?.at]
    if (!first || !last || own.length < 2 || last[0] - first[0] <= 0) continue
    const slope = (last[1] - first[1]) / (last[0] - first[0])
    const straight = own.every(({ at: [x, y] }) => Math.abs(first[1] + (x - first[0]) * slope - y) <= ON_LINE)
    if (straight && Math.abs(slope) >= TILT) out.add(id)
  }
  return out
}
