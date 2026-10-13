import type { KeyPrice, KeyProduct } from '../keys.ts'
import { isAmount, moneyInText, readMoney, type Currency } from './money.ts'
import { loose } from './text.ts'
import type { Container } from './types.ts'

export type PriceCheck = { price: string[]; text: string[] }
type Shown = {
  role: string | null
  cents: number | null
  currency: Currency | null
  qualifier: string
  review: boolean
}

// What a reader gets: each price element, or the prices written in the text when there is no price element.
function shown(container: Container): Shown[] {
  if (container.prices.length)
    return container.prices.map((p) => {
      const money = readMoney(p.text)
      return { ...p, cents: money?.cents ?? null, currency: money?.currency ?? null }
    })
  return moneyInText(container.text).map((m) => ({ ...m, role: null, qualifier: '', review: false }))
}

function lacking(product: KeyProduct, container: Container, amounts: readonly (number | null)[]): string[] {
  const haystack = loose([container.text, ...container.alts].join(' '))
  return product.mustContain.flatMap((s) => {
    const amount = isAmount(s) ? readMoney(s)?.cents : undefined
    return haystack.includes(loose(s)) || (amount !== undefined && amounts.includes(amount)) ? [] : [`lacks "${s}"`]
  })
}

function matchPrice(k: KeyPrice, all: Shown[], used: Set<number>, container: Container): string[] {
  const free = (s: Shown, j: number): boolean => !used.has(j) && s.cents === k.cents
  const fits = all.findIndex((s, j) => free(s, j) && (k.role === 'any' || s.role === null || s.role === k.role))
  const at = fits >= 0 ? fits : all.findIndex(free)
  const s = all[at]
  if (!s) return k.optional ? [] : [`missing ${k.printed}`]
  used.add(at)
  const problems: string[] = []
  if (k.role !== 'any' && s.role !== null && s.role !== k.role) problems.push(`${k.printed} shown as ${s.role}`)
  // A price printed without a currency is right only when the output asks a person to confirm it.
  if (k.currency === null ? !s.review : s.currency !== k.currency)
    problems.push(`${k.printed} shown in ${s.currency ?? 'no currency'}, keyed ${k.currency ?? 'none (needs review)'}`)
  if (k.qualifier && !loose(s.qualifier || container.text).includes(loose(k.qualifier)))
    problems.push(`${k.printed} lacks "${k.qualifier}"`)
  return problems
}

export function checkPrices(product: KeyProduct, container: Container, currency: Currency): PriceCheck {
  const all = shown(container)
  const amounts = all.map((s) => s.cents)
  if (!product.prices) return legacyCheck(product, container, all, currency)
  const used = new Set<number>()
  const ordered = [...product.prices].sort((a, b) => Number(a.optional) - Number(b.optional))
  const price = ordered.flatMap((k) => matchPrice(k, all, used, container))
  const keysUnit = product.prices.some((k) => k.role === 'unit')
  all.forEach((s, j) => {
    if (s.cents === null) price.push('unreadable price')
    else if (!used.has(j) && (s.role !== 'unit' || keysUnit)) price.push(`extra ${String(s.cents)}`)
  })
  return { price, text: lacking(product, container, amounts) }
}

// Stage-0 keys: amounts per product, previous prices as a set, unit prices not scored.
function legacyCheck(product: KeyProduct, container: Container, all: Shown[], currency: Currency): PriceCheck {
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
