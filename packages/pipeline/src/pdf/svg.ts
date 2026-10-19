import type { Box } from './types.ts'

// pdftocairo's SVG of a page, read without a browser: transforms, colours, path geometry in PDF points, and one walk
// over the elements that draw (glyphs, clips, masks, filters and pictures left out).

// A paint at least this opaque shows; below it, pdftocairo's page-sized fill-opacity="0" canvases and faint tints.
export const OPAQUE = 0.5

export type Matrix = [number, number, number, number, number, number]
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

export function transformOf(value: string | null): Matrix {
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

export const attr = (tag: string, name: string): string | null =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1] ?? null

// "rgb(66.6%, 11.7%, 18%)" as #aa1e2e; null for none or anything else.
export function colourOf(value: string | null): string | null {
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

export type Point = [number, number]
export type Subpath = { points: Point[]; curved: boolean }

// The path's subpaths in page points: segment end points only (a corner's control points never leave its box).
export function subpathsOf(d: string, m: Matrix): Subpath[] {
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

export const boxOf = (points: readonly Point[]): Box => {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
// A drawn path or rect in page points: `clip` is the box its clips leave visible, `bound` its own box within that;
// `masked` when its visible shape is unknown (a mask, or a shaped clip), `filtered` under a filter.
export type Drawn = {
  tag: string
  subpaths: Subpath[]
  m: Matrix
  clip: Box | null
  masked: boolean
  filtered: boolean
  bound: Box | null
  range: [number, number]
}
// A raster picture placed on the page: its box in page points and the visible part its clip paths leave.
export type Placed = { box: Box; clip: Box | null }
// `range`: the element's place in the SVG text, so a later pass can cut it out (pdf/backdrop.ts).
type Node = { name: string; tag: string; children: Node[]; range: [number, number] }

// The document's elements as a tree (pdftocairo writes no text content that matters here).
function treeOf(svg: string): Node {
  const root: Node = { name: '#root', tag: '', children: [], range: [0, svg.length] }
  const stack: Node[] = [root]
  for (const match of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)\b[^>]*>/g)) {
    const [tag, close, name = ''] = match
    const end = match.index + tag.length
    if (close) {
      const open = stack.length > 1 ? stack.pop() : undefined
      if (open) open.range[1] = end
      continue
    }
    const node: Node = { name, tag, children: [], range: [match.index, end] }
    stack.at(-1)?.children.push(node)
    if (!tag.endsWith('/>')) stack.push(node)
  }
  return root
}

const intersect = (a: Box | null, b: Box | null): Box | null => {
  if (!a || !b) return a ?? b
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  }
}
const rectPath = (tag: string): string => {
  const num = (a: string): number => Number(attr(tag, a) ?? 0)
  const [x, y, x1, y1] = [num('x'), num('y'), num('x') + num('width'), num('y') + num('height')].map(String)
  return `M ${x} ${y} L ${x1} ${y} L ${x1} ${y1} L ${x} ${y1} Z`
}
// The visible area clip paths leave; `shaped` when one of them is not a rectangle (award badges, a logo outline).
type Clip = { box: Box; shaped: boolean }
// A plain rectangle larger than a rectangular clip shows only the clip: Canva-made PDFs paint a page-sized fill
// clipped to a thin bar (Osteria's red double rules) or a box. Any other shape cut by a clip shows an unknown part
// (Osteria's award badges, Bannatyne's frame lines): null.
const SLACK = 1
const onCorner = ([x, y]: Point, b: Box): boolean =>
  (Math.abs(x - b.x) <= SLACK || Math.abs(x - b.x - b.w) <= SLACK) &&
  (Math.abs(y - b.y) <= SLACK || Math.abs(y - b.y - b.h) <= SLACK)
function visiblePart(subpaths: Subpath[], clip: Clip | null): Subpath[] | null {
  const all = subpaths.flatMap((sp) => sp.points)
  if (!clip || !all.length) return subpaths
  const b = boxOf(all)
  const within =
    b.x >= clip.box.x - SLACK &&
    b.y >= clip.box.y - SLACK &&
    b.x + b.w <= clip.box.x + clip.box.w + SLACK &&
    b.y + b.h <= clip.box.y + clip.box.h + SLACK
  if (within) return subpaths
  const [only] = subpaths
  const plain = subpaths.length === 1 && only && !only.curved && only.points.every((p) => onCorner(p, b))
  if (clip.shaped || !plain) return null
  const v = intersect(b, clip.box)
  if (!v || v.w <= 0 || v.h <= 0) return []
  const corners: Point[] = [
    [v.x, v.y],
    [v.x + v.w, v.y],
    [v.x + v.w, v.y + v.h],
    [v.x, v.y + v.h],
  ]
  return [{ points: corners, curved: false }]
}
const ref = (value: string | null): string =>
  /^#(.+)$|url\(#([^)]+)\)/
    .exec(value ?? '')
    ?.slice(1)
    .find(Boolean) ?? ''

// The page size in points, every path or rect it draws and every raster picture it places, each through the
// transforms and clips above it. pdftocairo defines placed content in <defs> (`source-N` groups and images) and
// draws it with <use>: it counts where it is used, never where it is defined (Claudio's art at the foot, not the top).
// A glyph drawn from the text layer: the point it is drawn at (its baseline start) and its place in the SVG text.
// `alpha`: the opacity a uniform mask gives it (Gigi's title, white at 84 % over its band); 1 under any other mask.
export type Glyph = { at: Point; range: [number, number]; alpha: number; id: string }
export function drawnElements(svg: string): {
  width: number
  height: number
  drawn: Drawn[]
  placed: Placed[]
  glyphs: Glyph[]
} {
  const width = Number(/<svg[^>]*\swidth="([\d.]+)pt"/.exec(svg)?.[1] ?? 0)
  const height = Number(/<svg[^>]*\sheight="([\d.]+)pt"/.exec(svg)?.[1] ?? 0)
  const root = treeOf(svg)
  const byId = new Map<string, Node>()
  const index = (n: Node): void => {
    const id = attr(n.tag, 'id')
    if (id) byId.set(id, n)
    n.children.forEach(index)
  }
  index(root)
  const drawn: Drawn[] = []
  const placed: Placed[] = []
  const glyphs: Glyph[] = []
  const clipOf = (id: string, m: Matrix): Clip | null => {
    const subpaths = (byId.get(id)?.children ?? []).flatMap((c) => {
      const d = c.name === 'rect' ? rectPath(c.tag) : (attr(c.tag, 'd') ?? '')
      return subpathsOf(d, multiply(m, transformOf(attr(c.tag, 'transform'))))
    })
    const points = subpaths.flatMap((sp) => sp.points)
    if (!points.length) return null
    const box = boxOf(points)
    return {
      box,
      shaped: subpaths.length > 1 || subpaths.some((sp) => sp.curved || !sp.points.every((p) => onCorner(p, box))),
    }
  }
  const narrow = (a: Clip | null, b: Clip | null): Clip | null => {
    if (!a || !b) return a ?? b
    const box = intersect(a.box, b.box)
    return box ? { box, shaped: a.shaped || b.shaped } : null
  }
  // A mask holding one plain rect is a uniform opacity (its fill-opacity, through pdftocairo's remove-color filter).
  const uniformAlpha = (id: string): number => {
    const shapes: Node[] = []
    const collect = (n: Node): void => {
      if (n.name === 'rect' || n.name === 'path' || n.name === 'image' || n.name === 'use') shapes.push(n)
      n.children.forEach(collect)
    }
    const mask = byId.get(id)
    if (mask) collect(mask)
    const [only] = shapes
    return shapes.length === 1 && only?.name === 'rect' ? Number(attr(only.tag, 'fill-opacity') ?? 1) : 1
  }
  const walk = (
    n: Node,
    m: Matrix,
    clip: Clip | null,
    using: ReadonlySet<string>,
    masked = false,
    filtered = false,
    alpha = 1,
  ): void => {
    const id = attr(n.tag, 'id') ?? ''
    if (n.name === 'defs') {
      // Compositing groups draw in place: blend modes put content there (Sarge's red border), shown through a filter
      // that cancels their offset.
      for (const c of n.children)
        if (c.name === 'g' && attr(c.tag, 'id')?.startsWith('compositing-group'))
          walk(c, m, clip, using, masked, filtered, alpha)
      return
    }
    if (['clipPath', 'mask', 'filter', 'pattern', 'symbol'].includes(n.name) || id.startsWith('glyph')) return
    const own = id.startsWith('compositing-group') ? IDENTITY : transformOf(attr(n.tag, 'transform'))
    const here = multiply(m, own)
    const clipId = ref(attr(n.tag, 'clip-path'))
    const visible = clipId ? narrow(clip, clipOf(clipId, here)) : clip
    const maskId = ref(attr(n.tag, 'mask'))
    const hidden = masked || maskId !== ''
    const fade = maskId ? alpha * uniformAlpha(maskId) : alpha
    const filter = filtered || (n.name === 'g' && attr(n.tag, 'filter') !== null)
    if (n.name === 'path' || n.name === 'rect') {
      const d = n.name === 'rect' ? rectPath(n.tag) : (attr(n.tag, 'd') ?? '')
      const raw = subpathsOf(d, here)
      const shown = visiblePart(raw, visible)
      const all = raw.flatMap((sp) => sp.points)
      const own = all.length ? boxOf(all) : null
      drawn.push({
        tag: n.tag,
        subpaths: shown ?? [],
        m: here,
        clip: visible?.box ?? null,
        masked: hidden || !shown,
        filtered: filter,
        bound: own && visible ? intersect(own, visible.box) : own,
        range: n.range,
      })
      return
    }
    if (n.name === 'image') {
      const [corners] = subpathsOf(rectPath(n.tag), here)
      if (corners) placed.push({ box: boxOf(corners.points), clip: visible?.box ?? null })
      return
    }
    if (n.name === 'use') {
      const target = ref(attr(n.tag, 'xlink:href') ?? attr(n.tag, 'href'))
      const node = byId.get(target)
      const at = multiply(here, [1, 0, 0, 1, Number(attr(n.tag, 'x') ?? 0), Number(attr(n.tag, 'y') ?? 0)])
      if (target.startsWith('glyph')) glyphs.push({ at: [at[4], at[5]], range: n.range, alpha: fade, id: target })
      if (!node || using.has(target) || target.startsWith('glyph') || target.startsWith('compositing-group')) return
      walk(node, at, visible, new Set([...using, target]), hidden, filter, fade)
      return
    }
    for (const c of n.children) walk(c, here, visible, using, hidden, filter, fade)
  }
  walk(root, IDENTITY, null, new Set())
  return { width, height, drawn, placed, glyphs }
}
