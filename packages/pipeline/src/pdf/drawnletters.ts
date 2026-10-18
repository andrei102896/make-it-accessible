import { fromHex } from '../html/color.ts'
import { paints } from './art.ts'
import { attr, boxOf, colourOf, type Drawn, type Glyph } from './svg.ts'
import type { Box, Run } from './types.ts'

// A letter its font subset lacks, drawn as shapes beside the word (Kenny & Ziggy's p05: the H of "Hungarian", "HITS"
// and "THE", three rectangles after three spaces): the word as read lacks a letter the page shows.

// Measured on the set (2026-10-18): drawn letters (K&Z's three H's, La Segunda's ".99" after a "3") stand 0.03–0.08
// of the word's box height away, on the baseline (≤ 0.06 pt off), 0.5–0.6 tall; K&Z's nav stars 0.20–0.24 away.
const TALL: [number, number] = [0.4, 1.3]
const WIDE = 1.2
const GAP = 0.12
const ON_BASELINE = 0.1
const SAME_INK = 3
// A shape a word's box covers this much of is under the word, not beside it (as in pdf/icons.ts).
const UNDER_WORD = 0.2

type Piece = { box: Box; ink: string }

// The ids of words with a shape in their own ink standing on their baseline against their left or right edge.
export function lettersDrawnBeside(art: readonly Drawn[], glyphs: readonly Glyph[], words: readonly Run[]): string[] {
  const pieces = art.flatMap((d): Piece[] => {
    const points = d.subpaths.flatMap((s) => s.points)
    const ink = colourOf(attr(d.tag, 'fill'))
    const box = points.length ? clipped(boxOf(points), d.clip) : null
    return !d.masked && ink && box && paints(d.tag) ? [{ box, ink }] : []
  })
  const under = (p: Box): boolean =>
    words.some((w) => across(w.box, p) > p.w * UNDER_WORD && overlap(w.box, p) > p.h * UNDER_WORD)
  return words
    .filter((w) => {
      const { box: b, color } = w
      const baseline = color ? baselineOf(b, glyphs) : null
      if (!color || baseline === null) return false
      return pieces.some(({ box: p, ink }) => {
        const gap = Math.max(b.x - p.x - p.w, p.x - b.x - b.w)
        return (
          sameInk(ink, color) &&
          p.h >= b.h * TALL[0] &&
          p.h <= b.h * TALL[1] &&
          p.w <= b.h * WIDE &&
          gap >= 0 &&
          gap <= b.h * GAP &&
          Math.abs(p.y + p.h - baseline) <= b.h * ON_BASELINE &&
          !under(p)
        )
      })
    })
    .map((w) => w.id)
}

const across = (a: Box, b: Box): number => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
const overlap = (a: Box, b: Box): number => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)

function clipped(b: Box, clip: Box | null): Box | null {
  if (!clip) return b
  const x = Math.max(b.x, clip.x)
  const y = Math.max(b.y, clip.y)
  const w = Math.min(b.x + b.w, clip.x + clip.w) - x
  const h = Math.min(b.y + b.h, clip.y + clip.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

// The median baseline of the glyphs drawn inside a word's box.
function baselineOf(b: Box, glyphs: readonly Glyph[]): number | null {
  const ys = glyphs
    .filter(({ at: [x, y] }) => x >= b.x && x < b.x + b.w && y >= b.y && y <= b.y + b.h)
    .map(({ at }) => at[1])
    .sort((a, c) => a - c)
  return ys[ys.length >> 1] ?? null
}

const sameInk = (a: string, b: string): boolean => {
  const [x, y] = [fromHex(a), fromHex(b)]
  return x.every((v, i) => Math.abs(v - (y[i] ?? 0)) <= SAME_INK)
}
