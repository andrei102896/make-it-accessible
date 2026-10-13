import { norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyPage, KeyProduct } from '../keys.ts'
import { moneyInText, readMoney, type Currency } from './money.ts'
import { checkContainer } from './prices.ts'
import { loose } from './text.ts'
import type { Container, DomPage, PageScore } from './types.ts'

const PLACEHOLDER = /placeholder|auto-?generated|^(bild|image|foto|figure|grafik)$/i
// A negation within three words before the product word ("no peas are pictured", "ohne Erbsen").
const NEGATED = /(?:^|\s)(?:no|not|kein|keine|keinen|ohne|without|zonder|geen|sans|non)(?:\s+\S+){0,2}\s*$/
// Positions inside one leaf are offsets, so anchors in one block keep their order.
const LEAF = 1_000_000

// Indices of one longest non-decreasing subsequence; the other found anchors are out of order.
function longestOrdered(positions: readonly number[]): Set<number> {
  const length = positions.map(() => 1)
  const previous = positions.map(() => -1)
  positions.forEach((p, i) => {
    for (let j = 0; j < i; j++)
      if ((positions[j] ?? Infinity) <= p && (length[j] ?? 0) + 1 > (length[i] ?? 0)) {
        length[i] = (length[j] ?? 0) + 1
        previous[i] = j
      }
  })
  const kept = new Set<number>()
  let at = length.indexOf(Math.max(0, ...length))
  while (at >= 0) {
    kept.add(at)
    at = previous[at] ?? -1
  }
  return kept
}

export function readingOrder(key: KeyPage, dom: DomPage): PageScore['c1'] {
  const leaves = dom.leaves.map((l) => loose(l.text))
  const position = (anchor: string): { pos: number; leaf: number } | null => {
    const needle = loose(anchor)
    const leaf = leaves.findIndex((l) => l.includes(needle))
    return leaf < 0 ? null : { pos: leaf * LEAF + (leaves[leaf]?.indexOf(needle) ?? 0), leaf }
  }
  let best = { textOnly: 0, strict: 0, outOfOrder: 0, flaggedOutOfOrder: 0 }
  for (const order of key.readingOrder) {
    const ordered = (entries: typeof order): { ratio: number; stray: number[] } => {
      const found = entries.flatMap((e) => position(e.anchor) ?? [])
      const kept = longestOrdered(found.map((f) => f.pos))
      return {
        ratio: entries.length ? kept.size / entries.length : 1,
        stray: found.filter((_, i) => !kept.has(i)).map((f) => f.leaf),
      }
    }
    const text = ordered(order.filter((e) => e.kind === 'text'))
    if (text.ratio > best.textOnly || (best.textOnly === 0 && text.ratio === 0))
      best = {
        textOnly: text.ratio,
        strict: ordered(order).ratio,
        outOfOrder: text.stray.length,
        flaggedOutOfOrder: text.stray.filter((p) => dom.leaves[p]?.review).length,
      }
  }
  return best
}

// Each output product answers one key product; a child (add-on) may share its parent's product or follow it.
function assignContainers(products: readonly KeyProduct[], dom: DomPage): Map<KeyProduct, Container> {
  const assigned = new Map<KeyProduct, Container>()
  const claimed = new Set<Container>()
  const holding = (p: KeyProduct, c: Container): boolean => loose(c.text).includes(loose(p.articleNo ?? p.anchor))
  const smallest = (p: KeyProduct, from = 0): Container | undefined =>
    dom.containers
      .filter((c, i) => i >= from && !claimed.has(c) && holding(p, c))
      .sort((a, b) => a.text.length - b.text.length)[0]
  for (const p of products.filter((x) => x.parent === undefined)) {
    const c = smallest(p)
    if (!c) continue
    assigned.set(p, c)
    claimed.add(c)
  }
  const parents = [...assigned.values()].map((c) => dom.containers.indexOf(c))
  for (const p of products.filter((x) => x.parent !== undefined)) {
    const parent = [...assigned].find(([q]) => q.id === p.parent)?.[1]
    const from = parent ? dom.containers.indexOf(parent) : -1
    // The add-on published on its own follows its parent, before the next parent ("Add bacon" under two dishes).
    const until = Math.min(...parents.filter((i) => i > from), dom.containers.length)
    const after = dom.containers.find((c, i) => i > from && i < until && !claimed.has(c) && holding(p, c))
    const c = parent ? (after ?? (holding(p, parent) ? parent : undefined)) : smallest(p)
    if (!c) continue
    assigned.set(p, c)
    claimed.add(c)
  }
  return assigned
}

export function productPrices(key: KeyPage, dom: DomPage, currency: Currency): PageScore['c2'] {
  const errors: string[] = []
  let errorProducts = 0
  let silent = 0
  let textErrors = 0
  let unverified = 0
  const assigned = assignContainers(key.products, dom)
  const groups = new Map<Container, KeyProduct[]>()
  for (const [p, c] of assigned) groups.set(c, [...(groups.get(c) ?? []), p])
  const checks = new Map([...groups].flatMap(([c, ps]) => [...checkContainer(ps, c, currency, key.strict)]))
  for (const product of key.products) {
    const name = product.articleNo ? `${product.anchor} ${product.articleNo}` : product.anchor
    const container = assigned.get(product)
    const check = checks.get(product) ?? { price: ['no container'], text: [], unverified: 0 }
    unverified += check.unverified
    const problems = [...check.price, ...check.text]
    if (!problems.length) continue
    errorProducts++
    if (check.text.length) textErrors++
    const flagged = check.price.length ? !(check.silent ?? !(container?.review ?? false)) : (container?.review ?? false)
    if (check.price.length && !flagged) silent++
    errors.push(`${name}: ${problems.join('; ')}${flagged ? ' (flagged)' : ' (silent)'}`)
  }
  // A complete key makes any other priced product in the output an error, except a price that belongs to no product.
  if (key.strict) {
    // A price that belongs to no product must reach the reader somewhere on the page, as text or as a price.
    const keyed = key.products.flatMap((p) => p.prices?.map((k) => k.cents) ?? [])
    const published = moneyInText(dom.text).map((m) => m.cents)
    const missing = key.textPrices.filter((k, i) => {
      const needed = key.textPrices.slice(0, i + 1).filter((t) => t.cents === k.cents).length
      const free = published.filter((c) => c === k.cents).length - keyed.filter((c) => c === k.cents).length
      return free < needed
    })
    missing.forEach((k) => {
      errorProducts++
      silent++
      errors.push(`page price ${k.printed} missing (silent)`)
    })
    const spare = key.textPrices.map((k) => k.cents)
    const claimed = new Set(assigned.values())
    for (const c of dom.containers) {
      if (c.row || claimed.has(c) || !c.prices.length) continue
      const shown = c.prices.map((p) => p.text)
      const free = [...spare]
      const covered = c.prices.every((p) => {
        const at = free.indexOf(readMoney(p.text)?.cents ?? NaN)
        return at >= 0 && free.splice(at, 1).length === 1
      })
      if (covered) {
        spare.splice(0, spare.length, ...free)
        continue
      }
      errorProducts++
      if (!c.review) silent++
      errors.push(
        `unkeyed product with ${shown.join(', ')}: "${c.text.slice(0, 40)}"${c.review ? ' (flagged)' : ' (silent)'}`,
      )
    }
  }
  const n = key.products.length
  return {
    products: n,
    errorProducts,
    silent,
    unverified,
    textErrors,
    upperBound: errorProducts === 0 && n ? 3 / n : null,
    errors,
  }
}

export function textFidelity(key: KeyPage, dom: DomPage): Omit<PageScore['c3'], 'coverage'> {
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
  // Image text may land in an alt text; both count as published.
  const published = loose([dom.text, ...dom.alts].join(' '))
  const required = key.mustContain
    .map((m) => (typeof m === 'string' ? m : m.text))
    .filter((s) => !published.includes(loose(s)))
  const outsideTrim = key.outsideTrim.filter((s) => page.includes(loose(s)))
  return { missing, altered, invented, required, outsideTrim }
}

// C4 is lexical: the alt names the product (not negated); whether the description is right is judged by hand.
export function altText(key: KeyPage, dom: DomPage): PageScore['c4'] {
  const failures: string[] = []
  let ok = 0
  const pictured = key.products.filter((p) => p.alt !== null)
  const assigned = assignContainers(key.products, dom)
  const names = (alt: string, word: string): boolean => {
    if (!loose(alt).includes(loose(word)) || PLACEHOLDER.test(alt.trim())) return false
    const at = norm(alt).indexOf(norm(word))
    return at < 0 || !NEGATED.test(norm(alt).slice(0, at))
  }
  for (const product of pictured) {
    const alts = assigned.get(product)?.alts ?? []
    const words = (product.alt ?? product.anchor).split('|')
    if (alts.some((a) => words.some((w) => names(a, w)))) ok++
    else
      failures.push(
        `${product.anchor}${product.articleNo ? ` ${product.articleNo}` : ''}: ${alts.join(' | ') || 'no image'}`,
      )
  }
  return { ok, total: pictured.length, failures }
}
