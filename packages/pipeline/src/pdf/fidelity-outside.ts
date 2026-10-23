import type { Box } from './types.ts'
import type { Image, PageScore, ScoreInput } from './fidelity-types.ts'

// The page as shown against the PDF drawn by pdf.js, words set at an angle aside: each render's ink, over the page
// and per horizontal band, so a faded page or a strip left blank shows. Self-contained: it runs in a browser tab.
export function scoreOutside(input: ScoreInput): PageScore {
  const { p, s, kept, cellPx } = input
  const w = Math.min(p.width, s.width)
  const h = Math.min(p.height, s.height)
  // A pixel within this of its cell's ground is ground: resampling noise stays under it.
  const FLOOR = 0.04
  const BANDS = 8
  const lin = (c: number): number => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = (im: Image, x: number, y: number): number => {
    const i = (y * im.width + x) * 4
    return 0.2126 * lin(im.data[i] ?? 0) + 0.7152 * lin(im.data[i + 1] ?? 0) + 0.0722 * lin(im.data[i + 2] ?? 0)
  }
  const touches = (c: Box): boolean =>
    kept.some((t) => c.x < t.x + t.w && c.x + c.w > t.x && c.y < t.y + t.h && c.y + c.h > t.y)
  // A cell's ink: how far its pixels stand from its median (its own ground, dark or light: Carew's white on navy),
  // past the noise floor (Poppler drew Brawn's thin face at 0.81 of pdf.js' ink, 2026-10-23).
  const inkOf = (im: Image, c: Box): number => {
    const ls: number[] = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) ls.push(lum(im, c.x + x, c.y + y))
    const ground = [...ls].sort((a, b) => a - b)[ls.length >> 1] ?? 0
    return ls.reduce((sum, l) => sum + Math.max(0, Math.abs(l - ground) - FLOOR), 0)
  }
  const bands = Array.from({ length: BANDS }, () => ({ pdf: 0, ours: 0 }))
  for (let cy = 0; cy < h; cy += cellPx)
    for (let cx = 0; cx < w; cx += cellPx) {
      // Whole pixels: a cell's edges fall between them at a fractional cell size.
      const [x0, y0] = [Math.floor(cx), Math.floor(cy)]
      const c = {
        x: x0,
        y: y0,
        w: Math.min(w, Math.floor(cx + cellPx)) - x0,
        h: Math.min(h, Math.floor(cy + cellPx)) - y0,
      }
      if (touches(c)) continue
      const band = bands[Math.min(BANDS - 1, Math.floor((cy / h) * BANDS))]
      if (!band) continue
      band.pdf += inkOf(p, c)
      band.ours += inkOf(s, c)
    }
  const round = (b: { pdf: number; ours: number }): { pdf: number; ours: number } => ({
    pdf: Math.round(b.pdf),
    ours: Math.round(b.ours),
  })
  const sum = bands.reduce((t, b) => ({ pdf: t.pdf + b.pdf, ours: t.ours + b.ours }), { pdf: 0, ours: 0 })
  return { size: { w: s.width, h: s.height }, ink: round(sum), bands: bands.map(round) }
}
