import { norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyPage, KeyProduct } from '../keys.ts'
import type { Currency } from './money.ts'
import { checkPrices } from './prices.ts'
import { loose } from './text.ts'
import type { Container, DomPage, PageScore } from './types.ts'

const PLACEHOLDER = /placeholder|auto-?generated|^(bild|image|foto|figure|grafik)$/i

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
  const position = (anchor: string): number => leaves.findIndex((l) => l.includes(loose(anchor)))
  let best = { textOnly: 0, strict: 0, outOfOrder: 0, flaggedOutOfOrder: 0 }
  for (const order of key.readingOrder) {
    const ordered = (entries: typeof order): { ratio: number; stray: number[] } => {
      const found = entries.map((e) => position(e.anchor)).filter((p) => p >= 0)
      const kept = longestOrdered(found)
      return {
        ratio: entries.length ? kept.size / entries.length : 1,
        stray: found.filter((_, i) => !kept.has(i)),
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

function findContainer(product: KeyProduct, dom: DomPage): Container | undefined {
  const needle = loose(product.articleNo ?? product.anchor)
  return dom.containers.filter((c) => loose(c.text).includes(needle)).sort((a, b) => a.text.length - b.text.length)[0]
}

export function productPrices(key: KeyPage, dom: DomPage, currency: Currency): PageScore['c2'] {
  const errors: string[] = []
  let errorProducts = 0
  let silent = 0
  let textErrors = 0
  for (const product of key.products) {
    const name = product.articleNo ? `${product.anchor} ${product.articleNo}` : product.anchor
    const container = findContainer(product, dom)
    const check = container ? checkPrices(product, container, currency) : { price: ['no container'], text: [] }
    const problems = [...check.price, ...check.text]
    if (!problems.length) continue
    errorProducts++
    if (check.text.length) textErrors++
    const flagged = container?.review ?? false
    if (check.price.length && !flagged) silent++
    errors.push(`${name}: ${problems.join('; ')}${flagged ? ' (flagged)' : ' (silent)'}`)
  }
  const n = key.products.length
  return { products: n, errorProducts, silent, textErrors, upperBound: errorProducts === 0 && n ? 3 / n : null, errors }
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
  // Image text may land in an alt text; both count as published.
  const published = loose([dom.text, ...dom.alts].join(' '))
  const required = key.mustContain
    .map((m) => (typeof m === 'string' ? m : m.text))
    .filter((s) => !published.includes(loose(s)))
  const outsideTrim = key.outsideTrim.filter((s) => page.includes(loose(s)))
  return { missing, altered, invented, required, outsideTrim }
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
