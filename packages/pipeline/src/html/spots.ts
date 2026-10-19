import type { Block, PriceValue, TextValue } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import { faceKey } from '../pdf/face.ts'
import { fitScale } from '../pdf/raster.ts'
import { turned } from '../pdf/runs.ts'
import type { Box, Extraction, Run, RunFont } from '../pdf/types.ts'
import { inlinesOf, type Inline } from './printink.ts'
import { unionOf } from './profile.ts'

// The printed view's spots: what the print shows of each leaf of a page (its box, lines, ink, face, baseline), read
// from the text layer and the backdrop's measurements; placed.ts writes them as custom properties.

type Align = 'left' | 'center' | 'right'
type Shadow = Grid['shadows'][string]
type Stroke = Grid['strokes'][string]
export type Spot = {
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
  // Its lowercase letters as a share of its letters and digits (a lookalike's size blends by it, placed.ts).
  lowercase: number
  // The PDF's own face every word is printed in (pdf/ownfont.ts), when they share one.
  own: string | null
  // Its first line's printed baseline (pt from the page's top): fit.ts sets ours on it.
  baseline: number | null
  // Its words in another brand ink, shown in it where it reads (printink.ts).
  inline: Inline[]
}
export type Drawn = Pick<
  Grid,
  'inks' | 'alpha' | 'shadows' | 'strokes' | 'undrawn' | 'kept' | 'tracking' | 'faces' | 'baselines' | 'ends'
>
export const NOTHING_DRAWN: Drawn = {
  inks: {},
  alpha: {},
  shadows: {},
  strokes: {},
  undrawn: [],
  kept: [],
  tracking: {},
  faces: {},
  baselines: {},
  ends: {},
}

// The page's leaves by the path page.ts gives them, each with what the print shows of it; `drawn`: each word's
// colour as drawn and the words drawn inside a picture (pdf/backdrop.ts); `frames` gets each table's printed box.
export function spotsOf(
  blocks: readonly Block[],
  e: Extraction,
  drawn: Drawn = NOTHING_DRAWN,
  frames = new Map<string, Box>(),
  inks: ReadonlySet<string> = new Set(),
): Map<string, Spot> {
  const pictured = new Set([...drawn.undrawn, ...drawn.kept])
  const hidden = new Set(e.hidden)
  const out = new Map<string, Spot>()
  // A word's box ends where its letters do (a tab read into it would stretch its line: `drawn.ends`).
  const trimmed = (r: Run): Run => {
    const end = drawn.ends[r.id]
    return end === undefined ? r : { ...r, box: { ...r.box, w: end - r.box.x } }
  }
  const words = (t: TextValue | PriceValue | undefined): Run[] =>
    !t || 'seen' in t
      ? []
      : t.src
          .flatMap(([from, to]) => e.runs.slice(from, to + 1))
          .filter((r) => !hidden.has(r.id))
          .map(trimmed)
  // Text with a word set on its side, printed inside a picture or kept as printed has no spot: ours is read.
  const put = (path: string, runs: readonly Run[]): void => {
    if (runs.some((r) => turned(r) || pictured.has(r.id))) return
    const box = unionOf(runs)
    if (box) out.set(path, spotOf(box, runs, drawn, inks))
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
      lowercase: 0,
      own: null,
      baseline: null,
      inline: [],
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
  const heads = new Set<string>()
  // A price as one spot, and its amount and printed label each where it is printed ("Single" far from its 4). A
  // column head shared by several prices is placed once; the others read it (Scotts' "Bottle", drawn 3 times).
  const price = (path: string, p: PriceValue): void => {
    const label = words(p.qualifier)
    const head = label.map((r) => r.id).join()
    if (head && heads.has(head)) {
      put(`${path}.amount`, words(p))
      return
    }
    if (head) heads.add(head)
    put(path, priced(p))
    put(`${path}.amount`, words(p))
    put(`${path}.qualifier`, label)
  }
  blocks.forEach((b, i) => {
    block(`blocks[${String(i)}]`, b)
  })
  return out
}

// What most of the words show (by letters): the leaf's size, colour and face. One line is centred on its printed
// box, so a lookalike face's different width spreads to both sides; lines share the edge the print aligns.
export function spotOf(box: Box, all: readonly Run[], drawn: Drawn, inks: ReadonlySet<string>): Spot {
  // An icon's words (pdf/icons.ts) have no glyphs: they shape the box, never the line's ink, face or size.
  const runs = all.filter((r) => !r.icon)
  const most = <T>(value: (r: Run) => T, among = runs): T | null => {
    const tally = new Map<T, number>()
    for (const r of among) tally.set(value(r), (tally.get(value(r)) ?? 0) + r.str.length)
    return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const size = most((r) => r.font?.size ?? null)
  // Lines are counted over every word: a leaf of icon words alone still has its one line.
  const lines = [...Map.groupBy(all, (r) => `${String(r.flow)}:${String(r.line)}`).values()].flatMap((l) => {
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
  // The first line's words with a printed baseline, each weighted by its letters.
  const lead = runs[0]
  const first = runs.flatMap((r) => {
    const b = drawn.baselines[r.id]
    return lead && r.flow === lead.flow && r.line === lead.line && b !== undefined
      ? [[b, r.str.length] satisfies [number, number]]
      : []
  })
  const align = lines.length === 1 ? 'center' : (edges.sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'left')
  // The line's ink is its unmarked words' when some words carry their own (Almond's red "Micky's" before "Ramen").
  const plain = runs.filter((r) => r.color === undefined || !inks.has(r.color))
  const color = most((r) => drawn.inks[r.id] ?? r.color ?? null, plain.length ? plain : runs)
  return {
    box,
    size,
    lines: lines.length,
    align,
    color,
    alpha: most((r) => drawn.alpha[r.id] ?? 1) ?? 1,
    shadow: carried((r) => drawn.shadows[r.id]),
    stroke: carried((r) => drawn.strokes[r.id]),
    weight: most((r) => r.font?.weight ?? 400) ?? 400,
    italic: most((r) => r.font?.italic ?? false) ?? false,
    font: runs.find((r) => r.font && faceKey(r.font) === face)?.font ?? null,
    tracking: median(runs.map((r) => [drawn.tracking[r.id] ?? 0, r.str.length])),
    lowercase: lowercaseShare(runs.map((r) => r.str).join('')),
    own:
      new Set(runs.map((r) => drawn.faces[r.id] ?? null)).size === 1 ? (drawn.faces[runs[0]?.id ?? ''] ?? null) : null,
    baseline: first.length ? median(first) : null,
    inline: inlinesOf(runs, drawn, inks, color),
  }
}
const lowercaseShare = (text: string): number => {
  const all = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0
  return all ? (text.match(/\p{Ll}/gu)?.length ?? 0) / all : 0
}
// The value half the letters reach, each word weighted by its letters.
const median = (weighted: readonly [number, number][]): number => {
  const sorted = [...weighted].sort((a, b) => a[0] - b[0])
  const half = sorted.reduce((n, [, w]) => n + w, 0) / 2
  let seen = 0
  return sorted.find(([, w]) => (seen += w) >= half)?.[0] ?? 0
}
