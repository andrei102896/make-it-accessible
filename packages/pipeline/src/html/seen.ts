import type { Grid } from '../pdf/backdrop.ts'
import type { Pixels } from '../pdf/pixels.ts'
import type { Box, Vector } from '../pdf/types.ts'
import { unfilled } from '../pdf/vectors.ts'
import { average, fromHex, hex, type Rgb } from './color.ts'
import { ranked, sample, SAMPLE_DPI } from './theme.ts'
import type { HtmlPage } from './types.ts'

// A box the PDF draws as the print shows it (backdrop.json `fills`): filled behind its words, only round its edge (a
// card whose middle is covered: Katzinger's), or nowhere (Kenny & Ziggy's floor planks under the cards drawn over them).
export type Fill = NonNullable<Grid['fills']>['looks'][number]
export type Seen = Omit<Fill, 'index'>

// Poppler's pixels drift from a fill's own colour by up to 36 where the print shows it (Gigi's olive); the nearest
// unseen fill is 54 away (RGB distance, non-sealed documents).
const SEEN_DISTANCE = 45
// The band read inside a box's edge (pixels at SAMPLE_DPI, 72: a pixel a point), and the share of the edge that must show the colour
// (seen edges .81–.98, unseen ones .00–.15).
const EDGE_TO = 4
const EDGE_SHARE = 0.5
// A border thinner than a pixel shows blended into the print inside it: Scotts' 1 pt olive at .65 of its colour, its
// hairline at .35.
const BLEND = 0.3
const SLACK = 12

const distance = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const shows = (p: Rgb, c: Rgb, inside: Rgb): boolean => {
  const [near, far, span] = [distance(p, c), distance(p, inside), distance(c, inside)]
  return near <= SEEN_DISTANCE || (near + far <= span + SLACK && near <= span * (1 - BLEND))
}

// Round a box's edge: every pixel from one outside it (a rule centred on it) to EDGE_TO inside, and the share of the
// edge showing `c` there.
function edgeOf(img: Pixels, box: Box, c: Rgb): { band: Rgb[]; share: number } {
  const band: Rgb[] = []
  const at = (x: number, y: number): Rgb | null =>
    x >= 0 && y >= 0 && x < img.width && y < img.height ? img.at(x, y) : null
  const [x0, y0] = [Math.round(box.x), Math.round(box.y)]
  const [x1, y1] = [Math.round(box.x + box.w) - 1, Math.round(box.y + box.h) - 1]
  let n = 0
  let shown = 0
  // From an edge spot (x, y), inward by (dx, dy).
  const read = (x: number, y: number, dx: number, dy: number): void => {
    const across = [...Array(EDGE_TO + 2).keys()].flatMap((k) => {
      const p = at(x + dx * (k - 1), y + dy * (k - 1))
      return p ? [p] : []
    })
    const inside = at(x + dx * (EDGE_TO + 2), y + dy * (EDGE_TO + 2))
    if (!across.length || !inside) return
    band.push(...across)
    n++
    if (across.some((p) => shows(p, c, inside))) shown++
  }
  for (let x = x0; x <= x1; x++) {
    read(x, y0, 0, 1)
    read(x, y1, 0, -1)
  }
  for (let y = y0 + 1; y < y1; y++) {
    read(x0, y, 1, 0)
    read(x1, y, -1, 0)
  }
  return { band, share: n ? shown / n : 0 }
}

function interior(img: Pixels, box: Box): Rgb[] {
  const out: Rgb[] = []
  for (let y = Math.max(0, Math.round(box.y)); y < Math.min(img.height, Math.round(box.y + box.h)); y++)
    for (let x = Math.max(0, Math.round(box.x)); x < Math.min(img.width, Math.round(box.x + box.w)); x++)
      out.push(img.at(x, y))
  return out
}

// A fill's look: its colour is the commonest round its words (clipped to its box; its whole box when that leaves none:
// Katzinger's "DESSERT" set larger than its pill), else seen round its edge, else not seen. `colour`: the colour
// printed, measured, or the vector's when unseen.
export function fillSeen(img: Pixels, box: Box, words: readonly Box[], colour: string): Seen {
  const c = fromHex(colour)
  const edge = edgeOf(img, box, c)
  const ring = sample(img, words, box).ring
  const top = ranked(ring.length ? ring : interior(img, box))[0]
  if (top && distance(top.c, c) <= SEEN_DISTANCE) return { look: 'fill', colour: hex(top.c) }
  if (edge.share < EDGE_SHARE) return { look: 'none', colour }
  const exact = edge.band.filter((p) => distance(p, c) <= SEEN_DISTANCE)
  return { look: 'edge', colour: exact.length ? hex(average(exact)) : colour }
}

// Fills of one colour laid edge to edge (never over each other), six or more, are a texture, never a box (Kenny &
// Ziggy's floor planks: 12 and more; the most cards side by side elsewhere: 3); a fill of a tenth of the page or more
// tiles nothing.
const TILES = 6
const TOUCH = 1
const LARGE = 0.1

const touching = (a: Box, b: Box): boolean =>
  a.x <= b.x + b.w + TOUCH && b.x <= a.x + a.w + TOUCH && a.y <= b.y + b.h + TOUCH && b.y <= a.y + a.h + TOUCH
const across = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0)
const adjoining = (a: Box, b: Box): boolean =>
  touching(a, b) && Math.min(across(a.x, a.x + a.w, b.x, b.x + b.w), across(a.y, a.y + a.h, b.y, b.y + b.h)) <= TOUCH
const sameBox = (a: Box, b: Box): boolean =>
  [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h].every((d) => Math.abs(d) <= TOUCH)
const centred = (v: Box, w: Box): boolean => {
  const [x, y] = [w.x + w.w / 2, w.y + w.h / 2]
  return x > v.x && x < v.x + v.w && y > v.y && y < v.y + v.h
}
const area = (b: Box): number => b.w * b.h

// Every fill on a page as the print shows it: each word read by the smallest fill holding it (a card's words are not
// its section's); a frame whose fill is hidden keeps its rule; a frame stroked on an unseen fill's box goes with it.
// `img` drawn at SAMPLE_DPI, `words` the page's visible words in its pixels, `vectors` in points.
export function fillsOf(img: Pixels, vectors: readonly Vector[], words: readonly Box[]): Fill[] {
  const k = SAMPLE_DPI / 72
  const fills = vectors.flatMap((v, index) => {
    const colour = v.kind === 'panel' ? v.color : v.fill
    const box = { x: v.box.x * k, y: v.box.y * k, w: v.box.w * k, h: v.box.h * k }
    return colour ? [{ v, box, index, colour }] : []
  })
  const smallest = [...fills].sort((a, b) => area(a.box) - area(b.box))
  const owned = new Map<number, Box[]>()
  for (const w of words) {
    const f = smallest.find((x) => centred(x.box, w))
    if (f) owned.set(f.index, [...(owned.get(f.index) ?? []), w])
  }
  const tiles = fills.filter((f) => area(f.box) < img.width * img.height * LARGE)
  const group = new Map(tiles.map((f) => [f.index, f.index]))
  const root = (i: number): number => {
    const up = group.get(i) ?? i
    return up === i ? i : root(up)
  }
  for (const a of tiles)
    for (const b of tiles)
      if (a.index < b.index && a.colour === b.colour && adjoining(a.box, b.box)) group.set(root(b.index), root(a.index))
  const size = new Map<number, number>()
  for (const f of tiles) size.set(root(f.index), (size.get(root(f.index)) ?? 0) + 1)
  const seen = fills.map(({ v, box, index, colour }): Fill => {
    if (group.has(index) && (size.get(root(index)) ?? 0) >= TILES) return { index, look: 'none', colour }
    const { look, colour: shown } = fillSeen(img, box, owned.get(index) ?? [], colour)
    return { index, look: look === 'none' && v.kind === 'frame' ? 'rule' : look, colour: shown }
  })
  const unseen = seen.flatMap((f) => (f.look === 'none' ? (vectors[f.index]?.box ?? []) : []))
  const twins = vectors.flatMap((v, index): Fill[] =>
    v.kind === 'frame' && !v.fill && unseen.some((b) => sameBox(b, v.box))
      ? [{ index, look: 'none', colour: v.color }]
      : [],
  )
  return [...seen, ...twins].sort((a, b) => a.index - b.index)
}

// An edge seen alone is drawn as a frame this wide (pt; 2 px), in its measured colour.
const EDGE_WIDTH = 1.5
// The page's boxes as printed (backdrop.json `fills`): an unseen one left out (its words fall to the box the print
// shows), an edge seen alone a frame, a frame with its fill hidden its rule, a fill in its measured colour. A backdrop
// measured on another extraction's vectors (another count) changes nothing.
export function asSeen(page: HtmlPage): HtmlPage {
  const vectors = page.extraction.vectors
  const fills = page.backdrop?.grid.fills
  if (!vectors || !fills || fills.vectors !== vectors.length) return page
  const looks = new Map(fills.looks.map((f) => [f.index, f]))
  const seen = vectors.flatMap((v, i): Vector[] => {
    const f = looks.get(i)
    if (!f) return [v]
    if (f.look === 'none') return []
    if (f.look === 'rule') return [unfilled(v)]
    if (f.look === 'edge') return [{ ...unfilled(v), kind: 'frame', color: f.colour, width: EDGE_WIDTH }]
    return [v.kind === 'panel' ? { ...v, color: f.colour } : { ...v, fill: f.colour }]
  })
  return { ...page, extraction: { ...page.extraction, vectors: seen } }
}
