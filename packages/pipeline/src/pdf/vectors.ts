import { contrast, fromHex } from '../html/color.ts'
import type { Box, Rule, Vector } from './types.ts'

// The PDF's drawn geometry as pdftocairo writes it to SVG: frames (stroked rectangles, or filled rings), panels
// (filled rectangles) and rules (straight lines), in PDF points. Text (glyph <use>s) and pictures are not read here.

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
// A frame or panel smaller than this (points) is a glyph or a bullet, not a box round text.
const MIN_W = 24
const MIN_H = 12
// A point within this distance (points) of the box's edge lies on it; Rucola's cut corners sit 1 pt inside.
const EDGE = 1.5
const OPAQUE = 0.5
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

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

function transformOf(value: string | null): Matrix {
  if (!value) return IDENTITY
  const nums = (s: string): number[] =>
    s
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
  let m = IDENTITY
  for (const [, fn, args = ''] of value.matchAll(/(matrix|translate|scale)\(([^)]*)\)/g)) {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = nums(args)
    const n: Matrix =
      fn === 'matrix' ? [a, b, c, d, e, f] : fn === 'translate' ? [1, 0, 0, 1, a, b] : [a, 0, 0, b === 0 ? a : b, 0, 0]
    m = multiply(m, n)
  }
  return m
}

const attr = (tag: string, name: string): string | null =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1] ?? null

// "rgb(66.6%, 11.7%, 18%)" as #aa1e2e; null for none or anything else.
function colourOf(value: string | null): string | null {
  const m = /rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/.exec(value ?? '')
  if (!m) return null
  return `#${[m[1], m[2], m[3]]
    .map((v) =>
      Math.round((Number(v) * 255) / 100)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

type Point = [number, number]
type Subpath = { points: Point[]; curved: boolean }

// The path's subpaths in page points: segment end points only (a corner's control points never leave its box).
function subpathsOf(d: string, m: Matrix): Subpath[] {
  const out: Subpath[] = []
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []
  let command = ''
  let numbers: number[] = []
  const map = ([x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
  const flush = (): void => {
    const current = out.at(-1)
    if (command === 'M') out.push({ points: [], curved: false })
    const target = out.at(-1) ?? current
    if (!target) return
    const step = command === 'C' ? 6 : 2
    for (let i = 0; i + step <= numbers.length; i += step)
      target.points.push(map([numbers[i + step - 2] ?? 0, numbers[i + step - 1] ?? 0]))
    if (command === 'C') target.curved = true
  }
  for (const t of tokens) {
    if (/^[A-Za-z]$/.test(t)) {
      if (command) flush()
      command = t.toUpperCase()
      numbers = []
    } else numbers.push(Number(t))
  }
  if (command) flush()
  return out.filter((s) => s.points.length >= 2)
}

const boxOf = (points: readonly Point[]): Box => {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
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
    return { kind: 'frame', box: all, color: stroke, width, rounded: curved, double: false }
  }
  if (!fill || !fillOpaque || stroke || !rect || !sized(all)) return null
  const [outer, inner] = drawn.map((s) => boxOf(s.points)).sort((a, b) => b.w * b.h - a.w * a.h)
  // A ring (a rectangle with a rectangular hole) is a frame drawn as a fill (Sarge's red border).
  if (drawn.length === 2 && outer && inner && inside(inner, outer)) {
    const width = Math.min(inner.x - outer.x, inner.y - outer.y, outer.x + outer.w - inner.x - inner.w)
    return { kind: 'frame', box: outer, color: fill, width, rounded: curved, double: false }
  }
  // A white or near-white fill is paper: a knock-out behind words (Rucola's heading gaps), not a panel.
  if (drawn.length !== 1 || contrast(fromHex(fill), [255, 255, 255]) < NEAR_WHITE) return null
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
  if (contrast(fromHex(fill), [255, 255, 255]) < NEAR_WHITE) return []
  return [{ box: centreLine(b), color: fill, width: thick, dash: 'solid', double: false }]
}
const centreLine = (b: Box): Box =>
  b.w >= b.h ? { x: b.x, y: b.y + b.h / 2, w: b.w, h: 0 } : { x: b.x + b.w / 2, y: b.y, w: 0, h: b.h }

export function parseVectors(svg: string): { boxes: Vector[]; rules: Rule[] } {
  const width = Number(/<svg[^>]*\swidth="([\d.]+)pt"/.exec(svg)?.[1] ?? 0)
  const height = Number(/<svg[^>]*\sheight="([\d.]+)pt"/.exec(svg)?.[1] ?? 0)
  // Definitions that never draw on their own go (glyphs, clips, masks, filters, pictures); compositing groups stay:
  // blend modes put drawn content there (Sarge's red border), shown through a filter that cancels their offset.
  const body = svg
    .replace(/<g id="glyph-[^"]*">[\s\S]*?<\/g>/g, '')
    .replace(/<(clipPath|mask|filter|pattern)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<image\b[^>]*>/g, '')
  const stack: Matrix[] = [IDENTITY]
  const found: Vector[] = []
  const rules: Rule[] = []
  const onPage = (r: Rule): boolean =>
    r.box.x >= 0 && r.box.y >= 0 && r.box.x + r.box.w <= width && r.box.y + r.box.h <= height
  for (const [tag, close, name = ''] of body.matchAll(/<(\/?)(g|path|rect)\b[^>]*>/g)) {
    const top = stack.at(-1) ?? IDENTITY
    if (name === 'g') {
      const own = attr(tag, 'id')?.startsWith('compositing-group') ? IDENTITY : transformOf(attr(tag, 'transform'))
      if (close) stack.pop()
      else if (!tag.endsWith('/>')) stack.push(multiply(top, own))
      continue
    }
    const m = multiply(top, transformOf(attr(tag, 'transform')))
    const num = (a: string): number => Number(attr(tag, a) ?? 0)
    const [x, y, x1, y1] = [num('x'), num('y'), num('x') + num('width'), num('y') + num('height')].map(String)
    const d = name === 'rect' ? `M ${x} ${y} L ${x1} ${y} L ${x1} ${y1} L ${x} ${y1} Z` : (attr(tag, 'd') ?? '')
    const subpaths = subpathsOf(d, m)
    // A stroke drawn under a non-uniform matrix is as wide as its larger axis (Carmine's frames).
    const v = classify(tag, subpaths, Math.max(Math.abs(m[0]), Math.abs(m[3])))
    const box = v ? clip(v.box, width, height) : null
    if (v && box && !(v.kind === 'panel' && box.w * box.h >= width * height * PAPER)) found.push({ ...v, box })
    rules.push(...rulesOf(tag, subpaths, m).filter(onPage))
  }
  return { boxes: mergeDoubles(found), rules: mergeRules(rules) }
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
    if (v.box.w * v.box.h > twin.box.w * twin.box.h) twin.box = v.box
  }
  return out
}
