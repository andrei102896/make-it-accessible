import type { Box } from './types.ts'
import type { Image, PageScore, ScoreInput } from './fidelity-types.ts'

// Outside every placed line, picture and word left printed (fidelity.ts measures the lines): cells whose structure
// differs between the PDF and our sheet. Self-contained like scorePage: it runs as is in a browser tab.
export function scoreOutside(input: ScoreInput): Pick<PageScore, 'outside' | 'groundOffset'> {
  const { p, s, g, lines, kept, cellPx, pad } = input
  const w = Math.min(p.width, s.width, g.width)
  const h = Math.min(p.height, s.height, g.height)
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
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0
  const padded = (b: Box): Box => ({
    x: b.x - b.h * pad,
    y: b.y - b.h * pad,
    w: b.w + 2 * b.h * pad,
    h: b.h + 2 * b.h * pad,
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
  const lacking = new Set<string>()
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
        if (np > ns) {
          pdfOnly++
          lacking.add(`${String(cx / cellPx)},${String(cy / cellPx)}`)
        } else oursOnly++
      }
      cells.push({ x: c.x, y: c.y, pdf: np, ours: diff })
      if ((cx / cellPx + cy / cellPx) % 4 === 0) offsets.push(Math.abs(lum(p, c.x, c.y) - lum(g, c.x, c.y)))
    }
  const worst = cells.sort((a, b) => b.ours - a.ours).slice(0, 20)
  // Cells "col,row" that touch side by side, the largest such group's size.
  function largestGroup(set: Set<string>): number {
    const seen = new Set<string>()
    let most = 0
    for (const start of set) {
      if (seen.has(start)) continue
      const todo = [start]
      seen.add(start)
      let n = 0
      for (let at = todo.pop(); at !== undefined; at = todo.pop()) {
        n++
        const [c = 0, r = 0] = at.split(',').map(Number)
        for (const next of [
          `${String(c + 1)},${String(r)}`,
          `${String(c - 1)},${String(r)}`,
          `${String(c)},${String(r + 1)}`,
          `${String(c)},${String(r - 1)}`,
        ])
          if (set.has(next) && !seen.has(next)) {
            seen.add(next)
            todo.push(next)
          }
      }
      most = Math.max(most, n)
    }
    return most
  }
  return {
    outside: { cells: cells.length, busy, pdfOnly, oursOnly, cluster: largestGroup(lacking), worst },
    groundOffset: median(offsets),
  }
}
