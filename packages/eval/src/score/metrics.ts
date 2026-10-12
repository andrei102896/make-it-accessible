import { parseMoney } from '@make-it-accessible/pipeline/text/money'
import { canon, norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyPage, KeyProduct } from '../keys.ts'

const MONEY_IN_TEXT = /[-\u2212]?\d+[.,]\d{2}(?!\d)|\d+,-|-,\d{2}/g
const PLACEHOLDER = /placeholder|auto-?generated|^(bild|image|foto|figure|grafik)$/i

export type Leaf = { text: string }
export type Container = {
  text: string
  alts: string[]
  prices: { role: string; amount: number | null }[]
  review: boolean
}
export type Heading = { level: number; text: string }
export type Row = { text: string; header: boolean }
export type DomPage = {
  page: number
  leaves: Leaf[]
  containers: Container[]
  headings: Heading[]
  rows: Row[]
  text: string
}

export type PageScore = {
  keyPage: number
  heldOut: boolean
  c1: { textOnly: number; strict: number }
  c2: { products: number; errorProducts: number; silent: number; upperBound: number | null; errors: string[] }
  c3: { missing: string[]; altered: string[]; invented: string[] }
  c4: { ok: number; total: number; failures: string[] }
  c5: { headingsOk: number; headings: number; rowsOk: number; rows: number }
  pass: { c1: boolean; c2: boolean; c3: boolean; c4: boolean }
}
export type DocScore = { pages: PageScore[]; axe: { critical: number; serious: number; rules: string[] } }

const loose = (s: string): string => canon(s).replace(/[-‐‑]/g, '')

function longestOrdered(positions: readonly number[]): number {
  const tails: number[] = []
  for (const p of positions) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((tails[mid] ?? Infinity) <= p) lo = mid + 1
      else hi = mid
    }
    tails[lo] = p
  }
  return tails.length
}

export function readingOrder(key: KeyPage, dom: DomPage): PageScore['c1'] {
  const leaves = dom.leaves.map((l) => loose(l.text))
  const position = (anchor: string): number => leaves.findIndex((l) => l.includes(loose(anchor)))
  let best = { textOnly: 0, strict: 0 }
  for (const order of key.readingOrder) {
    const textEntries = order.filter((e) => e.kind === 'text')
    const ratio = (entries: typeof order): number =>
      entries.length ? longestOrdered(entries.map((e) => position(e.anchor)).filter((p) => p >= 0)) / entries.length : 1
    const score = { textOnly: ratio(textEntries), strict: ratio(order) }
    if (score.textOnly > best.textOnly) best = score
  }
  return best
}

function findContainer(product: KeyProduct, dom: DomPage): Container | undefined {
  const needle = loose(product.articleNo ?? product.anchor)
  return dom.containers.filter((c) => loose(c.text).includes(needle)).sort((a, b) => a.text.length - b.text.length)[0]
}

export function productPrices(key: KeyPage, dom: DomPage): PageScore['c2'] {
  const errors: string[] = []
  let errorProducts = 0
  let silent = 0
  for (const product of key.products) {
    const name = product.articleNo ? `${product.anchor} ${product.articleNo}` : product.anchor
    const container = findContainer(product, dom)
    const problems: string[] = []
    if (!container) problems.push('no container')
    else {
      const amounts = container.prices.flatMap((p) => (p.role !== 'unit' && p.amount !== null ? [p.amount] : []))
      const allAmounts = container.prices.map((p) => p.amount)
      const allowed = [...product.money, ...product.optional]
      const roleChecked = (a: number | null): boolean =>
        a !== null && !product.roleFree.includes(a) && !product.optional.includes(a)
      const previous = [
        ...new Set(
          container.prices
            .filter((p) => p.role === 'previous')
            .map((p) => p.amount)
            .filter(roleChecked),
        ),
      ]
      const written = [...container.text.matchAll(MONEY_IN_TEXT)].map((m) => parseMoney(m[0]))
      for (const m of product.money) if (!amounts.includes(m) && !written.includes(m)) problems.push(`missing ${m}`)
      for (const a of new Set(amounts)) if (!allowed.includes(a)) problems.push(`extra ${a}`)
      const expectedOld = [...product.old].sort().join(',')
      if (previous.sort().join(',') !== expectedOld)
        problems.push(`previous ${previous.join(',') || '-'} vs ${expectedOld || '-'}`)
      const haystack = loose([container.text, ...container.alts].join(' '))
      for (const s of product.mustContain) {
        const amount = parseMoney(s)
        if (
          !haystack.includes(loose(s)) &&
          !(amount !== null && (allAmounts.includes(amount) || written.includes(amount)))
        )
          problems.push(`lacks "${s}"`)
      }
    }
    if (problems.length) {
      errorProducts++
      const flagged = container?.review ?? false
      if (!flagged) silent++
      errors.push(`${name}: ${problems.join('; ')}${flagged ? ' (flagged)' : ' (silent)'}`)
    }
  }
  const n = key.products.length
  return { products: n, errorProducts, silent, upperBound: errorProducts === 0 && n ? 3 / n : null, errors }
}

export function textFidelity(key: KeyPage, dom: DomPage): PageScore['c3'] {
  const anchors = [...new Set([...key.readingOrder.flat().map((e) => e.anchor), ...key.headings.map((h) => h.anchor)])]
  const missing: string[] = []
  const altered: string[] = []
  for (const anchor of anchors) {
    const leaf = dom.leaves.find((l) => loose(l.text).includes(loose(anchor)))
    if (!leaf) missing.push(anchor)
    else if (!norm(leaf.text).includes(norm(anchor))) altered.push(anchor)
  }
  const page = loose(dom.text)
  const invented = key.mustNotAppear.filter((s) => page.includes(loose(s)))
  return { missing, altered, invented }
}

export function altText(key: KeyPage, dom: DomPage): PageScore['c4'] {
  const failures: string[] = []
  let ok = 0
  for (const product of key.products) {
    const alts = findContainer(product, dom)?.alts ?? []
    const words = (product.alt ?? product.anchor).split('|').map(loose)
    if (alts.some((a) => words.some((w) => loose(a).includes(w)) && !PLACEHOLDER.test(a.trim()))) ok++
    else
      failures.push(
        `${product.anchor}${product.articleNo ? ` ${product.articleNo}` : ''}: ${alts.join(' | ') || 'no image'}`,
      )
  }
  return { ok, total: key.products.length, failures }
}

export function structureScore(key: KeyPage, dom: DomPage): PageScore['c5'] {
  const matched = key.headings
    .map((h) => ({ key: h.level, out: dom.headings.find((o) => loose(o.text).includes(loose(h.anchor)))?.level }))
    .filter((m): m is { key: number; out: number } => m.out !== undefined)
  const keyMin = Math.min(...matched.map((m) => m.key))
  const outMin = Math.min(...matched.map((m) => m.out))
  const headingsOk = matched.filter((m) => m.key - keyMin === m.out - outMin).length
  const rows = key.tables.flatMap((t) => t.rows)
  const rowsOk = rows.filter((cells) =>
    dom.rows.some((r) => !r.header && cells.every((c) => loose(r.text).includes(loose(c)))),
  ).length
  return { headingsOk, headings: key.headings.length, rowsOk, rows: rows.length }
}
