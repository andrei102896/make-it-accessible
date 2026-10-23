import type { Block, PriceValue, TextValue } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import { fitScale } from '../pdf/raster.ts'
import { turned } from '../pdf/runs.ts'
import type { Box, Extraction, Run } from '../pdf/types.ts'
import { unionOf } from './profile.ts'

// The printed view's spots: where the print shows each leaf of a page (its box, lines, size) and how its ink reads
// there, from the text layer and the backdrop's measurements; placed.ts writes them as custom properties.

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
  // The weight most of its letters are printed in: bold text is large from 18.66 px (WCAG 1.4.3, placed.ts).
  weight: number
}
export type Drawn = Pick<Grid, 'inks' | 'alpha' | 'shadows' | 'strokes' | 'undrawn' | 'kept' | 'ends'>
export const NOTHING_DRAWN: Drawn = { inks: {}, alpha: {}, shadows: {}, strokes: {}, undrawn: [], kept: [], ends: {} }

// A word's box ends where its letters do (a tab read into it would stretch its line: `drawn.ends`).
export const trimmedRun = (r: Run, drawn: Pick<Drawn, 'ends'>): Run => {
  const end = drawn.ends[r.id]
  return end === undefined ? r : { ...r, box: { ...r.box, w: end - r.box.x } }
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
  const trimmed = (r: Run): Run => trimmedRun(r, drawn)
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

// What most of the words show (by letters): the leaf's size and colour. One line is centred on its printed box, so
// our text's other width spreads to both sides; lines share the edge the print aligns.
export function spotOf(box: Box, all: readonly Run[], drawn: Drawn, inks: ReadonlySet<string>): Spot {
  // An icon's words (pdf/icons.ts) have no glyphs: they shape the box, never the line's ink or size.
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
  // A printed shadow or outline the line's most letters carry: one word's (an asterisk's) is not the line's.
  const carried = <T>(of: (r: Run) => T | undefined): T | null => {
    const key = most((r) => JSON.stringify(of(r) ?? null))
    const run = runs.find((r) => JSON.stringify(of(r) ?? null) === key)
    return (run && of(run)) ?? null
  }
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
  }
}
