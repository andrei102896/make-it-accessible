import {
  parsePage,
  type Block,
  type Item,
  type PageStructure,
  type Range,
} from '@make-it-accessible/pipeline/model/schema'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'

// Content defects a diner would be misled by, injected into a page's structure; each keeps every word covered (a
// swap, or the words it orphans added to `dropped`), so a gate can only catch it by checking the defect itself.
export const DEFECTS = [
  'price-swap',
  'price-shift',
  'price-role',
  'qualifier-swap',
  'cell-price-swap',
  'name-swap',
  'heading-swap',
  'detail-move',
  'item-move',
  'drop-detail',
  'drop-item',
  'drop-paragraph',
  'icon-swap',
] as const
export type Defect = (typeof DEFECTS)[number]
export type Mutant = { type: Defect; paths: string[]; structure: PageStructure }

type At = { path: string; item: Item; block: Extract<Block, { kind: 'products' }>; index: number }

// Every products item of the page, nested ones too, in document order.
function itemsOf(blocks: readonly Block[], path: string): At[] {
  return blocks.flatMap((b, i) => {
    const here = `${path}[${String(i)}]`
    if (b.kind !== 'products') return []
    return b.items.flatMap((item, j) => [
      { path: `${here}.items[${String(j)}]`, item, block: b, index: j },
      ...itemsOf(item.details, `${here}.items[${String(j)}].details`),
    ])
  })
}

// Every cited range inside a value (its words), for what a removal orphans.
function rangesIn(value: unknown): Range[] {
  if (Array.isArray(value)) return value.flatMap(rangesIn)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([k, v]) =>
    k === 'src' && Array.isArray(v) ? v.filter((r): r is Range => Array.isArray(r) && r.length === 2) : rangesIn(v),
  )
}

const words = (e: Extraction, src: readonly Range[]): string =>
  src.flatMap(([a, b]) => e.runs.slice(a, b + 1).map((r) => r.str)).join(' ')

// Up to `per` of each defect on one page, picked by `pick` (a seeded choice, so a run repeats); null-safe re-parse.
export function mutants(
  page: PageStructure,
  e: Extraction,
  per: number,
  pick: <T>(xs: T[], n: number) => T[],
): Mutant[] {
  const out: Mutant[] = []
  const make = (type: Defect, paths: string[], edit: (s: PageStructure) => void): void => {
    const s = structuredClone(page)
    edit(s)
    try {
      out.push({ type, paths, structure: parsePage(JSON.stringify(s)) })
    } catch {
      // A mutation the schema refuses (an emptied list) is no page at all.
    }
  }
  const items = (s: PageStructure): At[] => itemsOf(s.blocks, 'blocks')
  const at = (s: PageStructure, path: string): At | undefined => items(s).find((x) => x.path === path)
  const all = items(page)
  const pairs = <T>(xs: T[]): [T, T][] => xs.flatMap((a, i) => xs.slice(i + 1).map((b): [T, T] => [a, b]))
  const onePrice = all.filter((x) => x.item.prices.length === 1)

  for (const [a, b] of pick(
    pairs(onePrice).filter(([a, b]) => words(e, a.item.prices[0]?.src ?? []) !== words(e, b.item.prices[0]?.src ?? [])),
    per,
  ))
    make('price-swap', [a.path, b.path], (s) => {
      const [x, y] = [at(s, a.path)?.item.prices[0], at(s, b.path)?.item.prices[0]]
      if (x && y) [x.src, y.src] = [y.src, x.src]
    })
  // Three dishes in a row, each with the next one's price (a column read one row off), rotated to keep coverage.
  const runs3 = page.blocks.flatMap((_, i) =>
    all
      .filter((x) => x.path.startsWith(`blocks[${String(i)}].items[`) && x.item.prices.length === 1)
      .flatMap((x, k, xs) => (k + 2 < xs.length && xs[k + 1] && xs[k + 2] ? [[x, xs[k + 1], xs[k + 2]]] : [])),
  )
  // Equal prices rotated mislead no one: only trios whose prices differ.
  const differ = (t: (At | undefined)[]): boolean =>
    new Set(t.map((x) => words(e, x?.item.prices[0]?.src ?? []))).size === t.length
  for (const trio of pick(runs3.filter(differ), per))
    make(
      'price-shift',
      trio.flatMap((x) => (x ? [x.path] : [])),
      (s) => {
        const ps = trio.map((x) => (x ? at(s, x.path)?.item.prices[0] : undefined))
        const [p0, p1, p2] = ps
        if (p0 && p1 && p2) [p0.src, p1.src, p2.src] = [p2.src, p0.src, p1.src]
      },
    )
  for (const a of pick(onePrice, per))
    make('price-role', [a.path], (s) => {
      const p = at(s, a.path)?.item.prices[0]
      if (p) p.role = p.role === 'current' ? 'previous' : 'current'
    })
  for (const a of pick(
    all.filter((x) => x.item.prices.filter((p) => p.qualifier).length >= 2),
    per,
  ))
    make('qualifier-swap', [a.path], (s) => {
      const [x, y] = at(s, a.path)?.item.prices.filter((p) => p.qualifier) ?? []
      if (x && y) [x.qualifier, y.qualifier] = [y.qualifier, x.qualifier]
    })
  const cells = page.blocks.flatMap((b, i) =>
    b.kind === 'table'
      ? b.rows.flatMap((row, r) =>
          row.flatMap((c, k) => (c.prices?.length ? [`blocks[${String(i)}].rows[${String(r)}][${String(k)}]`] : [])),
        )
      : [],
  )
  const cellOf = (s: PageStructure, path: string) => {
    const [, i, r, k] = /blocks\[(\d+)\]\.rows\[(\d+)\]\[(\d+)\]/.exec(path) ?? []
    const b = s.blocks[Number(i)]
    return b?.kind === 'table' ? b.rows[Number(r)]?.[Number(k)] : undefined
  }
  for (const [a, b] of pick(pairs(cells), per))
    make('cell-price-swap', [a, b], (s) => {
      const [x, y] = [cellOf(s, a), cellOf(s, b)]
      if (x && y) [x.prices, y.prices] = [y.prices, x.prices]
    })
  for (const [a, b] of pick(pairs(all), per))
    make('name-swap', [a.path, b.path], (s) => {
      const [x, y] = [at(s, a.path)?.item, at(s, b.path)?.item]
      if (x && y) [x.name, y.name] = [y.name, x.name]
    })
  const headings = page.blocks.flatMap((b, i) => (b.kind === 'heading' && 'src' in b.text ? [i] : []))
  for (const [a, b] of pick(pairs(headings), per))
    make('heading-swap', [`blocks[${String(a)}]`, `blocks[${String(b)}]`], (s) => {
      const [x, y] = [s.blocks[a], s.blocks[b]]
      if (x?.kind === 'heading' && y?.kind === 'heading') [x.text, y.text] = [y.text, x.text]
    })
  for (const [a, b] of pick(
    pairs(all.filter((x) => x.item.details.length)).filter(([a, b]) => !b.path.startsWith(`${a.path}.`)),
    per,
  ))
    make('detail-move', [a.path, b.path], (s) => {
      const [x, y] = [at(s, a.path)?.item, at(s, b.path)?.item]
      const moved = x?.details.shift()
      if (y && moved) y.details.push(moved)
    })
  for (const [a, b] of pick(
    pairs(all).filter(([a, b]) => a.block !== b.block && a.block.items.length > 1 && !b.path.startsWith(`${a.path}.`)),
    per,
  ))
    make('item-move', [a.path, b.path], (s) => {
      const [x, y] = [at(s, a.path), at(s, b.path)]
      if (!x || !y) return
      const [moved] = x.block.items.splice(x.index, 1)
      if (moved) y.block.items.push(moved)
    })
  const drop = (s: PageStructure, removed: unknown): void => {
    s.dropped.push(...rangesIn(removed))
  }
  for (const a of pick(
    all.filter((x) => x.item.details.length),
    per,
  ))
    make('drop-detail', [a.path], (s) => {
      const x = at(s, a.path)?.item
      drop(s, x?.details.splice(0, 1))
    })
  for (const a of pick(
    all.filter((x) => x.block.items.length > 1),
    per,
  ))
    make('drop-item', [a.path], (s) => {
      const x = at(s, a.path)
      drop(s, x?.block.items.splice(x.index, 1))
    })
  for (const i of pick(
    page.blocks.flatMap((b, i) => (b.kind === 'paragraph' && 'src' in b.text ? [i] : [])),
    per,
  ))
    make('drop-paragraph', [`blocks[${String(i)}]`], (s) => {
      drop(s, s.blocks.splice(i, 1))
    })
  // An icon word cited for another icon of a different label: the dish claims what it is not.
  // A covered icon's word is hidden: a defect pointing at it would be one no gate can see (pdf/visibility.ts).
  const covered = new Set(e.hidden)
  const icons = e.runs.flatMap((r, i) => (r.icon && !covered.has(r.id) ? [i] : []))
  const cited = rangesIn(page.blocks).filter(([a, b]) => a === b && icons.includes(a))
  for (const [from] of pick(cited, per)) {
    const other = icons.find((j) => e.runs[j]?.str !== e.runs[from]?.str)
    if (other === undefined) continue
    make('icon-swap', [`run ${String(from)}`], (s) => {
      let done = false
      const swap = (v: unknown): void => {
        if (done || typeof v !== 'object' || v === null) return
        if (Array.isArray(v)) {
          v.forEach(swap)
          return
        }
        for (const [k, x] of Object.entries(v))
          if (k === 'src' && Array.isArray(x)) {
            const r = x.findIndex((y) => Array.isArray(y) && y[0] === from && y[1] === from)
            if (r >= 0 && !done) {
              x[r] = [other, other]
              done = true
            }
          } else swap(x)
      }
      swap(s.blocks)
      s.dropped.push([from, from])
    })
  }
  return out
}
