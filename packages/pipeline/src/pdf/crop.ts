import { intersection, union } from './geometry.ts'
import type { Rgb } from '../html/color.ts'
import type { Pixels } from './pixels.ts'
import type { Box } from './types.ts'
import { dominant, INK_DIFF } from './visibility.ts'

const differs = (a: Rgb, b: Rgb, by = INK_DIFF): boolean => a.some((v, i) => Math.abs(v - (b[i] ?? 0)) > by)

// A word's painted extent, not its font box (a big price digit's font box is far taller than the glyph): the
// pixels of its text colour, else of the commonest colour off the box's background. Null when nothing is painted.
const SAME_INK = 48
export function inkBox(img: Pixels, word: Box, color: Rgb | null = null): Box | null {
  const x0 = Math.max(0, Math.floor(word.x))
  const y0 = Math.max(0, Math.floor(word.y))
  const x1 = Math.min(img.width, Math.ceil(word.x + word.w))
  const y1 = Math.min(img.height, Math.ceil(word.y + word.h))
  const ink = color ?? guessInk(img, x0, y0, x1, y1)
  if (!ink) return null
  let box: Box | null = null
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (!differs(img.at(x, y), ink, SAME_INK)) box = box ? union(box, { x, y, w: 1, h: 1 }) : { x, y, w: 1, h: 1 }
  return box
}

// Without a known text colour: the commonest colour off the box's background in the box's middle half, where the
// glyph sits.
function guessInk(img: Pixels, x0: number, y0: number, x1: number, y1: number): Rgb | null {
  const pixels: Rgb[] = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixels.push(img.at(x, y))
  const ground = dominant(pixels)
  const quarter = (y1 - y0) / 4
  const middle = pixels.filter((c, i) => {
    const y = y0 + Math.floor(i / (x1 - x0))
    return y >= y0 + quarter && y < y1 - quarter && differs(c, ground)
  })
  return middle.length ? dominant(middle) : null
}

// A word, or another product's picture (never own), as seen by a crop.
type CropWord = { box: Box; own: boolean }

// Words set on one line ("3" and its small "99"): overlapping heights, close beside each other.
const sameLine = (a: Box, b: Box): boolean => {
  const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  const gap = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
  return overlap >= Math.min(a.h, b.h) / 2 && gap <= Math.max(a.h, b.h)
}
// Another offer's word is cut away only from this band along the picture's edge, so a cut never goes deep
// into the product.
const BAND = 0.25
const INK_PAD = 3

// A picture's crop: the product's own words reaching out of it are taken in whole, along their line; another
// offer's words are cut away within the edge band, never through the product's words. Boxes in image pixels.
export function cropPicture(box: Box, words: readonly CropWord[]): Box {
  const own = words.filter((w) => w.own)
  // A few pixels round a taken-in word keep its anti-aliased edge (the ink colour match stops short of it).
  const padded = (w: Box): Box => ({ x: w.x - INK_PAD, y: w.y - INK_PAD, w: w.w + 2 * INK_PAD, h: w.h + 2 * INK_PAD })
  // Taking a word in can reach another of the product's words ("3" reaching into "kernlos, per Kilo"): until none.
  const offer = new Set<CropWord>()
  let b = box
  for (let grown = true; grown;) {
    const more = own.filter(
      (w) => !offer.has(w) && (intersection(b, w.box) > 0 || [...offer].some((o) => sameLine(o.box, w.box))),
    )
    more.forEach((w) => offer.add(w))
    b = more.reduce((acc, w) => union(acc, padded(w.box)), b)
    grown = more.length > 0
  }
  const crossesOwn = (edge: Box): boolean => own.some((w) => intersection(edge, w.box) > 0)
  for (const w of words.filter((x) => !x.own)) {
    if (intersection(b, w.box) === 0) continue
    const { x, y, w: width, h } = w.box
    const cut = [
      { keep: { ...b, h: y - b.y }, depth: b.y + b.h - y, size: b.h, edge: { ...b, y: y - 1, h: 1 } },
      {
        keep: { ...b, y: y + h, h: b.y + b.h - (y + h) },
        depth: y + h - b.y,
        size: b.h,
        edge: { ...b, y: y + h, h: 1 },
      },
      { keep: { ...b, w: x - b.x }, depth: b.x + b.w - x, size: b.w, edge: { ...b, x: x - 1, w: 1 } },
      {
        keep: { ...b, x: x + width, w: b.x + b.w - (x + width) },
        depth: x + width - b.x,
        size: b.w,
        edge: { ...b, x: x + width, w: 1 },
      },
    ]
      .filter((c) => c.keep.w > 0 && c.keep.h > 0 && c.depth <= c.size * BAND && !crossesOwn(c.edge))
      .sort((p, q) => p.depth - q.depth)[0]
    if (cut) b = cut.keep
  }
  return b
}

// A model's box can stop inside its picture (a badge's top cut off): top and bottom grow while the next rows show
// picture content, by at most GROW; a row of another offer, or all content (a full-width photo or band), stops it.
// A figure's crop fills the image the PDF placed it in (`limit`): the model's box often stops short of a logo's arc
// or a photo's edge. The ink inside the image, foreign words aside, sets the crop; blank margins are not taken.
export function fillToImage(box: Box, limit: Box, words: readonly CropWord[], img: Pixels): Box {
  const x0 = Math.max(0, Math.floor(limit.x))
  const y0 = Math.max(0, Math.floor(limit.y))
  const x1 = Math.min(img.width, Math.ceil(limit.x + limit.w))
  const y1 = Math.min(img.height, Math.ceil(limit.y + limit.h))
  const ring: Rgb[] = []
  for (let x = x0; x < x1; x++) ring.push(img.at(x, y0), img.at(x, y1 - 1))
  for (let y = y0; y < y1; y++) ring.push(img.at(x0, y), img.at(x1 - 1, y))
  const ground = dominant(ring)
  const foreign = words.filter((w) => !w.own && intersection(w.box, limit) > 0).map((w) => w.box)
  let ink: Box | null = null
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (foreign.some((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h)) continue
      if (differs(img.at(x, y), ground, CONTENT_DIFF))
        ink = ink ? union(ink, { x, y, w: 1, h: 1 }) : { x, y, w: 1, h: 1 }
    }
  return ink ? union(box, ink) : box
}

const GROW = 0.15
const CONTENT_DIFF = 64
const MIN_LINE_CONTENT = 0.02
const MAX_LINE_CONTENT = 0.9
const GAP = 0.04
export function growToPicture(box: Box, words: readonly CropWord[], img: Pixels): Box {
  const ring: Rgb[] = []
  for (let x = Math.floor(box.x); x < box.x + box.w; x++)
    ring.push(img.at(x, Math.floor(box.y)), img.at(x, Math.floor(box.y + box.h - 1)))
  const ground = dominant(ring)
  // Share of picture content on one row (words aside); null when the row is off the page or meets another offer.
  const content = (y: number): number | null => {
    const line = { ...box, y, h: 1 }
    if (y < 0 || y >= img.height || words.some((w) => !w.own && intersection(line, w.box) > 0)) return null
    const near = words.filter((w) => intersection(line, w.box) > 0)
    let found = 0
    let total = 0
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(img.width, box.x + box.w); x++) {
      if (near.some((w) => x >= w.box.x && x < w.box.x + w.box.w)) continue
      total++
      if (differs(img.at(x, y), ground, CONTENT_DIFF)) found++
    }
    return total ? found / total : 0
  }
  // The farthest row, within reach, that still shows this picture; a few empty rows (a badge's inner gap) are crossed.
  const reach = (from: number, step: number): number => {
    let last = from - step
    for (let y = from, gap = 0; Math.abs(y - from) < box.h * GROW && gap <= box.h * GAP; y += step) {
      const share = content(y)
      if (share === null || share >= MAX_LINE_CONTENT) break
      if (share > MIN_LINE_CONTENT) {
        last = y
        gap = 0
      } else gap++
    }
    return last
  }
  const top = reach(Math.floor(box.y) - 1, -1)
  const bottom = reach(Math.ceil(box.y + box.h), 1) + 1
  return { ...box, y: Math.min(box.y, top), h: Math.max(box.y + box.h, bottom) - Math.min(box.y, top) }
}
