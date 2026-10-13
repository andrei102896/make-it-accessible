// The scorer's own price reader, independent of the pipeline's parser, so a parsing bug cannot grade itself.
export const CURRENCIES = ['EUR', 'GBP', 'CHF', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]
export type Money = { cents: number; currency: Currency | null }

const MARKERS: [RegExp, Currency][] = [
  [/€|\bEUR\b/i, 'EUR'],
  [/£|\bGBP\b/i, 'GBP'],
  [/\bCHF\b|\bFr\./i, 'CHF'],
  [/\$|\bUSD\b/i, 'USD'],
]
const NUMBER = /[-\u2212]?(?:\d[\d.,'\u2019\s]*\d|\d)(?:[.,](?:-|–))?|[-\u2212]?[.,]\d{2}|[-\u2212]?[.,]-/g
const PENCE = /^(\d{1,2})\s?p$/i

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
  const t = text.replace(/[\u00a0\u202f]/g, ' ').trim()
  const pence = PENCE.exec(t)
  if (pence) return { cents: Number(pence[1]), currency: 'GBP' }
  const currency = MARKERS.find(([re]) => re.test(t))?.[1] ?? null
  const tokens = [...t.matchAll(NUMBER)].map((m) => m[0].trim())
  const [token] = tokens
  if (token === undefined || tokens.length > 1) return null
  const value = cents(token)
  // "-€1.40" puts the sign before the currency symbol.
  const signed = /^[-\u2212]\s?(?:€|£|\$|CHF)/.test(t) && value !== null ? -Math.abs(value) : value
  return signed === null ? null : { cents: signed, currency }
}

// Every price written in running text, for containers that print prices without a price element.
// A key string that is nothing but an amount ("13.45", "-,65", "£7500") may be satisfied by the amount alone.
export const isAmount = (s: string): boolean =>
  /^[-\u2212]?(?:€|£|\$|CHF|Fr\.)?\s?[\d.,'\s]*\d[\d.,'\s]*(?:,-|\.–)?\s?(?:€|£|\$|p|CHF|EUR|GBP)?$|^-,\d{2}$/.test(
    s.trim(),
  )

export function moneyInText(text: string): Money[] {
  const found = text
    .replace(/[\u00a0\u202f]/g, ' ')
    .match(
      /(?:€|£|\$|CHF|EUR|GBP)\s?[-\u2212]?\d[\d.,]*|[-\u2212]?\d[\d.,]*(?:,-)?\s?(?:€|£|\$|CHF|EUR|GBP)|\d{1,2}p\b|[-\u2212]?\d+[.,]\d{2}(?!\d)|-,\d{2}/g,
    )
  return (found ?? []).flatMap((m) => readMoney(m) ?? [])
}
