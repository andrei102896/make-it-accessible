import { norm } from '@make-it-accessible/pipeline/text/normalize'
import { moneySpans, moneyText, type Money } from './money.ts'

const NEGATION = /\b(?:ohne|without|not|excl|excluding|kein|keine|keinen|zonder|sans|hors|non)\s*$/
export const words = (s: string): string =>
  ` ${norm(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

// A condition holds when it is a whole phrase of the text and no negation stands right before it ("ohne Lidl Plus").
export function holds(condition: string, text: string): boolean {
  const c = words(condition)
  const t = words(text)
  let at = t.indexOf(c)
  while (at >= 0) {
    if (!NEGATION.test(t.slice(0, at)) || NEGATION.test(c.trim().split(' ')[0] ?? '')) return true
    at = t.indexOf(c, at + 1)
  }
  return false
}

// Printed words as offers compare them: an amount by its value, any other word by its letters and digits (norm form).
export type Token = string | Money
export const isMoney = (t: Token): t is Money => typeof t !== 'string'
const plain = (s: string): string[] => words(s).trim().split(' ').filter(Boolean)

export function tokens(text: string): Token[] {
  const t = moneyText(text)
  const out: Token[] = []
  let from = 0
  for (const s of moneySpans(t)) {
    out.push(...plain(t.slice(from, s.at)), s.money)
    from = s.end
  }
  return [...out, ...plain(t.slice(from))]
}

// An offer amount without a printed currency matches any; one with a currency needs the same one.
const same = (o: Token, t: Token | undefined): boolean =>
  isMoney(o)
    ? t !== undefined && isMoney(t) && o.cents === t.cents && (o.currency === null || o.currency === t.currency)
    : o === t

// Every place `text` prints `offer` word for word, not negated unless `negated`; for each, the index among text's
// amounts of each of the offer's amounts, in order.
export function findOffer(offer: readonly Token[], text: readonly Token[], { negated = false } = {}): number[][] {
  const found: number[][] = []
  const amounts = offer.filter(isMoney).length
  for (let i = 0; i + offer.length <= text.length; i++) {
    const before = text[i - 1]
    if (!offer.every((o, j) => same(o, text[i + j]))) continue
    if (!negated && typeof before === 'string' && NEGATION.test(before)) continue
    const first = text.slice(0, i).filter(isMoney).length
    found.push(Array.from({ length: amounts }, (_, k) => first + k))
  }
  return found
}
