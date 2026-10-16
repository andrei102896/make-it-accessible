import type { PageStructure } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { citedRuns } from './source.ts'

// How a list is set as printed: its items' first lines share a centre (Rucola, Osteria, Ridgway, Frankie's) or a
// right edge (Noah's Tastes) while their left edges wander; a heading printed centred over its list is centred too.
// Measured on 24 documents: 27 centred lists, 3 right-set, 113 left, 52 flowing across columns (left).
export type Align = 'center' | 'right'

// Edges and centres agree within SAME points; left edges that differ by more than WANDER are not a left margin
// (Rucola's centred cheese list wanders 8 pt).
const SAME = 3
const WANDER = 6
const MIN_LINES = 3

const spread = (xs: readonly number[]): number => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
}
const extent = (runs: readonly Run[]): [number, number] => [
  Math.min(...runs.map((r) => r.box.x)),
  Math.max(...runs.map((r) => r.box.x + r.box.w)),
]

// Per block index (lists and the headings over them), the alignment when it is not left.
export function alignmentsOf(page: { structure: PageStructure; extraction: Extraction }): Map<number, Align> {
  const { structure, extraction: e } = page
  const out = new Map<number, Align>()
  let heading = -1
  structure.blocks.forEach((b, i) => {
    if (b.kind === 'heading') heading = i
    if (b.kind !== 'products' && b.kind !== 'list') return
    const firsts = (b.kind === 'products' ? b.items.map((it) => it.name) : b.items).map((t) => citedRuns(e, t)[0])
    // An item's first printed line: every word set on the line its first word sits on (name, price, description).
    const lines = firsts.flatMap((first) => {
      if (!first) return []
      const words = e.runs.filter((r) => r.line === first.line && Math.abs(r.box.y - first.box.y) < SAME)
      return words.length ? [extent(words)] : []
    })
    if (lines.length < MIN_LINES) return
    const left = spread(lines.map((l) => l[0]))
    const centre = spread(lines.map((l) => (l[0] + l[1]) / 2))
    const right = spread(lines.map((l) => l[1]))
    const align: Align | null =
      left <= SAME ? null : left > WANDER && centre <= SAME ? 'center' : left > WANDER && right <= SAME ? 'right' : null
    if (align) out.set(i, align)
    const over = structure.blocks[heading]
    if (heading < 0 || over?.kind !== 'heading') return
    const head = citedRuns(e, over.text)
    if (!head.length) return
    const [h0, h1] = extent(head)
    const x0 = Math.min(...lines.map((l) => l[0]))
    const x1 = Math.max(...lines.map((l) => l[1]))
    // Centred over the list: its middle on the list's middle, its start clear of the list's left margin.
    if (align === 'center' || (Math.abs((h0 + h1) / 2 - (x0 + x1) / 2) <= SAME * 2 && h0 - x0 > WANDER))
      out.set(heading, 'center')
    heading = -1
  })
  return out
}
