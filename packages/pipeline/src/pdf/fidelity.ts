import type { Box } from './types.ts'
import type { Image, PageScore, ScoreInput } from './fidelity-types.ts'

// The printed view measured against the PDF (EXECUTION_PLAN 2.1): two renders of one page at one scale, the
// backdrop as the ground both share; per placed line ink mass, colour and span (outside them: fidelity-outside.ts).

// Self-contained: every helper lives inside, so the function runs as is inside a browser tab (tab.evaluate) and in
// node tests; it names nothing from this module. Ink masks are dilated one pixel against sub-pixel differences.
export function scorePage(input: ScoreInput): Pick<PageScore, 'size' | 'lines'> {
  const { p, s, g, n, lines, ink, pad } = input
  const w = Math.min(p.width, s.width, g.width)
  const h = Math.min(p.height, s.height, g.height)
  const MIN_INK = 20
  const lin = (c: number): number => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lumOf = ([r, g, b]: readonly number[]): number =>
    0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0)
  const rgb = (im: Image, x: number, y: number): [number, number, number] => {
    const i = (y * im.width + x) * 4
    return [im.data[i] ?? 0, im.data[i + 1] ?? 0, im.data[i + 2] ?? 0]
  }
  const lum = (im: Image, x: number, y: number): number => lumOf(rgb(im, x, y))
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
  const count = (m: Uint8Array): number => m.reduce((n, v) => n + v, 0)
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0
  // Ink of a render inside a box: farther from its ground than `ink`, either way (a dark glow round light text).
  const rawOf = (im: Image, b: Box, ground: (x: number, y: number) => number): Uint8Array => {
    const raw = new Uint8Array(b.w * b.h)
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        raw[y * b.w + x] = Math.abs(lum(im, b.x + x, b.y + y) - ground(b.x + x, b.y + y)) > ink ? 1 : 0
    return raw
  }
  // Every pixel within `r` (a square) of a set one.
  const dilate = (m: Uint8Array, b: Box, r: number): Uint8Array => {
    const rows = new Uint8Array(m.length)
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        for (let dx = -r; dx <= r && !rows[y * b.w + x]; dx++)
          if (x + dx >= 0 && x + dx < b.w && m[y * b.w + x + dx]) rows[y * b.w + x] = 1
    const out = new Uint8Array(m.length)
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        for (let dy = -r; dy <= r && !out[y * b.w + x]; dy++)
          if (y + dy >= 0 && y + dy < b.h && rows[(y + dy) * b.w + x]) out[y * b.w + x] = 1
    return out
  }
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
  // A line's ink span in line heights from its box's left: first and last column inked twice or more over its own
  // rows (`top`, `rows`: a neighbour's ink stays out), and the longest empty run between them.
  const spanOf = (m: Uint8Array, b: Box, top: number, rows: number, unit: number, left: number) => {
    const cols: boolean[] = []
    for (let x = 0; x < b.w; x++) {
      let n = 0
      for (let y = top; y < top + rows; y++) n += m[y * b.w + x] ?? 0
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
  const centreY = (m: Uint8Array, b: Box): number | null => {
    let n = 0
    let sum = 0
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        if (m[y * b.w + x]) {
          n++
          sum += y
        }
    return n < MIN_INK ? null : sum / n
  }
  const padded = (b: Box): Box => ({
    x: b.x - b.h * pad,
    y: b.y - b.h * pad,
    w: b.w + 2 * b.h * pad,
    h: b.h + 2 * b.h * pad,
  })
  const ofG = (x: number, y: number): number => lum(g, x, y)
  const scored = lines.map((l) => {
    const b = clip(padded(l.box))
    const core = clip(l.box)
    const [top, rows] = [Math.max(0, core.y - b.y), Math.min(core.h, b.y + b.h - core.y)]
    // The median of |P − G| over one strip of the padding (a side of the rim).
    const strip = (x0: number, y0: number, x1: number, y1: number): number => {
      const d: number[] = []
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d.push(Math.abs(lum(p, x, y) - lum(g, x, y)))
      return median(d)
    }
    const rim = Math.max(
      strip(b.x, b.y, b.x + b.w, core.y),
      strip(b.x, core.y + core.h, b.x + b.w, b.y + b.h),
      strip(b.x, core.y, core.x, core.y + core.h),
      strip(core.x + core.w, core.y, b.x + b.w, core.y + core.h),
    )
    const pg: number[] = []
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) pg.push(lum(p, b.x + x, b.y + y))
    const own = median(pg)
    const rs = rawOf(s, b, ofG)
    const rp = rawOf(p, b, rim > ink ? () => own : ofG)
    const ms = dilate(rs, b, 1)
    const mp = dilate(rp, b, 1)
    const gl: number[] = []
    for (let y = 0; y < core.h; y++) for (let x = 0; x < core.w; x++) gl.push(lum(g, core.x + x, core.y + y))
    const dark =
      l.ink === null || lumOf([1, 3, 5].map((i) => parseInt(l.ink?.slice(i, i + 2) ?? '0', 16))) <= median(gl)
    const cs = colourOf(s, b, ms, dark)
    const cp = colourOf(p, b, mp, dark)
    const colour = cs && cp ? Math.hypot(cs[0] - cp[0], cs[1] - cp[1], cs[2] - cp[2]) / 255 : null
    const onRows = (m: Uint8Array): number => m.slice(top * b.w, (top + rows) * b.w).reduce((k, v) => k + v, 0)
    const gm = median(gl)
    const at = (im: Image, i: number): number => lum(im, b.x + (i % b.w), b.y + Math.floor(i / b.w))
    // A pixel on the line's own rows: a neighbour's ink in the padding, at full strength, stays out of shape and contrast.
    const mine = (i: number): boolean => i >= top * b.w && i < (top + rows) * b.w
    // How far a render inks past the ground, toward the line's ink (a halo in the ground's colour adds nothing).
    const inkAt = (im: Image, i: number): number => Math.max(0, dark ? at(g, i) - at(im, i) : at(im, i) - at(g, i))
    // The ink's column and row profiles: their shape, not their weight, is compared (a bolder stand-in scales them).
    const profiles = (im: Image): [number[], number[]] => {
      const cols = new Array<number>(b.w).fill(0)
      const rowsOf = new Array<number>(b.h).fill(0)
      for (let i = top * b.w; i < (top + rows) * b.w; i++) {
        const v = inkAt(im, i)
        cols[i % b.w] = (cols[i % b.w] ?? 0) + v
        rowsOf[Math.floor(i / b.w)] = (rowsOf[Math.floor(i / b.w)] ?? 0) + v
      }
      return [cols, rowsOf.slice(top, top + rows)]
    }
    const pearson = (a: number[], c: number[]): number => {
      const ma = a.reduce((x, y) => x + y, 0) / a.length
      const mc = c.reduce((x, y) => x + y, 0) / c.length
      let num = 0
      let va = 0
      let vc = 0
      a.forEach((v, k) => {
        num += (v - ma) * ((c[k] ?? 0) - mc)
        va += (v - ma) ** 2
        vc += ((c[k] ?? 0) - mc) ** 2
      })
      return va && vc ? num / Math.sqrt(va * vc) : 0
    }
    // The far half of a mask's distances from its ground, its median.
    const reach = (im: Image, m: Uint8Array, ground: number): number | null => {
      const d: number[] = []
      m.forEach((v, i) => {
        if (v && mine(i)) d.push(Math.abs(at(im, i) - ground))
      })
      return d.length < MIN_INK ? null : median(d.sort((a, c) => c - a).slice(0, Math.ceil(d.length / 2)))
    }
    const pdfReach = reach(p, rp, rim > ink ? own : gm)
    let excess: number | null = null
    let effect: number | null = null
    let darker: number | null = null
    if (l.effect && n && rim <= ink) {
      const rn = rawOf(n, b, ofG)
      // Ours past both our bare letters and the print: a real shadow stays within the print, a halo adds nothing.
      const [withFx, bare, printed] = [onRows(ms), onRows(dilate(rn, b, 1)), onRows(mp)]
      excess = printed ? (withFx - Math.max(bare, printed)) / printed : null
      const [pc, pr] = profiles(p)
      const like = (im: Image): number => {
        const [c, r] = profiles(im)
        return (pearson(c, pc) + pearson(r, pr)) / 2
      }
      effect = like(s) - like(n)
      const [reachFx, reachBare] = [reach(s, rs, gm), reach(n, rn, gm)]
      if (reachFx !== null && reachBare !== null && pdfReach)
        darker = (Math.abs(reachFx - pdfReach) - Math.abs(reachBare - pdfReach)) / pdfReach
    }
    const ourReach = reach(s, rs, gm)
    // Too little ink of ours to weigh (a lone bracket) is left to the line's mass on its rows.
    const contrast = pdfReach === null || ourReach === null ? null : ourReach / Math.max(1e-6, pdfReach)
    const [ys, yp] = [centreY(ms, b), centreY(mp, b)]
    const extent = l.wrapped
      ? null
      : { ours: spanOf(ms, b, top, rows, l.box.h, l.box.x), pdf: spanOf(mp, b, top, rows, l.box.h, l.box.x) }
    return {
      text: l.text,
      box: l.box,
      em: l.em,
      price: l.price,
      mass: { ours: count(ms), pdf: count(mp) },
      core: { ours: onRows(ms), pdf: onRows(mp) },
      rim: Math.round(rim * 1000) / 1000,
      effect,
      darker,
      excess,
      contrast,
      dy: ys === null || yp === null ? null : (ys - yp) / l.box.h,
      colour,
      extent,
      shadowed: l.shadowed,
      fit: l.fit,
    }
  })
  return { size: { w, h }, lines: scored }
}
