import { contrast, fromHex } from '../html/color.ts'
import {
  attr,
  boxOf,
  colourOf,
  drawnElements,
  OPAQUE,
  type Drawn,
  type Glyph,
  type Matrix,
  type Placed,
  type Point,
  type Subpath,
} from './svg.ts'
import type { Box, Rule, Vector } from './types.ts'

// The PDF's drawn geometry as pdftocairo writes it to SVG: frames (stroked rectangles, or filled rings), panels
// (filled rectangles) and rules (straight lines), in PDF points. Text (glyph <use>s) and pictures are not read here.

// A frame or panel smaller than this (points) is a glyph or a bullet, not a box round text.
const MIN_W = 24
const MIN_H = 12
// A point within this distance (points) of the box's edge lies on it; Rucola's cut corners sit 1 pt inside.
const EDGE = 1.5
// Two frames this close on every side (points) are one double rule (Rucola, Jack's, Osteria).
const DOUBLE = 6
// A panel covering this share of the page is its paper, not a box.
const PAPER = 0.9
// A fill this close to white (contrast with it) is paper: a knock-out behind words or a tint too faint to group.
const NEAR_WHITE = 1.1
// A rule is at least MIN_RULE long, level within FLAT or LEAN of its length (Rucola's dividers lean 1.5 pt over 135).
const MIN_RULE = 24
const FLAT = 0.5
const LEAN = 0.02
// A filled bar at most THIN thick is a rule; two rules over one span at most TWIN apart are a double (Osteria's 3).
const THIN = 3
const TWIN = 4

// Every point lies on an edge of the box: a rectangle, closed or open (a notch for a heading), corners rounded or not.
const rectLike = (points: readonly Point[], b: Box): boolean =>
  b.w > 0 &&
  b.h > 0 &&
  points.every(
    ([x, y]) =>
      Math.abs(x - b.x) <= EDGE ||
      Math.abs(x - b.x - b.w) <= EDGE ||
      Math.abs(y - b.y) <= EDGE ||
      Math.abs(y - b.y - b.h) <= EDGE,
  )
const paper = (fill: string): boolean => contrast(fromHex(fill), [255, 255, 255]) < NEAR_WHITE
const inside = (a: Box, b: Box): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h
const sized = (b: Box): boolean => b.w >= MIN_W && b.h >= MIN_H

function clip(b: Box, width: number, height: number): Box | null {
  const x = Math.max(0, b.x)
  const y = Math.max(0, b.y)
  const w = Math.min(width, b.x + b.w) - x
  const h = Math.min(height, b.y + b.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

// One drawn element as a frame or a panel, or nothing.
function classify(tag: string, given: Subpath[], scale: number): Vector | null {
  const subpaths = given.filter((s) => s.points.length >= 3)
  const stroke = colourOf(attr(tag, 'stroke'))
  const fill = colourOf(attr(tag, 'fill'))
  const strokeOpaque = Number(attr(tag, 'stroke-opacity') ?? 1) >= OPAQUE
  const fillOpaque = Number(attr(tag, 'fill-opacity') ?? 1) >= OPAQUE
  // Zero-length subpaths draw only line caps (the dots beside Rucola's dotted rules).
  const drawn = subpaths.filter((s) => {
    const b = boxOf(s.points)
    return b.w > 0.01 || b.h > 0.01
  })
  if (!drawn.length) return null
  const all = boxOf(drawn.flatMap((s) => s.points))
  const rect = drawn.every((s) => rectLike(s.points, boxOf(s.points)))
  const curved = drawn.some((s) => s.curved)
  if (stroke && strokeOpaque && !attr(tag, 'stroke-dasharray')) {
    if (drawn.length !== 1 || !rect || !sized(all)) return null
    const width = Number(attr(tag, 'stroke-width') ?? 1) * scale
    const frame: Vector = { kind: 'frame', box: all, color: stroke, width, rounded: curved, double: false }
    return fill && fillOpaque && !paper(fill) ? { ...frame, fill } : frame
  }
  if (!fill || !fillOpaque || stroke || !rect || !sized(all)) return null
  const [outer, inner] = drawn.map((s) => boxOf(s.points)).sort((a, b) => b.w * b.h - a.w * a.h)
  // A ring (a rectangle with a rectangular hole) is a frame drawn as a fill (Sarge's red border).
  if (drawn.length === 2 && outer && inner && inside(inner, outer)) {
    const width = Math.min(inner.x - outer.x, inner.y - outer.y, outer.x + outer.w - inner.x - inner.w)
    return { kind: 'frame', box: outer, color: fill, width, rounded: curved, double: false }
  }
  // A white or near-white fill is paper: a knock-out behind words (Rucola's heading gaps), not a panel.
  if (drawn.length !== 1 || paper(fill)) return null
  return { kind: 'panel', box: all, color: fill, width: 0, rounded: curved, double: false }
}

// One drawn element's rules: each straight level or upright stroke of a path, or a thin filled bar. A stroke's
// thickness across a line follows the matrix's other axis (Kendells' rules sit under a 4.8× horizontal scale).
function rulesOf(tag: string, subpaths: Subpath[], m: Matrix): Rule[] {
  const stroke = colourOf(attr(tag, 'stroke'))
  const fill = colourOf(attr(tag, 'fill'))
  if (stroke && Number(attr(tag, 'stroke-opacity') ?? 1) >= OPAQUE) {
    const sw = Number(attr(tag, 'stroke-width') ?? 1)
    const dashes = (attr(tag, 'stroke-dasharray') ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    const dash = !dashes.length ? 'solid' : (dashes[0] ?? 0) <= sw ? 'dotted' : 'dashed'
    return subpaths.flatMap((s): Rule[] => {
      const b = boxOf(s.points)
      const level = b.w >= MIN_RULE && b.h <= Math.max(FLAT, b.w * LEAN)
      if (s.curved || (!level && !(b.h >= MIN_RULE && b.w <= Math.max(FLAT, b.h * LEAN)))) return []
      const width = sw * (level ? Math.hypot(m[1], m[3]) : Math.hypot(m[0], m[2]))
      return [{ box: centreLine(b), color: stroke, width, dash, double: false }]
    })
  }
  const [only] = subpaths
  if (!fill || stroke || subpaths.length !== 1 || !only || Number(attr(tag, 'fill-opacity') ?? 1) < OPAQUE) return []
  const b = boxOf(only.points)
  const thick = Math.min(b.w, b.h)
  if (!rectLike(only.points, b) || thick > THIN || Math.max(b.w, b.h) < MIN_RULE) return []
  if (paper(fill)) return []
  return [{ box: centreLine(b), color: fill, width: thick, dash: 'solid', double: false }]
}
const centreLine = (b: Box): Box =>
  b.w >= b.h ? { x: b.x, y: b.y + b.h / 2, w: b.w, h: 0 } : { x: b.x + b.w / 2, y: b.y, w: 0, h: b.h }

// Frames, panels and rules; `art` is every other drawn shape and `placed` every raster picture (pdf/art.ts).
export function parseVectors(svg: string): {
  boxes: Vector[]
  rules: Rule[]
  art: Drawn[]
  placed: Placed[]
  glyphs: Glyph[]
  width: number
  height: number
} {
  const { width, height, drawn, placed, glyphs } = drawnElements(svg)
  const found: Vector[] = []
  const rules: Rule[] = []
  const art: Drawn[] = []
  const onPage = (r: Rule): boolean =>
    r.box.x >= 0 && r.box.y >= 0 && r.box.x + r.box.w <= width && r.box.y + r.box.h <= height
  // A masked shape's visible part is unknown: it is no box and no rule (Osteria's red fill under its awards).
  for (const d of drawn.filter((x) => !x.masked)) {
    const { tag, subpaths, m } = d
    // A stroke drawn under a non-uniform matrix is as wide as its larger axis (Carmine's frames).
    const v = classify(tag, subpaths, Math.max(Math.abs(m[0]), Math.abs(m[3])))
    const box = v ? clip(v.box, width, height) : null
    // A panel as large as the page is its paper or its colour: a picture's matter (pdf/art.ts), never a box.
    const page = !!box && box.w * box.h >= width * height * PAPER
    const kept = v && box && !(v.kind === 'panel' && page) ? { ...(page ? unfilled(v) : v), box } : null
    if (kept) found.push(kept)
    const lines = rulesOf(tag, subpaths, m).filter(onPage)
    rules.push(...lines)
    if (!kept && !lines.length) art.push(d)
  }
  art.push(...drawn.filter((d) => d.masked))
  return { boxes: mergeDoubles(found), rules: mergeRules(rules), art, placed, glyphs, width, height }
}

// The same line drawn twice is one rule; two parallel lines over the same span a few points apart are a double.
function mergeRules(rules: readonly Rule[]): Rule[] {
  const out: Rule[] = []
  for (const r of rules) {
    const level = r.box.w > 0
    const twin = out.find(
      (o) =>
        o.box.w > 0 === level &&
        o.color === r.color &&
        Math.abs(o.box.x - r.box.x) <= TWIN &&
        Math.abs(o.box.y - r.box.y) <= TWIN &&
        Math.abs(o.box.x + o.box.w - r.box.x - r.box.w) <= TWIN &&
        Math.abs(o.box.y + o.box.h - r.box.y - r.box.h) <= TWIN,
    )
    if (!twin) {
      out.push({ ...r, box: { ...r.box } })
      continue
    }
    const gap = level ? Math.abs(twin.box.y - r.box.y) : Math.abs(twin.box.x - r.box.x)
    if (gap < FLAT * 2) continue
    twin.double = true
    twin.width = gap + Math.max(twin.width, r.width)
    if (level) twin.box.y = (twin.box.y + r.box.y) / 2
    else twin.box.x = (twin.box.x + r.box.x) / 2
  }
  return out
}

// A frame without its fill: the page's colour on a page-size frame, or a fill whose words cannot read (boxes.ts).
export function unfilled(v: Vector): Vector {
  if (v.fill === undefined) return v
  return { kind: v.kind, box: v.box, color: v.color, width: v.width, rounded: v.rounded, double: v.double }
}

// Two frames drawn a few points apart are one double rule.
function mergeDoubles(vectors: Vector[]): Vector[] {
  const out: Vector[] = []
  for (const v of vectors) {
    const twin = out.find(
      (o) =>
        o.kind === 'frame' &&
        v.kind === 'frame' &&
        Math.abs(o.box.x - v.box.x) <= DOUBLE &&
        Math.abs(o.box.y - v.box.y) <= DOUBLE &&
        Math.abs(o.box.x + o.box.w - v.box.x - v.box.w) <= DOUBLE &&
        Math.abs(o.box.y + o.box.h - v.box.y - v.box.h) <= DOUBLE,
    )
    if (!twin) {
      out.push(v)
      continue
    }
    twin.double = true
    twin.width += v.width
    if (v.fill) twin.fill ??= v.fill
    if (v.box.w * v.box.h > twin.box.w * twin.box.h) twin.box = v.box
  }
  return out
}
