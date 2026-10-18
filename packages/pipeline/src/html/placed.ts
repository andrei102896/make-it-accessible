import type { Block, PriceValue, TextValue } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import { fitScale } from '../pdf/raster.ts'
import { turned } from '../pdf/runs.ts'
import type { Box, Extraction, Run, RunFont } from '../pdf/types.ts'
import { inkOn } from './printink.ts'
import { unionOf } from './profile.ts'
import { printFaceOf } from './printface.ts'
import { flaggedAt, inkSegments, lineParts, type Segment } from './source.ts'
import type { HtmlPage } from './types.ts'
import type { FontManifest } from './webfonts.ts'

// The printed view: each leaf of a page (a heading, a dish's name, a price, a picture) placed where it is printed,
// over the page's backdrop, in custom properties that only the printed view reads (the text view ignores them).

// Readable text on its backdrop (WCAG 1.4.3), large text from 24 px or 18.66 px bold at the printed view's narrowest
// width (nothing shrinks below it).
const READABLE = 4.5
const READABLE_LARGE = 3
const LARGE_PX = 24
const LARGE_BOLD_PX = 18.66
// A run's box is about this much taller than its face's size (ascent and descent), when no size is reported.
const BOX_TO_SIZE = 0.8

type Align = 'left' | 'center' | 'right'
type Shadow = Grid['shadows'][string]
type Stroke = Grid['strokes'][string]
type Spot = {
  box: Box
  size: number | null
  lines: number
  align: Align
  color: string | null
  // The ink's printed opacity, and the copy of the words printed under it as their shadow (pdf/backdrop.ts).
  alpha: number
  shadow: Shadow | null
  stroke: Stroke | null
  weight: number
  italic: boolean
  // The face most of its letters are printed in, and their printed letter spacing (ems, pdf/tracking.ts).
  font: RunFont | null
  tracking: number
  // The PDF's own face every word is printed in (pdf/ownfont.ts), when they share one.
  own: string | null
}
type Drawn = Pick<Grid, 'inks' | 'alpha' | 'shadows' | 'strokes' | 'undrawn' | 'tracking' | 'faces'>
const NOTHING_DRAWN: Drawn = { inks: {}, alpha: {}, shadows: {}, strokes: {}, undrawn: [], tracking: {}, faces: {} }

// The page's leaves by the path page.ts gives them, each with what the print shows of it; `drawn`: each word's
// colour as drawn and the words drawn inside a picture (pdf/backdrop.ts); `frames` gets each table's printed box.
export function spotsOf(
  blocks: readonly Block[],
  e: Extraction,
  drawn: Drawn = NOTHING_DRAWN,
  frames = new Map<string, Box>(),
): Map<string, Spot> {
  const pictured = new Set(drawn.undrawn)
  const hidden = new Set(e.hidden)
  const out = new Map<string, Spot>()
  const words = (t: TextValue | PriceValue | undefined): Run[] =>
    !t || 'seen' in t ? [] : t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
  // Text with a word set on its side, or printed inside a picture, has no spot: the print shows it, ours is read.
  const put = (path: string, runs: readonly Run[]): void => {
    if (runs.some((r) => turned(r) || pictured.has(r.id))) return
    const box = unionOf(runs)
    if (box) out.set(path, spotOf(box, runs, drawn))
  }
  const { width, height } = fitScale(e.width, e.height)
  const picture = (path: string, [x, y, w, h]: readonly number[]): void => {
    const [kx, ky] = [e.width / width, e.height / height]
    const box = { x: (x ?? 0) * kx, y: (y ?? 0) * ky, w: (w ?? 0) * kx, h: (h ?? 0) * ky }
    out.set(path, {
      box,
      size: null,
      lines: 1,
      align: 'left',
      color: null,
      alpha: 1,
      shadow: null,
      stroke: null,
      weight: 400,
      italic: false,
      font: null,
      tracking: 0,
      own: null,
    })
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
function spotOf(box: Box, runs: readonly Run[], drawn: Drawn): Spot {
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
  const face = most((r) => (r.font ? faceKey(r.font) : null))
  // A printed shadow or outline the line's most letters carry: one word's (an asterisk's) is not the line's.
  const carried = <T>(of: (r: Run) => T | undefined): T | null => {
    const key = most((r) => JSON.stringify(of(r) ?? null))
    const run = runs.find((r) => JSON.stringify(of(r) ?? null) === key)
    return (run && of(run)) ?? null
  }
  const align = lines.length === 1 ? 'center' : (edges.sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'left')
  return {
    box,
    size,
    lines: lines.length,
    align,
    color: most((r) => drawn.inks[r.id] ?? r.color ?? null),
    alpha: most((r) => drawn.alpha[r.id] ?? 1) ?? 1,
    shadow: carried((r) => drawn.shadows[r.id]),
    stroke: carried((r) => drawn.strokes[r.id]),
    weight: most((r) => r.font?.weight ?? 400) ?? 400,
    italic: most((r) => r.font?.italic ?? false) ?? false,
    font: runs.find((r) => r.font && faceKey(r.font) === face)?.font ?? null,
    tracking: median(runs.map((r) => [drawn.tracking[r.id] ?? 0, r.str.length])),
    own:
      new Set(runs.map((r) => drawn.faces[r.id] ?? null)).size === 1 ? (drawn.faces[runs[0]?.id ?? ''] ?? null) : null,
  }
}
const faceKey = (f: RunFont): string => `${f.key}:${String(f.weight)}:${String(f.italic)}`
// The value half the letters reach, each word weighted by its letters.
const median = (weighted: readonly [number, number][]): number => {
  const sorted = [...weighted].sort((a, b) => a[0] - b[0])
  const half = sorted.reduce((n, [, w]) => n + w, 0) / 2
  let seen = 0
  return sorted.find(([, w]) => (seen += w) >= half)?.[0] ?? 0
}

// A leaf's (or a line's) placement as custom properties, in hundredths of the page width; every property written,
// so a placed line never inherits its leaf's. `pxPerPt`: the page's scale at the printed view's narrowest width.
export function placement(
  spot: Spot,
  pageWidth: number,
  grid: Grid | null,
  pxPerPt: number,
  library: readonly FontManifest[],
): string {
  const u = (v: number): string => String(Math.round((v / pageWidth) * 100_000) / 1000)
  const { box } = spot
  const props = [`--x:${u(box.x)}`, `--y:${u(box.y)}`, `--w:${u(box.w)}`, `--h:${u(box.h)}`]
  const size = spot.size ?? (box.h / spot.lines) * BOX_TO_SIZE
  props.push(`--fs:${u(size)}`, `--lh:${u(box.h / spot.lines)}`)
  props.push(`--ws:${spot.lines === 1 ? 'nowrap' : 'normal'}`, `--ta:${spot.align}`)
  const face = spot.font ? printFaceOf(spot.font, library) : null
  const weight = face?.weight ?? spot.weight
  props.push(`--fw:${String(weight)}`, `--fi:${spot.italic ? 'italic' : 'normal'}`)
  // The PDF's own face first, its stand-in after: fit.ts drops the own face where it lacks a letter of the line.
  const families = [spot.own ? `'${spot.own}'` : null, face?.family ?? null].filter((f) => f !== null)
  if (families.length) props.push(`--ff:${families.join(', ')}`)
  // Letters printed tighter than their face only where large: running text never closes up.
  const large = size * pxPerPt >= LARGE_PX
  props.push(`--ls:${String(spot.tracking < 0 && !large ? 0 : spot.tracking)}`)
  if (spot.color) {
    const readLarge = large || (weight >= 700 && size * pxPerPt >= LARGE_BOLD_PX)
    const { color, shadow } = inkOn(spot, grid, readLarge ? READABLE_LARGE : READABLE, u)
    props.push(`--c:${color}`, `--ts:${shadow}`)
    // The printed outline is centred on the letter's edge with its inner half under the fill, as `paint-order:
    // stroke fill` draws ours: the same width shows the same.
    if (spot.stroke) props.push(`--st:calc(${u(spot.stroke.width)} * 1cqw) ${spot.stroke.color}`)
  }
  return ` style="${props.join(';')}"`
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
export function placer(page: HtmlPage, printPx: number | null, library: readonly FontManifest[]): Placer {
  const e = page.extraction
  const backdrop = page.backdrop ?? null
  const frames = new Map<string, Box>()
  const spots = backdrop ? spotsOf(page.structure.blocks, e, backdrop.grid, frames) : null
  const drawn: Drawn = backdrop?.grid ?? NOTHING_DRAWN
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
      if (spot) return placement(spot, e.width, backdrop?.grid ?? null, pxPerPt, library)
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
          const spot = box ? spotOf(box, p.runs, drawn) : null
          const style = spot ? placement(spot, e.width, backdrop?.grid ?? null, pxPerPt, library) : ''
          return `<span class="pl"${style}>${html(p.segments)}${p === last ? tail : ''}</span>`
        })
        .join('')
    },
  }
}
