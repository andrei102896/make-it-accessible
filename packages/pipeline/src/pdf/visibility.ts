import type { Rgb } from '../html/color.ts'
import type { Pixels } from './pixels.ts'
import type { Box, Run } from './types.ts'

// A word is judged on the part of its box no other word covers: at least this share and this many pixels.
const MIN_FREE = 0.3
const MIN_PIXELS = 20
// Visible text puts ink in its box: pixels this far (per channel) from the box's dominant colour.
export const INK_DIFF = 24
const MIN_INK = 0.005
// More than this share of a page hidden means the render failed, not that the publisher hid the text.
const MAX_HIDDEN = 0.5
// Only words at the same scale cover a word: a display glyph's box (Moosewood's 32 pt script "entrees") reaches far
// beyond its ink, and judging "any" on the strip it left blank dropped a printed word.
const SAME_SCALE = 2

type Rect = { x0: number; y0: number; x1: number; y1: number }

// Whether pixels draw nothing: none of them off their dominant colour (the ground) by INK_DIFF, past MIN_INK.
export function inkless(pixels: readonly Rgb[]): boolean {
  const ground = dominant(pixels)
  return (
    pixels.filter((c) => c.some((v, ch) => Math.abs(v - (ground[ch] ?? 0)) > INK_DIFF)).length < pixels.length * MIN_INK
  )
}

// A box in PDF points as the image's pixel rectangle, inside the image.
const rectOf = (b: Box, img: Pixels, scale: number): Rect => ({
  x0: Math.max(0, Math.floor(b.x * scale)),
  y0: Math.max(0, Math.floor(b.y * scale)),
  x1: Math.min(img.width, Math.ceil((b.x + b.w) * scale)),
  y1: Math.min(img.height, Math.ceil((b.y + b.h) * scale)),
})

// The image's pixels inside a box given in PDF points.
export function pixelsIn(img: Pixels, box: Box, scale: number): Rgb[] {
  const { x0, y0, x1, y1 } = rectOf(box, img, scale)
  const out: Rgb[] = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(img.at(x, y))
  return out
}

// Words in the text layer that draw nothing on the page (covered by a shape, or drawn in the colour beneath):
// they must not be published. `scale` converts PDF points to the image's pixels. Null when the render failed.
export function hiddenRuns(runs: readonly Run[], img: Pixels, scale: number): string[] | null {
  const rects = runs.map((r) => rectOf(r.box, img, scale))
  const hidden = new Set<number>()
  const undecided = new Set<number>()
  rects.forEach((rect, i) => {
    const h = runs[i]?.box.h ?? 0
    const others = rects.filter(
      (o, j) =>
        j !== i &&
        (runs[j]?.box.h ?? 0) <= h * SAME_SCALE &&
        o.x0 < rect.x1 &&
        rect.x0 < o.x1 &&
        o.y0 < rect.y1 &&
        rect.y0 < o.y1,
    )
    const free: Rgb[] = []
    for (let y = rect.y0; y < rect.y1; y++)
      for (let x = rect.x0; x < rect.x1; x++)
        if (!others.some((o) => x >= o.x0 && x < o.x1 && y >= o.y0 && y < o.y1)) free.push(img.at(x, y))
    const area = (rect.x1 - rect.x0) * (rect.y1 - rect.y0)
    if (free.length < Math.max(MIN_PIXELS, area * MIN_FREE)) {
      undecided.add(i)
      return
    }
    if (inkless(free)) hidden.add(i)
  })
  // A word too covered by its neighbours to judge is hidden when it continues a hidden word on the same line.
  for (let grew = true; grew;) {
    grew = false
    for (const i of undecided) {
      if (![...hidden].some((j) => continues(runs[i], runs[j]))) continue
      hidden.add(i)
      undecided.delete(i)
      grew = true
    }
  }
  if (hidden.size > runs.length * MAX_HIDDEN) return null
  return [...hidden].sort((a, b) => a - b).flatMap((i) => runs[i]?.id ?? [])
}

const SAME = 0.5
function continues(a: Run | undefined, b: Run | undefined): boolean {
  if (!a || !b) return false
  const gap = Math.max(a.box.x - (b.box.x + b.box.w), b.box.x - (a.box.x + a.box.w))
  // Side by side, never overlapping: a word drawn over another one is not its continuation.
  return Math.abs(a.box.y - b.box.y) < SAME && Math.abs(a.box.h - b.box.h) < SAME && gap >= 0 && gap < b.box.h * SAME
}

// The most frequent colour, quantised to 16 levels per channel, at its bucket's centre.
export function dominant(pixels: readonly Rgb[]): Rgb {
  const counts = new Map<number, number>()
  for (const [r, g, b] of pixels) {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const top = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0])[0]
  return [((top >> 8) & 15) * 16 + 8, ((top >> 4) & 15) * 16 + 8, (top & 15) * 16 + 8]
}
