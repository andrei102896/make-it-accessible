import { norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyPageV3, ManualV3 } from './key-schema-v3.ts'
import { loose } from './score/text.ts'

// Writers choose manual and product ids; occurrence ids come from the frozen ledger and need no matching.
export type Pairs = Map<string, string>

const overlap = (x: ManualV3, y: ManualV3): number => {
  if (x.source === 'image' || y.source === 'image') {
    if (!x.box || !y.box) return 0
    const w = Math.min(x.box.x + x.box.w, y.box.x + y.box.w) - Math.max(x.box.x, y.box.x)
    const h = Math.min(x.box.y + x.box.h, y.box.y + y.box.h) - Math.max(x.box.y, y.box.y)
    return w > 0 && h > 0 ? w * h : 0
  }
  return x.words.filter((i) => y.words.includes(i)).length
}

// Manual entries pair by place (shared words, or overlapping boxes), never by value, so a value
// disagreement shows as one difference instead of two unmatched entries.
export function pairManual(a: KeyPageV3, b: KeyPageV3): Pairs {
  const pairs: Pairs = new Map()
  const free = new Set(Object.keys(b.manual))
  for (const [ida, ma] of Object.entries(a.manual)) {
    let best: string | undefined
    let score: [number, number] = [0, 0]
    for (const idb of free) {
      const mb = b.manual[idb]
      if (!mb) continue
      // Equal cents only break a tie between entries that share as much of the place.
      const s: [number, number] = [overlap(ma, mb), mb.cents === ma.cents ? 1 : 0]
      if (s[0] > 0 && (s[0] > score[0] || (s[0] === score[0] && s[1] > score[1]))) [best, score] = [idb, s]
    }
    if (best !== undefined) {
      pairs.set(ida, best)
      free.delete(best)
    }
  }
  return pairs
}

export const invert = (p: Pairs): Pairs => new Map([...p].map(([x, y]) => [y, x]))

// b's claim ids in a's namespace; an unpaired manual entry keeps a name that cannot collide.
export function claimIdsInA(manual: Pairs): (id: string) => string {
  const fromB = invert(manual)
  return (id) => (id.startsWith('m') ? (fromB.get(id) ?? `b:${id}`) : id)
}

function claimSets(page: KeyPageV3, name: (id: string) => string): Map<string, string> {
  const sets = new Map<string, string[]>()
  for (const [id, c] of Object.entries(page.occurrences))
    if (c.kind === 'price') sets.set(c.product, [...(sets.get(c.product) ?? []), name(id)])
  return new Map([...sets].map(([p, ids]) => [p, ids.sort().join(',')]))
}

// Products pair by the amounts claimed for them; a product without amounts by its anchor and paired parent.
export function pairProducts(a: KeyPageV3, b: KeyPageV3, toA: (id: string) => string): Pairs {
  const setsA = claimSets(a, (id) => id)
  const setsB = claimSets(b, toA)
  const pairs: Pairs = new Map()
  const taken = new Set<string>()
  const take = (x: string, y: string): void => {
    pairs.set(x, y)
    taken.add(y)
  }
  for (const [pa, set] of setsA) {
    const pb = [...setsB].find(([p, s]) => s === set && !taken.has(p))?.[0]
    if (pb !== undefined) take(pa, pb)
  }
  // Writers who disagree on one amount's product still name the same product: pair the largest overlap.
  for (const [pa, set] of setsA) {
    if (pairs.has(pa)) continue
    const own = set.split(',')
    let best: string | undefined
    let shared = 0
    for (const [pb, s] of setsB) {
      const n = taken.has(pb) ? 0 : s.split(',').filter((id) => own.includes(id)).length
      if (n > shared) [best, shared] = [pb, n]
    }
    if (best !== undefined) take(pa, best)
  }
  // Parents before children, so a child's parent is already paired; one pass per nesting level.
  for (let level = 0; level < 4; level++)
    for (const x of a.products) {
      if (pairs.has(x.id) || setsA.has(x.id)) continue
      const parent = x.parent === undefined ? undefined : pairs.get(x.parent)
      if (x.parent !== undefined && parent === undefined) continue
      const y = b.products.find(
        (p) => !taken.has(p.id) && !setsB.has(p.id) && loose(p.anchor) === loose(x.anchor) && p.parent === parent,
      )
      if (y) take(x.id, y.id)
    }
  return pairs
}

function claimedCells(page: KeyPageV3, name: (id: string) => string): Map<number, Set<string>> {
  const cells = new Map<number, Set<string>>()
  for (const [id, c] of Object.entries(page.occurrences))
    if (c.kind === 'cell') cells.set(c.table, (cells.get(c.table) ?? new Set()).add(name(id)))
  return cells
}

// Tables pair by the amounts claimed in their cells, as the scorer pairs them by content (key order is not scored);
// a table without claimed amounts by its header.
export function pairTables(a: KeyPageV3, b: KeyPageV3, toA: (id: string) => string): Map<number, number> {
  const cellsA = claimedCells(a, (id) => id)
  const cellsB = claimedCells(b, toA)
  const pairs = new Map<number, number>()
  const free = new Set(b.tables.keys())
  const header = (t: { header: string[] }): string => t.header.map(norm).join('|')
  a.tables.forEach((t, i) => {
    const own = cellsA.get(i) ?? new Set<string>()
    let best: number | undefined
    let shared = 0
    for (const j of free) {
      const n = [...(cellsB.get(j) ?? [])].filter((id) => own.has(id)).length
      if (n > shared) [best, shared] = [j, n]
    }
    // Without claimed amounts: the same header, else the same place, so a column swap reads as a header difference.
    if (best === undefined && !own.size) {
      const unclaimed = [...free].filter((j) => !cellsB.has(j))
      best = unclaimed.find((j) => b.tables[j] && header(b.tables[j]) === header(t)) ?? unclaimed.find((j) => j === i)
    }
    if (best === undefined) return
    pairs.set(i, best)
    free.delete(best)
  })
  return pairs
}
