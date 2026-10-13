import { readMoney, type Currency } from './score/money.ts'
import type { Word } from './words.ts'

// One printed amount on the page, built from text-layer words; each word belongs to at most one occurrence.
export type Occurrence = {
  id: string
  words: number[]
  text: string
  cents: number | null
  currency: Currency | null
  // The text layer cannot be read here (an unmapped glyph, glyphs that read as no single amount); the value comes from the render.
  unreadable: boolean
  box: { x: number; y: number; w: number; h: number }
}
type Span = { ids: number[]; text: string; cents: number | null; currency: Currency | null }

// Euros (or a dash for none: "-," "–.") with small cents set apart, as leaflets print them.
export const EUROS = /^(?:[-−]?[€£$]?\d{1,5}[.,]?|[-–][.,]?)$/
export const CENTS = /^(?:\d{2}|[-–])$/
const CURRENCY_WORD = /^(?:€|£|\$|CHF|Fr\.|EUR|GBP|p|[.,]?[-–]|\*)$/
const SYMBOL = /^(?:€|£|\$|CHF|Fr\.)$/
// Printed before the amount only: a trailing "£" belongs to the next price.
const PREFIX_ONLY = /^(?:£|\$)$/
const UNMAPPED = '�'
// An unmapped glyph inside a word of letters is a ligature ("O�er"), not a hidden digit.
const PRICE_GLYPHS = /^[-−–\d.,€£$*'’�]+$/
// Kerning inside one number ("1" "9.99" → 19.99) stays under 0.15 of the height; a space in small print is ~0.18.
const TOUCHING = 0.15
// Glyphs set one by one with tracking ("1" "2." "9" "9" → 12.99) sit up to ~0.2 apart; short pieces may join that far.
const TRACKED = 0.35
// Only glyph fragments of a number join without a space; a word with letters ("330ml,") never does.
const FRAGMENT = /^(?:[-−–\d.,€£$*'’]+|p)$/
// A digit or two, or a separator with a digit: the pieces tracking sets apart ("1" "2." "9" "9").
const DIGIT_PIECE = /^(?:\d{1,2}[.,]?|[.,]\d)$/
// Words of one price separated by a space ("€ 2,99").
const SPACED = 0.6
export const SMALLER = 0.9
// Words of one price have similar heights; a much smaller or larger neighbour is another line of type.
const SAME_TYPE = 0.5
// Numbers as prices print them: decimals, or thousands grouped by a separator other than the decimal one.
const NUMBER_FORMS = [
  /^\d+(?:[.,]\d{1,2})?$/,
  /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/,
  /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/,
  /^\d{1,3}(?:['’ ]\d{3})+(?:[.,]\d{1,2})?$/,
]
const MONEY_MARK = /€|£|\$|CHF|Fr\.|EUR|GBP|\d\s?p\b|\d[.,]\d{1,2}(?!\d)|\d[.,][-–]|^[-−]?[.,]\d{2}$/
const DATE = /^\d{1,2}\.\d{1,2}\.\d*$/

const moneyish = (s: string): boolean =>
  /\d/.test(s) || CURRENCY_WORD.test(s) || (s.includes(UNMAPPED) && PRICE_GLYPHS.test(s))

// Price form: a currency, pence, decimals or a dash for whole units; never a date or a number with a leading zero.
export function priceForm(t: string): boolean {
  if (DATE.test(t) || /^0\d/.test(t)) return false
  const numbers = t.match(/\d[\d.,'’ ]*\d|\d/g) ?? []
  return numbers.every((n) => NUMBER_FORMS.some((f) => f.test(n.trim()))) && MONEY_MARK.test(t)
}

const complete = (s: string): boolean => priceForm(s) && readMoney(s) !== null
const ratio = (a: Word, b: Word): number => Math.min(a.h, b.h) / Math.max(a.h, b.h)
const gap = (a: Word, b: Word): number => b.x - (a.x + a.w)
const touch = (a: Word, b: Word): boolean => {
  if (!FRAGMENT.test(a.str) || !FRAGMENT.test(b.str) || ratio(a, b) < SMALLER) return false
  // Two words that are each a whole price stay two prices however close ("£1" "£2").
  if (complete(a.str) && complete(b.str)) return false
  const piece = DIGIT_PIECE.test(a.str) || DIGIT_PIECE.test(b.str)
  return gap(a, b) <= (piece ? TRACKED : TOUCHING) * Math.max(a.h, b.h)
}

const join = (words: readonly Word[]): string =>
  words
    .map((w, i) => {
      const prev = words[i - 1]
      return prev && !touch(prev, w) ? ` ${w.str}` : w.str
    })
    .join('')

function boxOf(words: readonly Word[]): Occurrence['box'] {
  const x = Math.min(...words.map((w) => w.x))
  const y = Math.min(...words.map((w) => w.y))
  return { x, y, w: Math.max(...words.map((w) => w.x + w.w)) - x, h: Math.max(...words.map((w) => w.y + w.h)) - y }
}

// Euros with smaller top-aligned cents to their right, wherever the stream puts them; a currency sign beside joins.
function chains(words: readonly Word[], taken: Set<number>): Span[] {
  const spans: Span[] = []
  words.forEach((a, i) => {
    if (taken.has(i) || !EUROS.test(a.str)) return
    const right = a.x + a.w
    const j = words.findIndex(
      (b, k) =>
        !taken.has(k) &&
        k !== i &&
        CENTS.test(b.str) &&
        b.h <= a.h * SMALLER &&
        b.x >= right - 0.2 * a.h &&
        b.x <= right + 0.5 * a.h &&
        b.y >= a.y - 0.05 * a.h &&
        b.y <= a.y + 0.5 * a.h,
    )
    const b = words[j]
    if (!b || (/^[-–]/.test(a.str) && !/\d/.test(b.str))) return
    const near = (w: Word): boolean =>
      (w.line === a.line || w.line === b.line) &&
      ((gap(w, a) >= -0.2 * a.h && gap(w, a) <= SPACED * a.h) || (gap(b, w) >= -0.2 * a.h && gap(b, w) <= SPACED * a.h))
    const symbol = words.findIndex((w, k) => !taken.has(k) && SYMBOL.test(w.str) && near(w))
    const ids = symbol >= 0 ? [i, j, symbol] : [i, j]
    ids.forEach((k) => taken.add(k))
    const dashEuros = /^[-–][.,]?$/.test(a.str)
    const sign = /^[-−]\d/.test(a.str) || /^[-−][€£$]/.test(a.str) ? -1 : 1
    const euros = dashEuros ? 0 : Number(a.str.replace(/\D/g, ''))
    const text = `${dashEuros ? '-' : a.str.replace(/[.,]$/, '')},${b.str}`
    spans.push({
      ids,
      text,
      cents: sign * (euros * 100 + (/\d/.test(b.str) ? Number(b.str) : 0)),
      currency: readMoney(`${text} ${words[symbol]?.str ?? ''}`)?.currency ?? null,
    })
  })
  return spans
}

// Longest runs of price words on one line that read as one amount each ("1" ".1" "9", "50" "p", "£" "5").
function lineRuns(words: readonly Word[], taken: Set<number>): Span[] {
  const lines = new Map<string, number[]>()
  words.forEach((w, i) => {
    if (!taken.has(i) && moneyish(w.str)) lines.set(w.line, [...(lines.get(w.line) ?? []), i])
  })
  const spans: Span[] = []
  for (const ids of lines.values()) {
    const sorted = ids.sort((a, b) => (words[a]?.x ?? 0) - (words[b]?.x ?? 0))
    const word = (k: number): Word | undefined => words[sorted[k] ?? -1]
    // An amount never starts or ends inside a group of touching glyphs ("21.09.2026" is not "21.0" and "9.26").
    const touching = (k: number): boolean => {
      const [a, b] = [word(k), word(k + 1)]
      return a !== undefined && b !== undefined && touch(a, b)
    }
    // A sign between two numbers belongs to the closer one; "£" and "$" always to the number after them.
    const danglingSign = (end: number): boolean => {
      const [before, sign, after] = [word(end - 1), word(end), word(end + 1)]
      if (!sign || !SYMBOL.test(sign.str) || !after || !/\d/.test(after.str)) return false
      return PREFIX_ONLY.test(sign.str) || (before !== undefined && gap(sign, after) < gap(before, sign))
    }
    let at = 0
    while (at < sorted.length) {
      let best: { end: number; text: string } | null = null
      for (let end = at; end < sorted.length && !(at > 0 && touching(at - 1)); end++) {
        const [before, last] = [word(end - 1), word(end)]
        if (
          end > at &&
          before &&
          last &&
          (gap(before, last) > SPACED * Math.max(before.h, last.h) || ratio(before, last) < SAME_TYPE)
        )
          break
        if (touching(end) || danglingSign(end)) continue
        const text = join(sorted.slice(at, end + 1).flatMap((k) => words[k] ?? []))
        const unreadable = text.includes(UNMAPPED) && priceForm(text.replaceAll(UNMAPPED, '1'))
        if (unreadable || complete(text)) best = { end, text }
      }
      if (!best) {
        // Touching glyphs that read as no single amount stay visible as an occurrence to be read from the render.
        let end = at
        while (touching(end)) end++
        const text = join(sorted.slice(at, end + 1).flatMap((k) => words[k] ?? []))
        const doubtful = /\d/.test(text) && MONEY_MARK.test(text) && !DATE.test(text) && !/^0\d/.test(text)
        if (end === at || !doubtful) {
          at = end + 1
          continue
        }
        best = { end, text: `${text}${UNMAPPED}` }
      }
      const run = sorted.slice(at, best.end + 1)
      run.forEach((k) => taken.add(k))
      const money = readMoney(best.text)
      spans.push({ ids: run, text: best.text, cents: money?.cents ?? null, currency: money?.currency ?? null })
      at = best.end + 1
    }
  }
  return spans
}

export function ledger(words: readonly Word[]): Occurrence[] {
  const taken = new Set<number>()
  const spans = [...chains(words, taken), ...lineRuns(words, taken)]
  return spans
    .sort((a, b) => Math.min(...a.ids) - Math.min(...b.ids))
    .map((s, n) => {
      const unreadable = s.text.includes(UNMAPPED)
      return {
        id: `o${String(n + 1)}`,
        words: [...s.ids].sort((a, b) => a - b),
        text: s.text.replaceAll(UNMAPPED, '�'),
        cents: unreadable ? null : s.cents,
        currency: s.currency,
        unreadable,
        box: boxOf(s.ids.flatMap((k) => words[k] ?? [])),
      }
    })
}
