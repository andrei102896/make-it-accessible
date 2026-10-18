import { contrast, fromHex } from '../html/color.ts'
import { attr, boxOf, colourOf, OPAQUE, type Drawn, type Placed } from './svg.ts'
import type { Box, Picture, Run } from './types.ts'

// The page's pictures: raster images where they show, vector drawings grouped, and large fills alone (a page-sized
// drawing glued everything near it into one picture: Kenny & Ziggy's curtain, 973 parts). Roles: html/pictures.ts.

// A small path that words cover this much is those words drawn (outlines, small caps, highlighted prices).
export const COVERED = 0.35
const SMALL = 0.05
// A shape over this share of the page is a fill of its own.
const BIG = 0.25
// Drawings within this share of the smaller one's height (at least MIN_GAP points) are one picture: a wordmark's
// letters stay together (Nick & Toni's), separate ornaments do not.
const GAP = 0.35
const MIN_GAP = 2
const MIN_SIZE = 3
// A fill this close to white is paper; fills stacked on almost the same box are one (Kenny & Ziggy's layers).
const NEAR_WHITE = 1.1
const SAME = 0.9
const CANVAS = 0.9

const area = (b: Box): number => b.w * b.h
const cut = (b: Box, c: Box): Box | null => {
  const x = Math.max(b.x, c.x)
  const y = Math.max(b.y, c.y)
  const w = Math.min(b.x + b.w, c.x + c.w) - x
  const h = Math.min(b.y + b.h, c.y + c.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}
const near = (a: Box, b: Box, gap: number): boolean =>
  a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h

// Groups boxes that `joins` pairs, never into one larger than `cap` (union-find over pairs; a page holds at most a
// few thousand): small pieces of a curtain chained into one page-sized picture that swallowed Kenny & Ziggy's name.
function grouped(boxes: readonly Box[], joins: (a: Box, b: Box) => boolean, cap = Infinity): Box[] {
  const parent = boxes.map((_, i) => i)
  const extent = boxes.map((b) => ({ ...b }))
  const find = (i: number): number => {
    let r = i
    while (parent[r] !== r) r = parent[r] ?? r
    return r
  }
  boxes.forEach((a, i) => {
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]
      const [ra, rb] = [find(i), find(j)]
      const [ea, eb] = [extent[ra], extent[rb]]
      if (!b || !ea || !eb || ra === rb || !joins(a, b)) continue
      const merged = boxOf([
        [Math.min(ea.x, eb.x), Math.min(ea.y, eb.y)],
        [Math.max(ea.x + ea.w, eb.x + eb.w), Math.max(ea.y + ea.h, eb.y + eb.h)],
      ])
      if (area(merged) > cap) continue
      parent[ra] = rb
      extent[rb] = merged
    }
  })
  const sets = new Map<number, Box[]>()
  boxes.forEach((b, i) => sets.set(find(i), [...(sets.get(find(i)) ?? []), b]))
  return [...sets.values()].map((set) =>
    boxOf(
      set.flatMap((b): [number, number][] => [
        [b.x, b.y],
        [b.x + b.w, b.y + b.h],
      ]),
    ),
  )
}

// A shape painted below OPAQUE shows nothing (pdftocairo's page-sized fill-opacity="0" canvases).
const paints = (tag: string): boolean =>
  Number(attr(tag, 'opacity') ?? 1) >= OPAQUE &&
  ((attr(tag, 'fill') !== 'none' && Number(attr(tag, 'fill-opacity') ?? 1) >= OPAQUE) ||
    (attr(tag, 'stroke') !== null &&
      attr(tag, 'stroke') !== 'none' &&
      Number(attr(tag, 'stroke-opacity') ?? 1) >= OPAQUE))

// What the page shows of its drawings: fills of their own, the small vector pieces (ungrouped), and the rasters.
function shownArt(
  art: readonly Drawn[],
  placed: readonly Placed[],
  words: readonly Run[],
  width: number,
  height: number,
): { fills: Picture[]; pieces: Box[]; rasters: Box[] } {
  const page: Box = { x: 0, y: 0, w: width, h: height }
  const shown = (b: Box, clip: Box | null): Box | null => {
    const v = cut(b, clip ?? page)
    const onPage = v ? cut(v, page) : null
    return onPage && onPage.w >= MIN_SIZE && onPage.h >= MIN_SIZE ? onPage : null
  }
  const covered = (b: Box): number => words.reduce((n, r) => n + area(cut(r.box, b) ?? { x: 0, y: 0, w: 0, h: 0 }), 0)
  const fills: Picture[] = []
  const pieces: Box[] = []
  for (const d of art) {
    // A shape whose visible part is unknown still shows within its clip (Boater's banner, Claudio's foot art).
    const points = d.subpaths.flatMap((s) => s.points)
    const known = points.length ? boxOf(points) : d.bound
    const b = known ? shown(known, d.clip) : null
    // A filter's canvas covers the page and paints nothing (Sarge's black rect); art under a filter stays.
    if (!b || !paints(d.tag) || (d.filtered && area(b) >= area(page) * CANVAS)) continue
    if (area(b) < area(page) * SMALL && covered(b) >= area(b) * COVERED) continue
    if (area(b) >= area(page) * BIG) {
      const color = d.masked ? null : colourOf(attr(d.tag, 'fill'))
      if (color && contrast(fromHex(color), [255, 255, 255]) < NEAR_WHITE) continue
      const twin = fills.find((f) => {
        const c = cut(f.box, b)
        return c !== null && area(c) >= Math.max(area(f.box), area(b)) * SAME
      })
      // The topmost of stacked fills shows; a masked one on top keeps the colour known below.
      const look: Pick<Picture, 'kind' | 'color'> = color
        ? { kind: 'fill', color }
        : (twin ?? { kind: 'vector', color: null })
      if (twin) Object.assign(twin, { box: b, kind: look.kind, color: look.color })
      else fills.push({ box: b, kind: look.kind, color: look.color })
    } else pieces.push(b)
  }
  const rasters = placed.flatMap((p) => {
    const b = shown(p.box, p.clip)
    return b ? [b] : []
  })
  return { fills, pieces, rasters }
}

// The page's drawings one by one, before neighbours are grouped: icons printed side by side stay apart
// (pdf/icons.ts). `words` are the page's text runs alone: a drawing under an icon's words would count as covered.
export function piecesOf(
  art: readonly Drawn[],
  placed: readonly Placed[],
  words: readonly Run[],
  width: number,
  height: number,
): Picture[] {
  const { pieces, rasters } = shownArt(art, placed, words, width, height)
  return [
    ...rasters.map((box): Picture => ({ box, kind: 'raster', color: null })),
    ...pieces.map((box): Picture => ({ box, kind: 'vector', color: null })),
  ]
}

export function picturesOf(
  art: readonly Drawn[],
  placed: readonly Placed[],
  words: readonly Run[],
  width: number,
  height: number,
): Picture[] {
  const { fills, pieces, rasters } = shownArt(art, placed, words, width, height)
  const page: Box = { x: 0, y: 0, w: width, h: height }
  return [
    // Each raster stands alone: photos printed edge to edge are separate pictures (Carew's rooms), and a figure
    // over several (2nd Ave's mosaic strips) takes them together in pictureIn.
    ...rasters.map((box): Picture => ({ box, kind: 'raster', color: null })),
    ...grouped(pieces, (a, b) => near(a, b, Math.max(MIN_GAP, GAP * Math.min(a.h, b.h))), area(page) * BIG).map(
      (box): Picture => ({
        box,
        kind: 'vector',
        color: null,
      }),
    ),
    ...fills,
  ]
}

// A model's loose box (Moosewood's 235×32 logo in 263×111) names the picture, or union, among those inside it that
// fits it best: 2nd Ave's six mosaic strips together, one of Carew's four room photos alone; never a fill.
const INSIDE = 0.8
const MATCH = 0.3
export function pictureIn(box: Box, pictures: readonly Picture[], width: number, height: number): Box | null {
  const shared = (b: Box): number => area(cut(b, box) ?? { x: 0, y: 0, w: 0, h: 0 })
  const fit = (b: Box): number => shared(b) / (area(b) + area(box) - shared(b))
  const named = pictures
    .filter((p) => p.kind !== 'fill' && area(p.box) <= width * height * BIG)
    .map((p) => p.box)
    .filter((b) => shared(b) >= area(b) * INSIDE || fit(b) >= MATCH)
  if (!named.length) return null
  const union = boxOf(
    named.flatMap((b): [number, number][] => [
      [b.x, b.y],
      [b.x + b.w, b.y + b.h],
    ]),
  )
  return [union, ...named].reduce((best, b) => (fit(b) > fit(best) ? b : best))
}
