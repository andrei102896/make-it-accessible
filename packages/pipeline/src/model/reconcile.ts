import { z } from 'zod'
import type { Extraction } from '../pdf/types.ts'
import { modelTextAccepted } from '../validate/validate.ts'
import type { PageStructure } from './schema.ts'

const Ranges = z.array(z.tuple([z.number(), z.number()]))

// The model's structure squared with the text layer before it is judged or drawn; its answer stays saved as given.
// A text read whole but cited one run short ("WATERLOO PL ACE DRINK S" without its "MENU", a layer's "Beverage" +
// "s") takes the next run of its line when nothing else cites it and the readings then agree.
export function reconciled(page: PageStructure, e: Extraction): PageStructure {
  const out = structuredClone(page)
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
