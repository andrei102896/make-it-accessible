import { CENTS_HEIGHT_RATIO, moneyFromParts, parseMoney } from '../text/money.ts'
import { iou } from './geometry.ts'
import type { Run } from './types.ts'

const DUPLICATE_IOU = 0.8
const CURRENCY_WORD = /^[€£$]$/
const AMOUNT_PART = /^(?:[€£$]|[-\u2212]?\d[\d.,]*(?:,-)?|-,\d{2})$/
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

// Ligatures and kerning split one word into touching runs ("effi" + "ciency"); those join without a space.
export function joinRuns(runs: readonly Run[]): string {
  return runs
    .map((r, i) => {
      const prev = runs[i - 1]
      if (!prev) return r.str
      const touching = prev.line === r.line && Math.abs(r.box.x - (prev.box.x + prev.box.w)) < r.box.h * TOUCHING_GAP
      return (touching ? '' : ' ') + r.str
    })
    .join('')
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

export type Amount = { cents: number; fromBareDigits: boolean }

// Amount printed by the cited words: a euro/cent pair, else the one word with a separator, else one bare number.
export function amountOf(cited: readonly Run[]): Amount | null {
  const words = cited
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
  const currency = words.filter((r) => CURRENCY_WORD.test(r.str)).map((r) => r.str)
  const numbers = words.filter((r) => !CURRENCY_WORD.test(r.str))
  const [first, second] = numbers
  if (numbers.length === 2 && first && second && centPartner(first, [second]) === second) {
    const cents = moneyFromParts(numbers.map((r) => ({ str: r.str, height: r.box.h })))
    return cents === null ? null : { cents, fromBareDigits: false }
  }
  const separated = numbers.filter((r) => /[.,]/.test(r.str))
  const chosen = separated.length === 1 ? separated[0] : numbers.length === 1 ? first : undefined
  if (!chosen) return null
  const cents = parseMoney([...currency, chosen.str].join(' '))
  // A sign printed on the digits ("£7500") makes them a whole amount; a separate sign may sit beside fused cents.
  const fromBareDigits = !/[.,]/.test(chosen.str) && !('signed' in chosen)
  return cents === null ? null : { cents, fromBareDigits }
}
