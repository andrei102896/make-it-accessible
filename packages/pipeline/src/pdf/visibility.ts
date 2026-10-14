import type { Rgb } from '../html/color.ts'
import type { Pixels } from './pixels.ts'
import type { Run } from './types.ts'

// A word is judged on the part of its box no other word covers: at least this share and this many pixels.
const MIN_FREE = 0.3
const MIN_PIXELS = 20
// Visible text puts ink in its box: pixels this far (per channel) from the box's dominant colour.
export const INK_DIFF = 24
const MIN_INK = 0.005
// More than this share of a page hidden means the render failed, not that the publisher hid the text.
const MAX_HIDDEN = 0.5

type Rect = { x0: number; y0: number; x1: number; y1: number }

// Words in the text layer that draw nothing on the page (covered by a shape, or drawn in the colour beneath):
// they must not be published. `scale` converts PDF points to the image's pixels.
export function hiddenRuns(runs: readonly Run[], img: Pixels, scale: number): string[] {
  const rects: Rect[] = runs.map((r) => ({
    x0: Math.max(0, Math.floor(r.box.x * scale)),
    y0: Math.max(0, Math.floor(r.box.y * scale)),
    x1: Math.min(img.width, Math.ceil((r.box.x + r.box.w) * scale)),
    y1: Math.min(img.height, Math.ceil((r.box.y + r.box.h) * scale)),
  }))
  const hidden = new Set<number>()
  const undecided = new Set<number>()
  rects.forEach((rect, i) => {
    const others = rects.filter(
      (o, j) => j !== i && o.x0 < rect.x1 && rect.x0 < o.x1 && o.y0 < rect.y1 && rect.y0 < o.y1,
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
    const ground = dominant(free)
    const ink = free.filter((c) => c.some((v, ch) => Math.abs(v - (ground[ch] ?? 0)) > INK_DIFF)).length
    if (ink < free.length * MIN_INK) hidden.add(i)
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
  if (hidden.size > runs.length * MAX_HIDDEN) return []
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
