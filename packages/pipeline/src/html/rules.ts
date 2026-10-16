import type { HeadingRule } from './brand.ts'
import { hex, type Rgb } from './color.ts'
import type { Pixels } from '../pdf/pixels.ts'
import type { Box } from '../pdf/types.ts'

// Lines the document draws: a rule under a heading, a hairline between dishes. Read from the page render, as the
// text layer has none. Boxes are in PDF points, `k` is render pixels per point.
export type Rule = { width: number; center: number; color: string }

// A channel this far from the page colour is ink; a line is at most this many pixels thick.
const INK = 64
export const MAX_THICK = 3
// Searched below a heading for up to this many of its heights.
export const REACH = 1.5

export const isInk = (c: Rgb, bg: Rgb): boolean => Math.max(...c.map((v, i) => Math.abs(v - (bg[i] ?? 0)))) > INK

// The longest unbroken run of ink on a pixel row between x0 and x1.
function longestRun(img: Pixels, y: number, x0: number, x1: number, bg: Rgb): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null
  let start = -1
  for (let x = x0; x <= x1 + 1; x++) {
    const ink = x <= x1 && isInk(img.at(x, y), bg)
    if (ink && start < 0) start = x
    if (!ink && start >= 0) {
      if (!best || x - 1 - start > best.to - best.from) best = { from: start, to: x - 1 }
      start = -1
    }
  }
  return best
}

// A horizontal line of ink at least `minWidth` pixels long, between rows y0 and y1, no thicker than MAX_THICK.
function lineIn(img: Pixels, y0: number, y1: number, x0: number, x1: number, minWidth: number, bg: Rgb) {
  for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) {
    const run = longestRun(img, y, Math.max(0, x0), Math.min(img.width - 1, x1), bg)
    if (!run || run.to - run.from < minWidth) continue
    let thick = 1
    while (
      thick <= MAX_THICK &&
      y + thick < img.height &&
      (longestRun(img, y + thick, run.from, run.to, bg)?.to ?? 0) - run.from >= minWidth
    )
      thick++
    if (thick <= MAX_THICK) return { y, ...run }
    y += thick
  }
  return null
}

// The unbroken run of ink on a pixel row through column x; null when x is not ink.
function runThrough(img: Pixels, y: number, x: number, bg: Rgb): { from: number; to: number } | null {
  if (!isInk(img.at(x, y), bg)) return null
  let from = x
  let to = x
  while (from > 0 && isInk(img.at(from - 1, y), bg)) from--
  while (to < img.width - 1 && isInk(img.at(to + 1, y), bg)) to++
  return { from, to }
}

// The rule printed right under a heading and through its middle (a neighbouring column's rule at the same height
// is not its own), as a share of the page width and the centre's share; null when none.
export function ruleBelow(img: Pixels, k: number, box: Box, pageWidth: number, bg: Rgb): Rule | null {
  const top = Math.max(0, Math.round((box.y + box.h) * k) + 1)
  const bottom = Math.min(img.height - 1, Math.round((box.y + box.h * (1 + REACH)) * k))
  const cx = Math.min(img.width - 1, Math.max(0, Math.round((box.x + box.w / 2) * k)))
  const minWidth = Math.max(box.w * k * 0.5, 12)
  for (let y = top; y <= bottom; y++) {
    const run = runThrough(img, y, cx, bg)
    if (!run || run.to - run.from < minWidth) continue
    let thick = 1
    while (
      thick <= MAX_THICK &&
      y + thick < img.height &&
      (runThrough(img, y + thick, cx, bg)?.to ?? 0) - run.from >= minWidth
    )
      thick++
    if (thick > MAX_THICK) {
      y += thick
      continue
    }
    return {
      width: (run.to - run.from) / k / pageWidth,
      center: (run.from + run.to) / 2 / k / pageWidth,
      color: hex(img.at(cx, y)),
    }
  }
  return null
}

// A hairline between two stacked items of a list, at least half as wide as them.
export function lineBetween(img: Pixels, k: number, upper: Box, lower: Box, bg: Rgb): boolean {
  const x0 = Math.round(Math.min(upper.x, lower.x) * k)
  const x1 = Math.round(Math.max(upper.x + upper.w, lower.x + lower.w) * k)
  const y0 = Math.round((upper.y + upper.h) * k) + 1
  const y1 = Math.round(lower.y * k) - 1
  return y1 > y0 && lineIn(img, y0, y1, x0, x1, (x1 - x0) / 2, bg) !== null
}

// A rule at least this many times its heading's width spans its column: full width on the one-column page.
const FULL = 3
// A heading is centred over its rule when their centres differ by less than this share of the page width.
export const CENTRED = 0.03
// Dishes are divided when at least this share of the gaps between stacked dishes holds a line.
const DIVIDED = 0.3

export type Found = { sig: number; rule: Rule | null; center: number; width: number }

// Per signature, the rule most of its headings carry (median width and offset, most frequent colour); null when
// fewer than half carry one.
export function signatureRules(found: readonly Found[], signatures: number): (HeadingRule | null)[] {
  const mid = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
  return Array.from({ length: signatures }, (_, sig) => {
    const mine = found.filter((f) => f.sig === sig)
    const ruled = mine.flatMap((f) =>
      f.rule ? [{ ...f.rule, offset: Math.abs(f.rule.center - f.center), heading: f.width }] : [],
    )
    if (!mine.length || ruled.length * 2 < mine.length) return null
    const count = (c: string): number => ruled.filter((r) => r.color === c).length
    const width = mid(ruled.map((r) => r.width))
    return {
      width,
      full: width >= FULL * mid(ruled.map((r) => r.heading)),
      centered: mid(ruled.map((r) => r.offset)) < CENTRED,
      color: [...ruled].sort((a, b) => count(b.color) - count(a.color))[0]?.color ?? '#000000',
    }
  })
}

export const divided = (gaps: number, lines: number): boolean | null => (gaps ? lines / gaps >= DIVIDED : null)
