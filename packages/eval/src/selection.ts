import { createHash } from 'node:crypto'
import { moneyInText } from './score/money.ts'
import type { Word } from './words.ts'

export type PageFacts = {
  page: number
  layout: string
  words: number
  // Amounts printed with a currency, and amounts of any kind ("12,90"), from the eval's own reader.
  currencyAmounts: number
  amounts: number
  // Numbers set much larger than the page's text: leaflet prices whose cents or currency are separate glyphs.
  largeNumbers: number
}
export type Rule = 'priced' | 'text' | 'empty' | 'spread'
export type Slot = { rule: Rule; count: number } | { fixed: number[] }
type Picked = { pdfPage: number; rule: Rule | 'fixed' }

const LARGE = 1.8
const NUMBER = /^[-−]?\d+(?:[.,]\d{0,2})?[.,\-–]*$/

export function pageFacts(page: number, layout: string, words: readonly Word[]): PageFacts {
  const money = moneyInText(words.map((w) => w.str).join(' '))
  const heights = words.map((w) => w.h).sort((a, b) => a - b)
  const median = heights[Math.floor(heights.length / 2)] ?? 0
  return {
    page,
    layout,
    words: words.length,
    currencyAmounts: money.filter((m) => m.currency !== null).length,
    amounts: money.length,
    largeNumbers: words.filter((w) => NUMBER.test(w.str) && w.h >= median * LARGE).length,
  }
}

// noCurrency: the document prints no currency anywhere, so bare amounts ("12,90") are its prices.
export function eligible(rule: Rule, f: PageFacts, last: number, noCurrency: boolean): boolean {
  const inner = f.page > 1 && f.page < last
  const flat = f.layout === 'single' || f.layout === 'spread' || f.layout === 'panels'
  switch (rule) {
    case 'priced':
      return flat && f.words >= 30 && (f.currencyAmounts >= 3 || f.largeNumbers >= 3 || (noCurrency && f.amounts >= 3))
    case 'text':
      return flat && inner && f.amounts === 0 && f.largeNumbers === 0 && f.words >= 150
    case 'empty':
      return f.words === 0
    case 'spread':
      return f.layout === 'spread'
  }
}

const rank = (seed: string, doc: string, page: number): string =>
  createHash('sha256')
    .update(`${seed}:${doc}:${String(page)}`)
    .digest('hex')

// Fills the slots in order with the best-ranked eligible pages. The next priced pages are spares (replacement and
// top-up, in order); the ones after them are the reserve for a retest, never opened before it.
export function select(
  seed: string,
  doc: string,
  facts: readonly PageFacts[],
  slots: readonly Slot[],
  counts: { spare: number; reserve: number },
): { picked: Picked[]; spare: number[]; reserve: number[] } {
  const last = facts.length
  const noCurrency = facts.every((f) => f.currencyAmounts === 0)
  const ranked = (rule: Rule, taken: readonly number[]): number[] =>
    facts
      .filter((f) => eligible(rule, f, last, noCurrency) && !taken.includes(f.page))
      .map((f) => f.page)
      .sort((a, b) => rank(seed, doc, a).localeCompare(rank(seed, doc, b)))
  const picked: Picked[] = []
  for (const slot of slots) {
    const taken = picked.map((p) => p.pdfPage)
    if ('fixed' in slot) picked.push(...slot.fixed.map((pdfPage): Picked => ({ pdfPage, rule: 'fixed' })))
    else
      picked.push(
        ...ranked(slot.rule, taken)
          .slice(0, slot.count)
          .map((pdfPage) => ({ pdfPage, rule: slot.rule })),
      )
  }
  const rest = ranked(
    'priced',
    picked.map((p) => p.pdfPage),
  )
  return {
    picked,
    spare: rest.slice(0, counts.spare),
    reserve: rest.slice(counts.spare, counts.spare + counts.reserve),
  }
}
