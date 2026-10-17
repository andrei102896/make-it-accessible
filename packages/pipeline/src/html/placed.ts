import type { Block, PriceValue, TextValue } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import { fitScale } from '../pdf/raster.ts'
import { turned } from '../pdf/runs.ts'
import type { Box, Extraction, Run } from '../pdf/types.ts'
import { fromHex, grayOf, hex, luminance, readableOn } from './color.ts'
import { unionOf } from './profile.ts'
import { flaggedAt, inkSegments, lineParts, type Segment } from './source.ts'
import type { HtmlPage } from './types.ts'

// The printed view: each leaf of a page (a heading, a dish's name, a price, a picture) placed where it is printed,
// over the page's backdrop, in custom properties that only the printed view reads (the text view ignores them).

// Readable text on its backdrop (WCAG 1.4.3), large text from 24 px or 18.66 px bold at the printed view's narrowest
// width (nothing shrinks below it). MID: the luminance as far from black as from white in contrast terms.
const READABLE = 4.5
const READABLE_LARGE = 3
const LARGE_PX = 24
const LARGE_BOLD_PX = 18.66
const MID = 0.179
// A backdrop this even under a box (luminance spread) is flat: its ink can move instead of taking a halo.
const FLAT = 0.08
// A run's box is about this much taller than its face's size (ascent and descent), when no size is reported.
const BOX_TO_SIZE = 0.8

type Align = 'left' | 'center' | 'right'
type Spot = {
  box: Box
  size: number | null
  lines: number
  align: Align
  color: string | null
  weight: number
  italic: boolean
}

// The page's leaves by the path page.ts gives them, each with what the print shows of it; `inks`: each word's
// colour as drawn (pdf/backdrop.ts inksOf), over the text layer's; `frames` gets each table's printed box.
export function spotsOf(
  blocks: readonly Block[],
  e: Extraction,
  inks: Readonly<Record<string, string>> = {},
  frames = new Map<string, Box>(),
): Map<string, Spot> {
  const hidden = new Set(e.hidden)
  const out = new Map<string, Spot>()
  const words = (t: TextValue | PriceValue | undefined): Run[] =>
    !t || 'seen' in t ? [] : t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
  // Text with a word set on its side has no spot: it stays printed in the backdrop, ours is read (source.ts).
  const put = (path: string, runs: readonly Run[]): void => {
    if (runs.some(turned)) return
    const box = unionOf(runs)
    if (box) out.set(path, spotOf(box, runs, inks))
  }
  const { width, height } = fitScale(e.width, e.height)
  const picture = (path: string, [x, y, w, h]: readonly number[]): void => {
    const [kx, ky] = [e.width / width, e.height / height]
    const box = { x: (x ?? 0) * kx, y: (y ?? 0) * ky, w: (w ?? 0) * kx, h: (h ?? 0) * ky }
    out.set(path, { box, size: null, lines: 1, align: 'left', color: null, weight: 400, italic: false })
  }
  const block = (path: string, b: Block): void => {
    if (b.kind === 'heading' || b.kind === 'paragraph') put(path, words(b.text))
    else if (b.kind === 'list')
      b.items.forEach((t, j) => {
        put(`${path}.items[${String(j)}]`, words(t))
      })
    else if (b.kind === 'figure') picture(`${path}.image`, b.image.box)
    else if (b.kind === 'table') {
      // The table is a frame at its printed box, each cell's text and price placed in it as printed.
      const all = [
        ...words(b.caption),
        ...b.rows.flat().flatMap((c) => [...words(c.text), ...(c.prices ?? []).flatMap(priced)]),
      ]
      const box = unionOf(all)
      if (box) frames.set(path, box)
      put(`${path}.caption`, words(b.caption))
      b.rows.forEach((row, r) => {
        row.forEach((c, k) => {
          const at = `${path}.rows[${String(r)}][${String(k)}]`
          put(at, words(c.text))
          ;(c.prices ?? []).forEach((p, i) => {
            price(`${at}.prices[${String(i)}]`, p)
          })
        })
      })
    } else
      b.items.forEach((item, k) => {
        const at = `${path}.items[${String(k)}]`
        put(`${at}.name`, words(item.name))
        item.prices.forEach((p, m) => {
          price(`${at}.prices[${String(m)}]`, p)
        })
        put(`${at}.unit`, words(item.unit))
        item.details.forEach((d, i) => {
          block(`${at}.details[${String(i)}]`, d)
        })
        if (item.image) picture(`${at}.image`, item.image.box)
      })
  }
  const priced = (p: PriceValue): Run[] => [...words(p), ...words(p.qualifier)]
  // A price as one spot, and its amount and printed label each where it is printed ("Single" far from its 4).
  const price = (path: string, p: PriceValue): void => {
    put(path, priced(p))
    put(`${path}.amount`, words(p))
    put(`${path}.qualifier`, words(p.qualifier))
  }
  blocks.forEach((b, i) => {
    block(`blocks[${String(i)}]`, b)
  })
  return out
}

// What most of the words show (by letters): the leaf's size, colour and face. One line is centred on its printed
// box, so a lookalike face's different width spreads to both sides; lines share the edge the print aligns.
function spotOf(box: Box, runs: readonly Run[], inks: Readonly<Record<string, string>>): Spot {
  const most = <T>(value: (r: Run) => T): T | null => {
    const tally = new Map<T, number>()
    for (const r of runs) tally.set(value(r), (tally.get(value(r)) ?? 0) + r.str.length)
    return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const size = most((r) => r.font?.size ?? null)
  const lines = [...Map.groupBy(runs, (r) => `${String(r.flow)}:${String(r.line)}`).values()].flatMap((l) => {
    const b = unionOf(l)
    return b ? [b] : []
  })
  const spread = (edge: (b: Box) => number): number => Math.max(...lines.map(edge)) - Math.min(...lines.map(edge))
  const edges: [Align, number][] = [
    ['left', spread((b) => b.x)],
    ['center', spread((b) => b.x + b.w / 2)],
    ['right', spread((b) => b.x + b.w)],
  ]
  const align = lines.length === 1 ? 'center' : (edges.sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'left')
  return {
    box,
    size,
    lines: lines.length,
    align,
    color: most((r) => inks[r.id] ?? r.color ?? null),
    weight: most((r) => r.font?.weight ?? 400) ?? 400,
    italic: most((r) => r.font?.italic ?? false) ?? false,
  }
}

// A leaf's (or a line's) placement as custom properties, in hundredths of the page width; every property written,
// so a placed line never inherits its leaf's. `pxPerPt`: the page's scale at the printed view's narrowest width.
export function placement(spot: Spot, pageWidth: number, grid: Grid | null, pxPerPt: number): string {
  const u = (v: number): string => String(Math.round((v / pageWidth) * 100_000) / 1000)
  const { box } = spot
  const props = [`--x:${u(box.x)}`, `--y:${u(box.y)}`, `--w:${u(box.w)}`, `--h:${u(box.h)}`]
  const size = spot.size ?? (box.h / spot.lines) * BOX_TO_SIZE
  props.push(`--fs:${u(size)}`, `--lh:${u(box.h / spot.lines)}`)
  props.push(`--ws:${spot.lines === 1 ? 'nowrap' : 'normal'}`, `--ta:${spot.align}`)
  props.push(`--fw:${String(spot.weight)}`, `--fi:${spot.italic ? 'italic' : 'normal'}`)
  if (spot.color) {
    const large = size * pxPerPt >= LARGE_PX || (spot.weight >= 700 && size * pxPerPt >= LARGE_BOLD_PX)
    const { color, halo } = inkOn(spot.color, box, grid, large ? READABLE_LARGE : READABLE)
    props.push(`--c:${color}`, `--halo:${halo ?? 'transparent'}`)
  }
  return ` style="${props.join(';')}"`
}

// The printed ink where it reads on the backdrop under its box. On a flat backdrop a failing ink keeps its hue and
// moves in lightness; where the backdrop varies (a photo, a pattern), the ink stays and gets a halo.
function inkOn(color: string, box: Box, grid: Grid | null, target: number): { color: string; halo: string | null } {
  const cells: number[] = []
  const [c0, c1] = grid ? [Math.floor(box.x / grid.cell), Math.floor((box.x + box.w) / grid.cell)] : [0, -1]
  const [r0, r1] = grid ? [Math.floor(box.y / grid.cell), Math.floor((box.y + box.h) / grid.cell)] : [0, -1]
  if (grid)
    for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) cells.push(r * grid.cols + c)
  if (!grid || !cells.length) return { color, halo: null }
  const lo = Math.min(...cells.map((i) => grid.min[i] ?? 0))
  const hi = Math.max(...cells.map((i) => grid.max[i] ?? 1))
  const ink = luminance(fromHex(color))
  const ratio = (l: number): number => (Math.max(ink, l) + 0.05) / (Math.min(ink, l) + 0.05)
  if (Math.min(ratio(lo), ratio(hi)) >= target) return { color, halo: null }
  const moved = hi - lo <= FLAT ? readableOn(fromHex(color), grayOf((lo + hi) / 2), target) : null
  if (moved) return { color: hex(moved), halo: null }
  return { color, halo: ink < MID ? '#fff' : '#000' }
}

export type Placer = {
  // The attributes that place a leaf: its spot, ` data-pl` when its lines are placed instead, ` data-free` when it
  // has no printed spot (read, not shown), nothing inside a placed table or without a backdrop.
  place: (path: string) => string
  // A leaf's text as one placed span per printed line (the gaps between lines as shown), the tail (diet codes)
  // in the last; null when it stays whole: one printed line, a link across lines, or text not following its runs.
  lined: (
    path: string,
    t: TextValue,
    shown: string,
    html: (s: readonly Segment[]) => string,
    tail?: string,
  ) => string | null
  // Whether a price's amount and label are placed each on its own (both have a printed spot); then the price is not.
  apart: (path: string) => boolean
  // ` data-free` on a page in the printed view (text inside a placed leaf that the print does not show there).
  free: string
}
export function placer(page: HtmlPage, printPx: number | null): Placer {
  const e = page.extraction
  const backdrop = page.backdrop ?? null
  const frames = new Map<string, Box>()
  const spots = backdrop ? spotsOf(page.structure.blocks, e, backdrop.grid.inks, frames) : null
  const pxPerPt = (printPx ?? e.width) / e.width
  const split = new Set<string>()
  return {
    free: spots ? ' data-free' : '',
    place: (path) => {
      if (!spots) return ''
      if (split.has(path)) return ' data-pl'
      // Text in doubt (a validator finding) shows as printed: the backdrop keeps it, ours is read (source.ts).
      if (flaggedAt(path, page.flagged)) return ' data-free'
      const frame = frames.get(path)
      const u = (v: number): string => String(Math.round((v / e.width) * 100_000) / 1000)
      if (frame)
        return ` data-frame style="--tx:${u(frame.x)};--ty:${u(frame.y)};--tw:${u(frame.w)};--th:${u(frame.h)}"`
      const spot = spots.get(path)
      if (spot) return placement(spot, e.width, backdrop?.grid ?? null, pxPerPt)
      return [...spots.keys()].some((k) => path.startsWith(`${k}.`)) ? '' : ' data-free'
    },
    apart: (path) => {
      const both =
        spots?.has(`${path}.amount`) === true && spots.has(`${path}.qualifier`) && !flaggedAt(path, page.flagged)
      if (both) split.add(path)
      return both
    },
    lined: (path, t, shown, html, tail = '') => {
      if (!spots?.has(path) || flaggedAt(path, page.flagged)) return null
      const parts = lineParts(t, e, shown)
      const lines = parts?.flatMap((p) => ('runs' in p ? [p] : [])) ?? []
      // Split only where every link stays whole on one line: the text view must keep the same links.
      const links = (h: string): string[] => h.match(/<a [^>]*>.*?<\/a>/g) ?? []
      const whole = links(html(inkSegments(t, e, shown))).join()
      if (!parts || lines.flatMap((l) => links(html(l.segments))).join() !== whole) return null
      split.add(path)
      const last = lines.at(-1)
      return parts
        .map((p) => {
          if (!('runs' in p)) return p.gap
          const box = unionOf(p.runs)
          const spot = box ? spotOf(box, p.runs, backdrop?.grid.inks ?? {}) : null
          const style = spot ? placement(spot, e.width, backdrop?.grid ?? null, pxPerPt) : ''
          return `<span class="pl"${style}>${html(p.segments)}${p === last ? tail : ''}</span>`
        })
        .join('')
    },
  }
}
