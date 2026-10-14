import { joinRuns } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, Item, PageStructure, TextValue } from '../model/schema.ts'

// The words a text cites, without those the page does not show; a line-end hyphen before a capital joins
// ("MARILLEN-" + "PALATSCHINKEN"), before a small letter it stays a word break the model may clean.
export function visibleText(t: TextValue, e: Extraction): string {
  if ('seen' in t) return t.seen
  const hidden = new Set(e.hidden)
  const cited = t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1))
  const words = cited.filter((r) => !hidden.has(r.id))
  if (t.text !== undefined && words.length === cited.length) return t.text
  const chunks: Run[][] = [[]]
  words.forEach((r, i) => {
    const prev = words[i - 1]
    if (prev && prev.line !== r.line && /\p{L}-$/u.test(prev.str) && /^\p{Lu}/u.test(r.str)) chunks.push([])
    chunks.at(-1)?.push(r)
  })
  return chunks.map((c) => joinRuns(c)).join('')
}

export function imageBoxes(page: PageStructure): { path: string; box: readonly number[] }[] {
  const out: { path: string; box: readonly number[] }[] = []
  const block = (path: string, b: Block): void => {
    if (b.kind === 'figure') out.push({ path: `${path}.image`, box: b.image.box })
    if (b.kind === 'products')
      b.items.forEach((item, i) => {
        product(`${path}.items[${i}]`, item)
      })
  }
  const product = (path: string, item: Item): void => {
    item.details.forEach((d, i) => {
      block(`${path}.details[${i}]`, d)
    })
    if (item.image) out.push({ path: `${path}.image`, box: item.image.box })
  }
  page.blocks.forEach((b, i) => {
    block(`blocks[${i}]`, b)
  })
  return out
}
