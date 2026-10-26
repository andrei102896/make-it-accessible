import { z } from 'zod'
import { amountOf, asPrinted, joinRuns } from '../pdf/runs.ts'
import type { Extraction } from '../pdf/types.ts'
import { modelTextAccepted } from '../validate/validate.ts'
import type { Block, PageStructure, PriceValue } from './schema.ts'

const Ranges = z.array(z.tuple([z.number(), z.number()]))

// The model's structure squared with the text layer before it is judged or drawn; its answer stays saved as given.
// A text read whole but cited one run short ("WATERLOO PL ACE DRINK S" without its "MENU", a layer's "Beverage" +
// "s") takes the next run of its line when nothing else cites it and the readings then agree.
export function reconciled(page: PageStructure, e: Extraction): PageStructure {
  const out = structuredClone(page)
  unlabelled(out.blocks, e)
  const hidden = new Set(e.hidden)
  const cited = new Set<number>()
  const texts: { node: { src: unknown }; text: string }[] = []
  const cite = (ranges: readonly (readonly [number, number])[]): void => {
    for (const [from, to] of ranges) for (let i = from; i <= to; i++) cited.add(i)
  }
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visit)
      return
    }
    if (typeof v !== 'object' || v === null) return
    if ('src' in v) {
      const ranges = Ranges.safeParse(v.src)
      if (ranges.success) cite(ranges.data)
      if (ranges.success && 'text' in v && typeof v.text === 'string') texts.push({ node: v, text: v.text })
    }
    Object.values(v).forEach(visit)
  }
  visit(out.blocks)
  cite(out.dropped)
  for (const { node, text } of texts) {
    const ranges = Ranges.parse(node.src)
    const last = ranges.at(-1)
    const end = last ? e.runs[last[1]] : undefined
    const next = last ? e.runs[last[1] + 1] : undefined
    if (!last || !end || !next || hidden.has(next.id) || cited.has(last[1] + 1)) continue
    if (next.flow !== end.flow || next.line !== end.line) continue
    const words = ranges.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
    if (modelTextAccepted(text, words) || !modelTextAccepted(text, [...words, next])) continue
    node.src = [...ranges.slice(0, -1), [last[0], last[1] + 1]]
    cited.add(last[1] + 1)
  }
  return out
}

// A label citing only its price's words, inside the price shown as printed ("£12/125ml," labelled "125ml"), repeats
// them; a formatted amount shows less than it cites, so its label stays ("Bowl" of "Bowl 8").
function unlabelled(blocks: readonly Block[], e: Extraction): void {
  for (const b of blocks) {
    if (b.kind === 'products')
      for (const item of b.items) {
        for (const p of item.prices) dropRepeat(p, e)
        item.prices = once(item.prices)
        unlabelled(item.details, e)
      }
    if (b.kind === 'table')
      for (const cell of b.rows.flat()) {
        for (const p of cell.prices ?? []) dropRepeat(p, e)
        if (cell.prices) cell.prices = once(cell.prices)
      }
  }
}
// The same price given twice, words, role and label alike (Snow City "6" ×2), is one; any difference stays an error.
const once = (prices: PriceValue[]): PriceValue[] =>
  prices.filter((p, i) => prices.findIndex((q) => JSON.stringify(q) === JSON.stringify(p)) === i)
function dropRepeat(p: PriceValue, e: Extraction): void {
  const q = p.qualifier
  if (!q || !('src' in q)) return
  const ids = (src: readonly (readonly [number, number])[]): number[] =>
    src.flatMap(([from, to]) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i))
  const own = new Set(ids(p.src))
  if (!ids(q.src).every((i) => own.has(i))) return
  const runs = [...own].flatMap((i) => e.runs[i] ?? [])
  const printed = amountOf(runs) === null ? asPrinted(runs) : null
  const label = (q.text ?? joinRuns(ids(q.src).flatMap((i) => e.runs[i] ?? []))).trim().toLowerCase()
  if (label && printed?.toLowerCase().includes(label)) delete p.qualifier
}
