import { parseMoney } from '@make-it-accessible/pipeline/text/money'
import { canon, norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyPage, KeyProduct } from '../keys.ts'

const MONEY_IN_TEXT =
  /[€£$]\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?!\d)|[€£$]\s?\d+(?:[.,]\d{2})?(?!\d)|[-\u2212]?\d+[.,]\d{2}(?!\d)|\d+,-|-,\d{2}/g
const MONEY_CELL = /[€£$]|^-?\d*[.,](?:\d{2}|-)$/
const PLACEHOLDER = /placeholder|auto-?generated|^(bild|image|foto|figure|grafik)$/i

export type Leaf = { text: string }
export type Container = {
  text: string
  alts: string[]
  prices: { role: string; amount: number | null }[]
  review: boolean
}
export type Heading = { level: number; text: string }
export type Cell = { text: string; amounts: number[] }
export type Row = { text: string; header: boolean; review: boolean; cells: Cell[] }
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
  c5: { headingsOk: number; headings: number; rowsOk: number; rows: number; silentRows: number; rowErrors: string[] }
  pass: { c1: boolean; c2: boolean; c3: boolean; c4: boolean; c5: boolean }
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
  const pictured = key.products.filter((p) => p.alt !== null)
  for (const product of pictured) {
    const alts = findContainer(product, dom)?.alts ?? []
    const words = (product.alt ?? product.anchor).split('|').map(loose)
    if (alts.some((a) => words.some((w) => loose(a).includes(w)) && !PLACEHOLDER.test(a.trim()))) ok++
    else
      failures.push(
        `${product.anchor}${product.articleNo ? ` ${product.articleNo}` : ''}: ${alts.join(' | ') || 'no image'}`,
      )
  }
  return { ok, total: pictured.length, failures }
}

// "" is an unchecked cell; a price cell also matches the amount of a price rendered in it.
function cellMatches(key: string, cell: Cell): boolean {
  if (key === '' || canon(key) === canon(cell.text) || ` ${norm(cell.text)} `.includes(` ${norm(key)} `)) return true
  const amount = parseMoney(key)
  return MONEY_CELL.test(key) && amount !== null && cell.amounts.includes(amount)
}

// Key rows as wide as the header are checked column by column; older keys list a row's values as a set.
function rowMatches(cells: readonly string[], positional: boolean, row: Row): boolean {
  if (row.header) return false
  if (!positional) return cells.every((c) => loose(row.text).includes(loose(c)))
  return (
    row.cells.length === cells.length &&
    cells.every((c, i) => cellMatches(c, row.cells[i] ?? { text: '', amounts: [] }))
  )
}

export function structureScore(key: KeyPage, dom: DomPage): PageScore['c5'] {
  const matched = key.headings
    .map((h) => ({ key: h.level, out: dom.headings.find((o) => loose(o.text).includes(loose(h.anchor)))?.level }))
    .filter((m): m is { key: number; out: number } => m.out !== undefined)
  const keyMin = Math.min(...matched.map((m) => m.key))
  const outMin = Math.min(...matched.map((m) => m.out))
  const headingsOk = matched.filter((m) => m.key - keyMin === m.out - outMin).length
  const rowErrors: string[] = []
  let rowsOk = 0
  let silentRows = 0
  for (const table of key.tables) {
    const positional = table.rows.every((r) => r.length === table.header.length)
    for (const cells of table.rows) {
      if (dom.rows.some((r) => rowMatches(cells, positional, r))) {
        rowsOk++
        continue
      }
      const flagged = dom.rows.some((r) => r.review && r.cells[0] && cellMatches(cells[0] ?? '', r.cells[0]))
      if (!flagged) silentRows++
      rowErrors.push(`${cells.filter(Boolean).slice(0, 3).join(' | ')}${flagged ? ' (flagged)' : ' (silent)'}`)
    }
  }
  const rows = key.tables.reduce((n, t) => n + t.rows.length, 0)
  return { headingsOk, headings: key.headings.length, rowsOk, rows, silentRows, rowErrors }
}
