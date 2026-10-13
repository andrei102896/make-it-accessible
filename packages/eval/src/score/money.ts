// The scorer's own price reader, independent of the pipeline's parser, so a parsing bug cannot grade itself.
export const CURRENCIES = ['EUR', 'GBP', 'CHF', 'USD'] as const
// A table column whose header prints a currency ("€", "Price £") holds prices even when its cells print none.
export const CURRENCY_HEADER = /[€£$]|\bCHF\b|\bEUR\b|\bGBP\b/
export type Currency = (typeof CURRENCIES)[number]
export type Money = { cents: number; currency: Currency | null }

const MARKERS: [RegExp, Currency][] = [
  [/€|\bEUR\b/i, 'EUR'],
  [/£|\bGBP\b/i, 'GBP'],
  [/\bCHF\b|\bFr\./i, 'CHF'],
  [/\$|\bUSD\b/i, 'USD'],
]
// A space separates thousands only before a three-digit group ("7 500"); "0.59 0.99" is two numbers.
const NUMBER =
  /[-\u2212]?(?:\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?(?![\d.,])|\d[\d.,'\u2019]*\d|\d)(?:[.,](?:-|–))?|[-\u2212]?[.,]\d{2}|[-\u2212]?[.,]-/g
// Pence may carry a tenth ("16.7p/capsule" on unit prices), so an amount in cents is not always an integer.
const PENCE = /(?:^|[^\d.,])(\d{1,3}(?:[.,]\d)?)\s?p\b/i
// A glyph without a Unicode mapping (U+FFFD) hides a digit; such a price cannot be read from the text layer.
const UNMAPPED = '\ufffd'

function cents(token: string): number | null {
  // "-,99" prints zero euros as a dash, so only a dash before a digit is a minus sign.
  const sign = /^[-\u2212]\d/.test(token) ? -1 : 1
  const t = token.replace(/^[-\u2212]/, '').replace(/[\s'\u2019]/g, '')
  const whole = /^(\d+)[.,][-–]$/.exec(t)
  if (whole) return sign * Number(whole[1]) * 100
  if (/^[.,]-$/.test(t)) return null
  const separators = [...t.matchAll(/[.,]/g)]
  const last = separators.at(-1)
  if (!last) return sign * Number(t) * 100
  const tail = t.slice(last.index + 1)
  // One or two digits after the last separator are decimals; three are a thousands group ("1.299", "£7,500").
  const decimals = tail.length <= 2 ? tail : ''
  const integer = (decimals ? t.slice(0, last.index) : t).replace(/[.,]/g, '') || '0'
  if (!/^\d+$/.test(integer) || !/^\d*$/.test(decimals)) return null
  return sign * (Number(integer) * 100 + (decimals ? Number(decimals.padEnd(2, '0')) : 0))
}

// Reads one rendered or printed price ("2,99 €", "£7,500.00", "CHF 4.95", "99p", "-,99"); two numbers make it unreadable.
export function readMoney(text: string): Money | null {
  const t = text
    .normalize('NFKC')
    .replace(/[\u00a0\u202f]/g, ' ')
    .trim()
  // A percentage is a discount rate, never an amount.
  if (t.includes('%') || t.includes(UNMAPPED)) return null
  const currency = MARKERS.find(([re]) => re.test(t))?.[1] ?? null
  const tokens = [...t.matchAll(NUMBER)].map((m) => m[0].trim())
  const [token] = tokens
  if (token === undefined || tokens.length > 1) return null
  const pence = currency === null ? PENCE.exec(t) : null
  if (pence) return { cents: (/^[-\u2212]/.test(t) ? -1 : 1) * Number(pence[1]?.replace(',', '.')), currency: 'GBP' }
  const value = cents(token)
  // "-€1.40" puts the sign before the currency symbol.
  const signed = /^[-\u2212]\s?(?:€|£|\$|CHF)/.test(t) && value !== null ? -Math.abs(value) : value
  return signed === null ? null : { cents: signed, currency }
}

// A key string that is nothing but an amount ("13.45", "-,65", "£7500") may be satisfied by the amount alone.
export const isAmount = (s: string): boolean =>
  /^[-\u2212]?(?:€|£|\$|CHF|Fr\.)?\s?[\d.,'\s]*\d[\d.,'\s]*(?:,-|\.–)?\s?(?:€|£|\$|p|CHF|EUR|GBP)?$|^-,\d{2}$/.test(
    s.trim(),
  )

// The text as the money reader sees it: NFKC, no-break spaces as spaces.
export const moneyText = (text: string): string => text.normalize('NFKC').replace(/[\u00a0\u202f]/g, ' ')

// Only € and CHF are printed after the amount; "59 £" is the end of one price and the start of the next.
const IN_TEXT =
  /(?:€|£|\$|CHF|Fr\.|EUR|GBP)\s?[-\u2212]?\d[\d.,]*(?:[.,][-–])?|[-\u2212]?\d[\d.,]*(?:[.,][-–])?\s?(?:€|CHF|EUR)|\d{1,3}(?:[.,]\d)?p\b|[-\u2212]?\d+[.,]\d{2}(?!\d)|-,\d{2}/g

// Every price written in running text, with where it stands in `moneyText(text)`.
export function moneySpans(text: string): { at: number; end: number; money: Money }[] {
  const t = moneyText(text)
  return [...t.matchAll(IN_TEXT)].flatMap((m) => {
    // "-£1.40": a minus standing alone before the currency symbol belongs to the amount.
    const at = /(?:^|\s)[-\u2212]$/.test(t.slice(0, m.index)) && /^\D/.test(m[0]) ? m.index - 1 : m.index
    const money = readMoney(t.slice(at, m.index + m[0].length))
    return money ? [{ at, end: m.index + m[0].length, money }] : []
  })
}

// Every price written in running text, for containers that print prices without a price element.
export const moneyInText = (text: string): Money[] => moneySpans(text).map((s) => s.money)
