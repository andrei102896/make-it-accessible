import type { KeyRole } from '../key-schema.ts'
import type { KeyPrice, KeyProduct } from '../keys.ts'
import { holds } from './conditions.ts'
import { isAmount, moneyInText, readMoney, type Currency } from './money.ts'
import { loose } from './text.ts'
import type { Container } from './types.ts'

// unverified: prices whose role the output does not show (no price element) or the key leaves open.
// silent: a price problem on a price nobody flagged (stage-0 keys leave it to the product's flag).
export type PriceCheck = { price: string[]; text: string[]; unverified: number; silent?: boolean }
type Shown = {
  role: string | null
  cents: number | null
  currency: Currency | null
  qualifier: string
  review: boolean
}

// Output roles a reader may get for each key role; the pipeline renders current, previous, unit and discount.
const ACCEPTED: Record<KeyRole, readonly string[] | null> = {
  current: ['current'],
  previous: ['previous'],
  unit: ['unit'],
  previousUnit: ['previous', 'unit'],
  discount: ['discount'],
  deposit: ['current', 'unit'],
  unknown: null,
}

// What a reader gets: each price element, or the prices written in the text when there is no price element.
function shown(container: Container): Shown[] {
  if (container.prices.length)
    return container.prices.map((p) => {
      const money = readMoney(p.text)
      return { ...p, cents: money?.cents ?? null, currency: money?.currency ?? null }
    })
  if (container.anyPrice) return []
  return moneyInText(container.text).map((m) => ({ ...m, role: null, qualifier: '', review: container.review }))
}

function lacking(product: KeyProduct, container: Container, amounts: readonly (number | null)[]): string[] {
  const haystack = loose([container.text, ...container.alts].join(' '))
  return product.mustContain.flatMap((s) => {
    const amount = isAmount(s) ? readMoney(s)?.cents : undefined
    return haystack.includes(loose(s)) || (amount !== undefined && amounts.includes(amount)) ? [] : [`lacks "${s}"`]
  })
}

type Match = { problems: string[]; unverified: boolean; flagged: boolean }

// Value, currency and conditions of one shown price; `text` is where its conditions must be printed.
function judge(k: KeyPrice, s: Pick<Shown, 'currency' | 'review'>, text: string, others: readonly string[]): string[] {
  const problems: string[] = []
  // A price printed without a currency is right only when the output asks a person to confirm it.
  if (k.currency === null ? !s.review : s.currency !== k.currency)
    problems.push(`${k.printed} shown in ${s.currency ?? 'no currency'}, keyed ${k.currency ?? 'none (needs review)'}`)
  k.conditions.filter((c) => !holds(c, text)).forEach((c) => problems.push(`${k.printed} lacks "${c}"`))
  if (k.role === 'unknown' && others.some((c) => holds(c, text)))
    problems.push(`${k.printed} carries another price's condition`)
  return problems
}

function matchPrice(
  k: KeyPrice,
  all: Shown[],
  used: Set<number>,
  container: Container,
  others: readonly string[],
): Match {
  const accepted = ACCEPTED[k.role]
  const free = (s: Shown, j: number): boolean => !used.has(j) && s.cents === k.cents
  // Same amount twice: the element with the expected role answers first ("previous" before "unit" for previousUnit).
  const preferred = [...(accepted ?? []), null]
  const ranked = preferred.map((role) => all.findIndex((s, j) => free(s, j) && s.role === role))
  const at = [...ranked.filter((i) => i >= 0), all.findIndex(free)].find((i) => i >= 0) ?? -1
  const s = all[at]
  if (!s) {
    // A price printed only in an image may reach the reader through the alt text, flagged for a person.
    const confirmed = container.altReview || container.grouping
    const alt = k.seen ? container.alts.find((a) => moneyInText(a).some((m) => m.cents === k.cents)) : undefined
    if (alt === undefined) return { problems: [`missing ${k.printed}`], unverified: false, flagged: container.grouping }
    const money = moneyInText(alt).find((m) => m.cents === k.cents)
    const problems = judge(k, { currency: money?.currency ?? null, review: confirmed }, alt, others)
    if (!confirmed) problems.push(`${k.printed} read from the image but not flagged`)
    return { problems, unverified: true, flagged: confirmed }
  }
  used.add(at)
  const flagged = s.review || container.grouping
  const problems: string[] = []
  if (k.seen && !flagged) problems.push(`${k.printed} read from the image but not flagged`)
  if (s.role !== null && accepted !== null && !accepted.includes(s.role))
    problems.push(`${k.printed} shown as ${s.role}`)
  // Without a price element the conditions can only be looked for in the product's text.
  problems.push(
    ...judge(k, { currency: s.currency, review: flagged }, s.role === null ? container.text : s.qualifier, others),
  )
  return { problems, unverified: s.role === null || accepted === null, flagged }
}

// The key products one output product answers (a parent and the add-ons published inside it) share its prices.
// strict: a complete key, so any unclaimed price is extra, unit prices included.
export function checkContainer(
  products: readonly KeyProduct[],
  container: Container,
  currency: Currency,
  strict: boolean,
): Map<KeyProduct, PriceCheck> {
  const all = shown(container)
  const amounts = all.map((s) => s.cents)
  const used = new Set<number>()
  const result = new Map<KeyProduct, PriceCheck>()
  for (const product of products) {
    if (!product.prices) {
      result.set(product, { ...legacyCheck(product, container, all, currency), unverified: 0 })
      continue
    }
    const keys = product.prices
    const matches = keys.map((k) =>
      matchPrice(
        k,
        all,
        used,
        container,
        keys.filter((o) => o !== k).flatMap((o) => o.conditions),
      ),
    )
    result.set(product, {
      price: matches.flatMap((m) => m.problems),
      text: lacking(product, container, amounts),
      unverified: matches.filter((m) => m.unverified).length,
      silent: matches.some((m) => m.problems.length > 0 && !m.flagged),
    })
  }
  // Prices nobody claimed are the extra amounts of the product that owns the output product.
  const owner = products.find((p) => p.parent === undefined) ?? products[0]
  const check = owner ? result.get(owner) : undefined
  if (owner?.prices && check) {
    const keysUnit =
      strict || products.some((p) => p.prices?.some((k) => k.role === 'unit' || k.role === 'previousUnit'))
    all.forEach((s, j) => {
      const extra = s.cents === null || (!used.has(j) && (s.role !== 'unit' || keysUnit))
      if (!extra) return
      check.price.push(s.cents === null ? 'unreadable price' : `extra ${String(s.cents)}`)
      if (!s.review && !container.grouping) check.silent = true
    })
  }
  return result
}

// Stage-0 keys: amounts per product, previous prices as a set, unit prices not scored.
function legacyCheck(
  product: KeyProduct,
  container: Container,
  all: Shown[],
  currency: Currency,
): Omit<PriceCheck, 'unverified'> {
  const money = product.money ?? []
  const elements = all.filter((s) => s.role !== null)
  const amounts = elements.flatMap((s) => (s.role !== 'unit' && s.cents !== null ? [s.cents] : []))
  const written = elements.length ? [] : all.map((s) => s.cents)
  const roleChecked = (a: number | null): boolean =>
    a !== null && !product.roleFree.includes(a) && !product.optional.includes(a)
  const previous = [
    ...new Set(
      elements
        .filter((s) => s.role === 'previous')
        .map((s) => s.cents)
        .filter(roleChecked),
    ),
  ]
  const price: string[] = []
  for (const m of money) if (!amounts.includes(m) && !written.includes(m)) price.push(`missing ${String(m)}`)
  for (const a of new Set(amounts)) if (![...money, ...product.optional].includes(a)) price.push(`extra ${String(a)}`)
  const expectedOld = [...product.old].sort().join(',')
  if (previous.sort().join(',') !== expectedOld)
    price.push(`previous ${previous.join(',') || '-'} vs ${expectedOld || '-'}`)
  for (const s of elements)
    if (s.cents !== null && s.currency !== currency)
      price.push(`${String(s.cents)} shown in ${s.currency ?? 'no currency'}`)
  return {
    price,
    text: lacking(
      product,
      container,
      all.map((s) => s.cents),
    ),
  }
}
