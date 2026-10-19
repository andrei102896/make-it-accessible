import type { Block, Item, PageStructure } from '../model/schema.ts'
import type { Box, Extraction } from '../pdf/types.ts'
import type { Finding } from './validate.ts'

// One principle, no layout assumed: a menu places every dish's parts the same way (price beside, under or in a
// column; description under the name), so giving two dishes each other's prices or details cannot make the page
// clearly more coherent. Distances are between a part's words and the dish name's words: horizontal box gap, and
// the distance between line centres weighted ROW (word boxes of adjacent lines touch, centres do not).
// Fixed on the working set (2026-10-19) and judged on the verification set (docs/EXECUTION_PLAN.md).
const ROW = 4
// A swap is suspect when it costs less than the kept placement by this factor, less half a line (text-relative).
const CLEAR = 1.5

type Part = { boxes: Box[] }
type Dish = { path: string; name: Box[]; price: Box[]; detail: Box[] }

const cy = (b: Box): number => b.y + b.h / 2
const gapX = (a: Box, b: Box): number => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w))
const near = (a: Box, b: Box): number => Math.hypot(gapX(a, b), ROW * Math.abs(cy(a) - cy(b)))
// A part's cost at a dish: each of its words to the dish name's nearest word.
const cost = (part: Part['boxes'], name: readonly Box[]): number =>
  part.reduce((n, p) => n + Math.min(...name.map((b) => near(p, b))), 0)

function boxes(e: Extraction, value: unknown): Box[] {
  const out: Box[] = []
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object' && v !== null)
      for (const [k, x] of Object.entries(v))
        if (k === 'src' && Array.isArray(x)) {
          for (const r of x)
            if (Array.isArray(r)) for (const run of e.runs.slice(Number(r[0]), Number(r[1]) + 1)) out.push(run.box)
        } else walk(x)
  }
  walk(value)
  return out
}

function dishesOf(blocks: readonly Block[], path: string, e: Extraction): Dish[] {
  return blocks.flatMap((b, i) => {
    if (b.kind !== 'products') return []
    return b.items.flatMap((item: Item, j) => {
      const here = `${path}[${String(i)}].items[${String(j)}]`
      const details = item.details.filter((d) => d.kind !== 'products')
      return [
        {
          path: here,
          name: boxes(e, item.name),
          price: boxes(
            e,
            item.prices.map((p) => ({ src: p.src })),
          ),
          detail: boxes(e, details),
        },
        ...dishesOf(item.details, `${here}.details`, e),
      ]
    })
  })
}

// The pairs of dishes whose prices (or details) the page's own geometry says belong to each other.
export function consistencyFindings(page: PageStructure, e: Extraction): Finding[] {
  const dishes = dishesOf(page.blocks, 'blocks', e).filter((d) => d.name.length)
  const line = median(dishes.flatMap((d) => d.name.map((b) => b.h)))
  const out: Finding[] = []
  for (const part of ['price', 'detail'] as const) {
    const has = dishes.filter((d) => d[part].length)
    for (let a = 0; a < has.length; a++)
      for (let b = a + 1; b < has.length; b++) {
        const [x, y] = [has[a], has[b]]
        if (!x || !y) continue
        const kept = cost(x[part], x.name) + cost(y[part], y.name)
        const swapped = cost(x[part], y.name) + cost(y[part], x.name)
        if (swapped * CLEAR + line / 2 < kept)
          out.push({ path: x.path, problem: `the ${part} printed beside ${y.path} fits it better than its own` })
      }
  }
  return out
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] ?? 0
}
