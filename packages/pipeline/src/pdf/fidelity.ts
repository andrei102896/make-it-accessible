import { z } from 'zod'
import type { Box } from './types.ts'

// The printed view measured against the PDF (EXECUTION_PLAN 2.1): two renders of one page at one scale, the
// backdrop as the ground both share; per placed line ink mass, colour and span, outside them differing cells.

export type Image = { width: number; height: number; data: Uint8ClampedArray | readonly number[] }
// `fit`: the width scale (`--k`) and spread (`--lx`, cqw a letter) the stand-in face needed to fill the printed box.
export type LineInput = {
  text: string
  box: Box
  wrapped: boolean
  dark: boolean
  shadowed: boolean
  fit: { k: number; lx: number }
}
export type ScoreInput = {
  p: Image
  s: Image
  g: Image
  lines: LineInput[]
  kept: Box[]
  cellPx: number
  // A pixel whose luminance differs from the ground's by more than this is ink (measured 2026-10-19: resampling
  // and JPEG noise stay under 0.12 at the 90th percentile); a line's box is padded by this share of its height.
  ink: number
  pad: number
}

const Span = z.object({ start: z.number(), end: z.number(), gap: z.number() })
const Line = z.object({
  text: z.string(),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  mass: z.object({ ours: z.number(), pdf: z.number() }),
  colour: z.number().nullable(),
  extent: z.object({ ours: Span.nullable(), pdf: Span.nullable() }).nullable(),
  shadowed: z.boolean(),
  fit: z.object({ k: z.number(), lx: z.number() }),
})
// `pdf`: the PDF's ink in the cell; `ours`: how much the two renders differ there.
const Cell = z.object({ x: z.number(), y: z.number(), pdf: z.number(), ours: z.number() })
export const PageScore = z.object({
  size: z.object({ w: z.number(), h: z.number() }),
  lines: z.array(Line),
  outside: z.object({
    cells: z.number(),
    busy: z.number(),
    pdfOnly: z.number(),
    oursOnly: z.number(),
    worst: z.array(Cell),
  }),
  groundOffset: z.number(),
})
export type PageScore = z.infer<typeof PageScore>

// Self-contained: every helper lives inside, so the function runs as is inside a browser tab (tab.evaluate) and in
// node tests; it names nothing from this module. Ink masks are dilated one pixel against sub-pixel differences.
export function scorePage(input: ScoreInput): PageScore {
  const { p, s, g, lines, kept, cellPx, ink, pad } = input
  const w = Math.min(p.width, s.width, g.width)
  const h = Math.min(p.height, s.height, g.height)
  const MIN_INK = 20
  // Outside text, ink is weighed, not counted: a hairline pdf.js widens to a pixel reads faint in our backdrop
  // (Scotts' page frame, 2026-10-19), so a cell is compared by luminance over a noise floor.
  const FLOOR = 0.04
  // A 4 pt dot at the sheet's scale weighs about 50; a hairline crossing a cell about 15.
  const MIN_CELL = 5
  const BUSY = 0.15
  const lin = (c: number): number => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = (im: Image, x: number, y: number): number => {
    const i = (y * im.width + x) * 4
    return 0.2126 * lin(im.data[i] ?? 0) + 0.7152 * lin(im.data[i + 1] ?? 0) + 0.0722 * lin(im.data[i + 2] ?? 0)
  }
  const rgb = (im: Image, x: number, y: number): [number, number, number] => {
    const i = (y * im.width + x) * 4
    return [im.data[i] ?? 0, im.data[i + 1] ?? 0, im.data[i + 2] ?? 0]
  }
  const clip = (b: Box): Box => {
    const x0 = Math.max(0, Math.floor(b.x))
    const y0 = Math.max(0, Math.floor(b.y))
    return {
      x: x0,
      y: y0,
      w: Math.max(0, Math.min(w, Math.ceil(b.x + b.w)) - x0),
      h: Math.max(0, Math.min(h, Math.ceil(b.y + b.h)) - y0),
    }
  }
  // Ink of a render inside a box: darker (or lighter) than the shared ground by `ink`, then dilated one pixel.
  const maskOf = (im: Image, b: Box, dark: boolean | null): Uint8Array => {
    const raw = new Uint8Array(b.w * b.h)
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const d = lum(im, b.x + x, b.y + y) - lum(g, b.x + x, b.y + y)
        raw[y * b.w + x] = (dark === null ? Math.abs(d) > ink : dark ? d < -ink : d > ink) ? 1 : 0
      }
    const out = new Uint8Array(b.w * b.h)
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        let on = 0
        for (let dy = -1; dy <= 1 && !on; dy++)
          for (let dx = -1; dx <= 1 && !on; dx++) {
            const [xx, yy] = [x + dx, y + dy]
            if (xx >= 0 && yy >= 0 && xx < b.w && yy < b.h && raw[yy * b.w + xx]) on = 1
          }
        out[y * b.w + x] = on
      }
    return out
  }
  const count = (m: Uint8Array): number => m.reduce((n, v) => n + v, 0)
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0
  // A render's own ink colour in a box: the median of the half of its ink pixels farthest from its own ground
  // (the median of its lightest, or darkest, tenth), so two rasterisers' grounds do not count as colour.
  const colourOf = (im: Image, b: Box, m: Uint8Array, dark: boolean): [number, number, number] | null => {
    const lums: number[] = []
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) lums.push(lum(im, b.x + x, b.y + y))
    const sorted = [...lums].sort((a, c) => (dark ? c - a : a - c))
    const ground = median(sorted.slice(0, Math.max(1, Math.floor(sorted.length / 10))))
    const inked: { d: number; c: [number, number, number] }[] = []
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        if (m[y * b.w + x])
          inked.push({ d: Math.abs(lum(im, b.x + x, b.y + y) - ground), c: rgb(im, b.x + x, b.y + y) })
    if (inked.length < MIN_INK) return null
    const far = inked.sort((a, c) => c.d - a.d).slice(0, Math.ceil(inked.length / 2))
    const channel = (k: 0 | 1 | 2): number => median(far.map((v) => v.c[k]))
    return [channel(0), channel(1), channel(2)]
  }
  // Where a line's ink spans its box, in units of the line's height from the box's left: first and last inked
  // column (two pixels or more), and the longest empty run between them.
  const spanOf = (
    m: Uint8Array,
    b: Box,
    unit: number,
    left: number,
  ): { start: number; end: number; gap: number } | null => {
    const cols: boolean[] = []
    for (let x = 0; x < b.w; x++) {
      let n = 0
      for (let y = 0; y < b.h; y++) n += m[y * b.w + x] ?? 0
      cols.push(n >= 2)
    }
    const first = cols.indexOf(true)
    const last = cols.lastIndexOf(true)
    if (first < 0 || unit <= 0) return null
    let gap = 0
    let run = 0
    for (let x = first; x <= last; x++) {
      run = cols[x] ? 0 : run + 1
      gap = Math.max(gap, run)
    }
    return { start: (b.x + first - left) / unit, end: (b.x + last + 1 - left) / unit, gap: gap / unit }
  }
  const padded = (b: Box): Box => ({
    x: b.x - b.h * pad,
    y: b.y - b.h * pad,
    w: b.w + 2 * b.h * pad,
    h: b.h + 2 * b.h * pad,
  })
  const scored = lines.map((l) => {
    const b = clip(padded(l.box))
    const ms = maskOf(s, b, l.dark)
    const mp = maskOf(p, b, l.dark)
    const cs = colourOf(s, b, ms, l.dark)
    const cp = colourOf(p, b, mp, l.dark)
    const colour = cs && cp ? Math.hypot(cs[0] - cp[0], cs[1] - cp[1], cs[2] - cp[2]) / 255 : null
    const extent = l.wrapped ? null : { ours: spanOf(ms, b, l.box.h, l.box.x), pdf: spanOf(mp, b, l.box.h, l.box.x) }
    return {
      text: l.text,
      box: l.box,
      mass: { ours: count(ms), pdf: count(mp) },
      colour,
      extent,
      shadowed: l.shadowed,
      fit: l.fit,
    }
  })
  // Outside every padded line and every word left printed the backdrop is the ground itself, so the two renders
  // are compared directly: a cell differs when the difference weighs half of what the PDF draws there.
  const taken = [...lines.map((l) => padded(l.box)), ...kept]
  const touches = (c: Box): boolean =>
    taken.some((t) => c.x < t.x + t.w && c.x + c.w > t.x && c.y < t.y + t.h && c.y + c.h > t.y)
  // A cell's structure: each pixel's luminance against the cell's own mean, so a flat colour the two rasterisers
  // shade differently (Kenny & Ziggy's panels) weighs nothing, while a dot or a stroke one of them lacks does.
  const structure = (im: Image, c: Box): Float32Array => {
    const out = new Float32Array(c.w * c.h)
    let mean = 0
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) mean += lum(im, c.x + x, c.y + y)
    mean /= Math.max(1, c.w * c.h)
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) out[y * c.w + x] = lum(im, c.x + x, c.y + y) - mean
    return out
  }
  const weigh = (a: Float32Array, b: Float32Array | null): number => {
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += Math.max(0, Math.abs((a[i] ?? 0) - (b ? (b[i] ?? 0) : 0)) - FLOOR)
    return Math.round(sum * 100) / 100
  }
  const rangeOf = (im: Image, c: Box): number => {
    let lo = 1
    let hi = 0
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        const l = lum(im, c.x + x, c.y + y)
        lo = Math.min(lo, l)
        hi = Math.max(hi, l)
      }
    return hi - lo
  }
  const cells: PageScore['outside']['worst'] = []
  let pdfOnly = 0
  let oursOnly = 0
  let busy = 0
  const offsets: number[] = []
  for (let cy = 0; cy < h; cy += cellPx)
    for (let cx = 0; cx < w; cx += cellPx) {
      const c = clip({ x: cx, y: cy, w: cellPx, h: cellPx })
      if (!c.w || !c.h || touches(c)) continue
      // On a busy ground (a photo, a texture) a missing stroke cannot be told from the rasterisers' differences.
      if (rangeOf(g, c) > BUSY) {
        busy++
        continue
      }
      const sp = structure(p, c)
      const ss = structure(s, c)
      const np = weigh(sp, null)
      const ns = weigh(ss, null)
      const diff = weigh(sp, ss)
      if (diff >= Math.max(MIN_CELL, Math.max(np, ns) / 2)) {
        if (np > ns) pdfOnly++
        else oursOnly++
      }
      cells.push({ x: c.x, y: c.y, pdf: np, ours: diff })
      if ((cx / cellPx + cy / cellPx) % 4 === 0) offsets.push(Math.abs(lum(p, c.x, c.y) - lum(g, c.x, c.y)))
    }
  const worst = cells.sort((a, b) => b.ours - a.ours).slice(0, 20)
  return {
    size: { w, h },
    lines: scored,
    outside: { cells: cells.length, busy, pdfOnly, oursOnly, worst },
    groundOffset: median(offsets),
  }
}
