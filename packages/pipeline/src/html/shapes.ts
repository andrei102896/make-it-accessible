import type { Item, PageStructure } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { unionOf } from './profile.ts'
import { citedRuns } from './source.ts'

// A menu list's printed shape: `wide` when it prints one dish per line (items stacked, the median item at least
// WIDE_ITEM of the page), `runOn` when most descriptions start on the name's own line.
export type ListShape = { wide: boolean; runOn: boolean }
const WIDE_ITEM = 0.5

export const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

// The shape of each top-level menu list (block index) from where its items are printed.
export function shapesOf(page: { structure: PageStructure; extraction: Extraction }): Map<number, ListShape> {
  const { structure, extraction: e } = page
  const out = new Map<number, ListShape>()
  structure.blocks.forEach((b, i) => {
    if (b.kind !== 'products' || b.items.some((it) => it.image)) return
    const paragraphs = (it: Item): Run[] =>
      it.details.flatMap((d) => (d.kind === 'paragraph' ? citedRuns(e, d.text) : []))
    const boxes = b.items.flatMap((it) => {
      const box = unionOf([
        ...citedRuns(e, it.name),
        ...it.prices.flatMap((p) => citedRuns(e, { src: p.src })),
        ...paragraphs(it),
      ])
      return box ? [box] : []
    })
    const stacked = boxes.every((box, k) => k === 0 || box.y > (boxes[k - 1]?.y ?? 0))
    const wide = boxes.length > 0 && stacked && median(boxes.map((box) => box.w / e.width)) >= WIDE_ITEM
    let described = 0
    let onLine = 0
    for (const it of b.items) {
      const name = citedRuns(e, it.name).at(-1)
      const first = paragraphs(it)[0]
      if (!name || !first) continue
      described++
      const sameLine = first.box.y < name.box.y + name.box.h && first.box.y + first.box.h > name.box.y
      if (sameLine && first.box.x >= name.box.x + name.box.w - 1) onLine++
    }
    out.set(i, { wide, runOn: described > 0 && onLine * 2 > described })
  })
  return out
}
