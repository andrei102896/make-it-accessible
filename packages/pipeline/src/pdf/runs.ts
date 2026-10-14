import { CENTS_HEIGHT_RATIO, currenciesIn, moneyFromParts, parseMoney, PENCE, type Currency } from '../text/money.ts'
import { iou } from './geometry.ts'
import type { Run } from './types.ts'

const DUPLICATE_IOU = 0.8
const CURRENCY_WORD = /^[€£$]$/
const AMOUNT_PART = /^(?:[€£$]|[-\u2212]?\d[\d.,]*(?:,-)?|-,\d{2}|\d{1,3}p)$/
const TOUCHING_GAP = 0.02
const MIN_CENTS_RATIO = 0.3

export function findDuplicates(runs: readonly Run[]): string[] {
  const duplicates: string[] = []
  runs.forEach((r, i) => {
    const earlier = runs.slice(0, i).some((o) => o.str === r.str && iou(o.box, r.box) > DUPLICATE_IOU)
    if (earlier) duplicates.push(r.id)
  })
  return duplicates
}

const touching = (a: Run, b: Run): boolean =>
  a.line === b.line && Math.abs(b.box.x - (a.box.x + a.box.w)) < b.box.h * TOUCHING_GAP

// Ligatures and kerning split one word into touching runs ("effi" + "ciency"); those join without a space.
export function joinRuns(runs: readonly Run[]): string {
  return runs
    .map((r, i) => {
      const prev = runs[i - 1]
      return prev && touching(prev, r) ? r.str : (prev ? ' ' : '') + r.str
    })
    .join('')
}

// A price set glyph by glyph ("£8." + "95", "1" + ".1" + "9") is one amount when its pieces touch, share a height
// and meet at the separator; small cents are a pair instead, and a third decimal ("1.99" + "²") is not joined.
function joinPriceGlyphs(runs: readonly Run[]): Run[] {
  const sorted = [...runs].sort((a, b) => a.line - b.line || a.box.x - b.box.x)
  const out: Run[] = []
  for (const r of sorted) {
    const prev = out.at(-1)
    const str = prev ? prev.str + r.str : ''
    const sameHeight = prev
      ? Math.min(prev.box.h, r.box.h) >= Math.max(prev.box.h, r.box.h) * CENTS_HEIGHT_RATIO
      : false
    const atSeparator =
      prev !== undefined &&
      (/[.,]$/.test(prev.str) || /^[.,]\d/.test(r.str) || (/[.,]/.test(prev.str) && /^\d+$/.test(r.str)))
    if (prev && touching(prev, r) && sameHeight && atSeparator && !/[.,]\d{3,}$/.test(str)) {
      const right = Math.max(prev.box.x + prev.box.w, r.box.x + r.box.w)
      out[out.length - 1] = { ...prev, str, box: { ...prev.box, w: right - prev.box.x } }
    } else out.push(r)
  }
  return out
}

// Leaflet prices print cents smaller, right of and top-aligned with the euros; the stream order is unreliable.
export function centPartner(euros: Run, runs: readonly Run[]): Run | undefined {
  if (!/^-?\d+[,.]?$/.test(euros.str)) return undefined
  const right = euros.box.x + euros.box.w
  const distance = (c: Run): number => Math.abs(c.box.x - right) + Math.abs(c.box.y - euros.box.y)
  const candidates = runs.filter(
    (c) =>
      /^\d{2}$/.test(c.str) &&
      c.box.h < euros.box.h * CENTS_HEIGHT_RATIO &&
      c.box.h > euros.box.h * MIN_CENTS_RATIO &&
      Math.abs(c.box.x - right) < euros.box.h * 0.3 &&
      c.box.y >= euros.box.y - 1 &&
      c.box.y < euros.box.y + euros.box.h * 0.5,
  )
  return candidates.sort((a, b) => distance(a) - distance(b))[0]
}

const bare = (word: string): string => word.replace(/^\(+/, '').replace(/[)*]+$/, '')
const SIGN_FIRST = /^[€£$](?=[-\u2212]?\d)/

// `currency` is null when neither the words nor the page state one (an error, never a guess).
export type Amount = { cents: number; currency: Currency | null; fromBareDigits: boolean }

// Amount printed by the cited words: a euro/cent pair, else the one word with a separator, else one bare number.
// Its currency is the one the words print, else the page's (`pageCurrency`); two currencies are no amount.
export function amountOf(cited: readonly Run[], pageCurrency: Currency | null = null): Amount | null {
  const own = currenciesIn(cited.map((r) => r.str).join(' '))
  if (own.length > 1) return null
  const currency = own[0] ?? pageCurrency
  const words = joinPriceGlyphs(cited)
    .flatMap((r) => {
      const str = bare(r.str)
      return SIGN_FIRST.test(str)
        ? [
            { ...r, str: str.slice(0, 1) },
            { ...r, str: str.slice(1), signed: true },
          ]
        : [{ ...r, str }]
    })
    .filter((r) => AMOUNT_PART.test(r.str))
    .sort((a, b) => a.box.x - b.box.x)
  const signs = words.filter((r) => CURRENCY_WORD.test(r.str)).map((r) => r.str)
  const numbers = words.filter((r) => !CURRENCY_WORD.test(r.str))
  const [first, second] = numbers
  if (numbers.length === 2 && first && second && centPartner(first, [second]) === second) {
    const cents = moneyFromParts(numbers.map((r) => ({ str: r.str, height: r.box.h })))
    return cents === null ? null : { cents, currency, fromBareDigits: false }
  }
  const separated = numbers.filter((r) => /[.,]/.test(r.str))
  const chosen = separated.length === 1 ? separated[0] : numbers.length === 1 ? first : undefined
  if (!chosen) return null
  const cents = parseMoney([...signs, chosen.str].join(' '))
  // A sign printed on the digits ("£7500", "99p") makes them a whole amount; a separate sign may sit beside fused cents.
  const fromBareDigits = !/[.,]/.test(chosen.str) && !('signed' in chosen) && !PENCE.test(chosen.str)
  return cents === null ? null : { cents, currency, fromBareDigits }
}
