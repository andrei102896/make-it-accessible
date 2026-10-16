import { iou } from '../pdf/geometry.ts'
import { fitScale } from '../pdf/raster.ts'
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
  const chunks: Run[][] = [[]]
  words.forEach((r, i) => {
    const prev = words[i - 1]
    if (prev && prev.line !== r.line && /\p{L}-$/u.test(prev.str) && /^\p{Lu}/u.test(r.str)) chunks.push([])
    chunks.at(-1)?.push(r)
  })
  // A currency sign set tight against a word ("for£3.50") gets the space a reader expects.
  const printed = chunks
    .map((c) => joinRuns(c))
    .join('')
    .replace(/(\p{L})([£$€])/gu, '$1 $2')
  // The model's text stands in for a broken text layer ("Truf e"), never for the printed case ("RAW BAR").
  const recased = t.text !== undefined && t.text.toLowerCase() === printed.toLowerCase()
  return t.text !== undefined && words.length === cited.length && !recased ? t.text : printed
}

// Every run index a product cites: name, prices with their conditions, unit and details.
function citations(item: Item): number[] {
  const out: number[] = []
  const add = (t: TextValue | undefined): void => {
    if (t && 'src' in t) for (const [from, to] of t.src) for (let i = from; i <= to; i++) out.push(i)
  }
  const block = (b: Block): void => {
    if (b.kind === 'heading' || b.kind === 'paragraph') add(b.text)
    if (b.kind === 'list') b.items.forEach(add)
    if (b.kind === 'table') {
      add(b.caption)
      b.rows.flat().forEach((cell) => {
        add(cell.text)
        cell.prices?.forEach((p) => {
          add({ src: p.src })
          add(p.qualifier)
        })
      })
    }
    if (b.kind === 'products') b.items.forEach((i) => out.push(...citations(i)))
  }
  add(item.name)
  item.prices.forEach((p) => {
    add({ src: p.src })
    add(p.qualifier)
  })
  add(item.unit)
  item.details.forEach(block)
  return out
}

// Every picture of a page with the runs its own product cites (none for a figure).
export function imageBoxes(page: PageStructure): { path: string; box: readonly number[]; own: number[] }[] {
  const out: { path: string; box: readonly number[]; own: number[] }[] = []
  const block = (path: string, b: Block): void => {
    if (b.kind === 'figure') out.push({ path: `${path}.image`, box: b.image.box, own: [] })
    if (b.kind === 'products')
      b.items.forEach((item, i) => {
        product(`${path}.items[${i}]`, item)
      })
  }
  const product = (path: string, item: Item): void => {
    item.details.forEach((d, i) => {
      block(`${path}.details[${i}]`, d)
    })
    if (item.image) out.push({ path: `${path}.image`, box: item.image.box, own: citations(item) })
  }
  page.blocks.forEach((b, i) => {
    block(`blocks[${i}]`, b)
  })
  return out
}

// Figures printed in the same place on another page too (a running drawing, a logo): page furniture, per page the
// paths of those figures.
const RUNNING_OVERLAP = 0.5
export function runningFigures(pages: readonly { structure: PageStructure; extraction: Extraction }[]): Set<string>[] {
  const figures = pages.map(({ structure, extraction }) => {
    const { width, height } = fitScale(extraction.width, extraction.height)
    return structure.blocks.flatMap((b, i) => {
      if (b.kind !== 'figure') return []
      const [x, y, w, h] = b.image.box
      return [{ path: `blocks[${String(i)}].image`, box: { x: x / width, y: y / height, w: w / width, h: h / height } }]
    })
  })
  return figures.map(
    (own, p) =>
      new Set(
        own
          .filter((f) => figures.some((other, q) => q !== p && other.some((o) => iou(o.box, f.box) >= RUNNING_OVERLAP)))
          .map((f) => f.path),
      ),
  )
}

// Each list or paragraph of the pages as its visible lines (where a printed legend can be found).
export const textBlocks = (pages: readonly { structure: PageStructure; extraction: Extraction }[]): string[][] =>
  pages.flatMap((p) =>
    p.structure.blocks.flatMap((b) =>
      b.kind === 'list'
        ? [b.items.map((t) => visibleText(t, p.extraction))]
        : b.kind === 'paragraph'
          ? [[visibleText(b.text, p.extraction)]]
          : [],
    ),
  )

// The lists a note describes when it names the heading it sits under ("TEA TIME SET MENU: two courses £31.90…"):
// every list since that heading, as the note prices the whole section; null when it names no heading above it.
export function headedLists(blocks: readonly Block[], note: number, raw: (t: TextValue) => string): number[] | null {
  const letters = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const said = letters(raw(blocks[note]?.kind === 'paragraph' ? blocks[note].text : { seen: '-' }))
  for (let h = note - 1; h >= 0; h--) {
    const b = blocks[h]
    if (b?.kind !== 'heading') continue
    const name = letters(raw(b.text))
    if (!name || !said.startsWith(name)) continue
    const lists = blocks.flatMap((x, i) => (i > h && i < note && x.kind === 'products' ? [i] : []))
    return lists.length ? lists : null
  }
  return null
}
