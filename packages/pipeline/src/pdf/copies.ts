import { COVERED, MIN_SHOWN, opacityOf } from './art.ts'
import { area, intersection, union } from './geometry.ts'
import { attr, boxOf, drawnElements, type Drawn, type Point } from './svg.ts'
import type { Box } from './types.ts'
import { parseVectors } from './vectors.ts'

// The shapes that draw placed words again (pdf/backdrop.ts cuts them with the glyphs): an outline round the letters
// or a letter-shaped fill under them, and nothing the print hides or that is not shaped like the words.

// A glyph or a shape this close to a placed word belongs to it, as a share of the word's height: glyph origins sit
// on the baseline, a drop shadow drawn as paths a point or two off.
const PAD = 0.25
// A shape copying placed words is at least this share of their height: a letter is; a speck of an engraving inside
// their box is not (Boater's lobster under THE MENU; Moosewood's next line inside the tall box of "entrees").
const MIN_COPY = 0.3
// And at most this share: a copy is word-sized; a drawing spanning lines of text is not (Howies' fish watermark,
// one path under 154 words, 2026-10-19).
const MAX_COPY = 2
// A word's zone and a shape share at least this part of the smaller one for the word to be under the shape; a word
// whose zone only touches it is not (Kenny & Ziggy's red badge round a "4", touched by the line below's zone).
const MOSTLY = 0.25
// A fill this opaque hides what was drawn under it (pdftocairo writes fill-opacity="1" for solid paint).
const OPAQUE = 0.99

export const zoneOf = (b: Box): Box => {
  const p = b.h * PAD
  return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p }
}
export const holds = (z: Box, [x, y]: Point): boolean => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
export const outline = ({ tag }: Drawn): boolean => attr(tag, 'fill') === 'none' && attr(tag, 'stroke') !== null

const plainBox = ({ subpaths: [only, ...more] }: Drawn): boolean => {
  if (more.length || !only || only.curved) return false
  const b = boxOf(only.points)
  const on = (v: number, a: number, c: number): boolean => Math.abs(v - a) <= 0.5 || Math.abs(v - c) <= 0.5
  return only.points.every(([x, y]) => on(x, b.x, b.x + b.w) && on(y, b.y, b.y + b.h))
}
const opaqueBox = (d: Drawn): boolean =>
  !d.masked &&
  plainBox(d) &&
  attr(d.tag, 'fill') !== 'none' &&
  Number(attr(d.tag, 'fill-opacity') ?? 1) >= OPAQUE &&
  Number(attr(d.tag, 'opacity') ?? 1) >= OPAQUE
// Inside within half a point: pdftocairo's path coordinates round to hundredths, a card's edge is never sharper.
const within = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.w <= outer.x + outer.w + 0.5 &&
  inner.y + inner.h <= outer.y + outer.h + 0.5

// Outlines round placed words and letter-shaped fills under them (Kenny & Ziggy's lines, La Segunda's strokes). A
// filled box behind words stays (Gigi's strips); so does a shape a later opaque box hides (K&Z's wood grain).
export function copiesOf(svg: string, words: readonly Box[]): Drawn[] {
  const art = parseVectors(svg).art
  // Every opaque box, the panels vectors.ts takes out of the art included.
  const covers = drawnElements(svg).drawn.filter((d) => d.bound !== null && opaqueBox(d))
  const hidden = (d: Drawn): boolean => {
    const b = d.bound
    return b !== null && covers.some((c) => c.range[0] > d.range[0] && c.bound !== null && within(b, c.bound))
  }
  const redrawn = (d: Drawn, b: Box): boolean => {
    const under = words.filter((w) => {
      const z = zoneOf(w)
      return intersection(z, b) >= Math.min(area(z), area(b)) * MOSTLY
    })
    if (!under.length) return false
    const hull = under.map(zoneOf).reduce(union)
    const covered = under.reduce((sum, w) => sum + intersection(w, b), 0)
    const tallest = Math.max(...under.map((w) => w.h))
    // A fill and the words it copies cover each other: a sliver of a drawing inside their boxes copies nothing
    // (Howies' fish scales); an outline is drawn round each letter and spans one.
    const spanned = outline(d) ? 0 : area(under.reduce(union))
    return (
      holds(hull, [b.x, b.y]) &&
      holds(hull, [b.x + b.w, b.y + b.h]) &&
      covered >= area(b) * COVERED &&
      covered >= spanned * COVERED &&
      b.h >= tallest * MIN_COPY &&
      b.h <= tallest * MAX_COPY
    )
  }
  return art.filter(
    (d) => d.bound && (outline(d) || !plainBox(d)) && opacityOf(d) >= MIN_SHOWN && !hidden(d) && redrawn(d, d.bound),
  )
}
