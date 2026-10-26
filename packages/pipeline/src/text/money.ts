const CURRENCY = /[€£$]|\b(?:EUR|GBP|USD)\b/g
const HAS_CURRENCY = /[€£$]|\b(?:EUR|GBP|USD)\b/
// A first group starting with 0 is never thousands ("$0.125/kWh" is not $125).
const AMOUNT = /^([1-9]\d{0,2}(?:[.,]\d{3})+|\d*)(?:[.,](\d{2}|\d|-))?$/
// Pence written on the digits ("99p"); lower case only, so "12P" (pieces) is not money.
export const PENCE = /^\d{1,3}p$/
const NUM = String.raw`\d+(?:\.\d{1,2})?`
const CENTS = String.raw`\d+\.\d{1,2}`
// A price per unit ("$30/dz", "$48/2 dz", "$2ea") needs a sign or cents: "1/2 lb" is a measure.
const PRICED = String.raw`(?:[$€£]${NUM}|${CENTS})`
const PER_UNIT = String.raw`${PRICED}(?:\/(?:\d+\s?)?[a-z]{1,6}\.?|ea\.?)`
// One amount as printed: a sign or none, digits, cents with or without a leading digit (".75").
const TOKEN = String.raw`[$€£]?(?:\d+(?:\.\d{1,2})?|\.\d{2})`
// An add-on ("+12", "+ 4.50"), a price per person ("49pp", "49 p.p.") and a "from" price with a sign or cents ("$1200+";
// "18+" is an age) keep their mark: never formatted.
const MARKED = String.raw`\+\s?${TOKEN}|${TOKEN}\s?p\.?p\.?|${PRICED}\s?\+`
const MARKED_WORDS = new RegExp(`^(?:${MARKED})$`, 'i')
export const marked = (words: string): boolean => MARKED_WORDS.test(words)
// Shown as printed, never formatted: market price, "FREE", two sizes ("22/32"), one decimal and no sign ("18.9", see
// parseMoney), a multi-buy with a sign ("2/$5"), a price per unit and marked prices.
const AS_PRINTED = new RegExp(
  String.raw`^(?:m\.?p\.?|mkt\.?|market price|free|a\.?q\.?|${NUM}\/${NUM}|\d+\.\d|\d{1,2}\/[$€£]${NUM}|${PER_UNIT}|${MARKED})$`,
  'i',
)
// Sizes in one word ("$65/80/90", "3.99/4.99/5.99") need a sign or cents and rise: a date ("10/16/2026") or a count
// cut short ("$12/2") is no price. A size not served is a dash ("£10/-/54"); all with cents may repeat ("5.95/7.95/7.95").
const NOT_SERVED = '[-\u2013\u2014]'
const DASH = new RegExp(`^${NOT_SERVED}$`)
const DIGITS_ONLY = new RegExp(String.raw`^[$€£]?(?:[\d./]|${NOT_SERVED})+$`)
export const SIZED = new RegExp(
  String.raw`^(?:[$€£]${NUM}(?:\/(?:${NUM}|${NOT_SERVED}))+|${CENTS}(?:\/(?:${CENTS}|${NOT_SERVED}))+)$`,
)
const rising = (words: string): boolean => {
  if (!DIGITS_ONLY.test(words)) return true
  const parts = words
    .replace(/^[$€£]/, '')
    .split('/')
    .filter((a) => !DASH.test(a))
  const repeats = parts.every((a) => /\.\d{2}$/.test(a))
  const amounts = parts.map(Number)
  return amounts.every((a, i) => i === 0 || a > (amounts[i - 1] ?? 0) || (repeats && a === amounts[i - 1]))
}
export const printedAsIs = (words: string): boolean => (AS_PRINTED.test(words) || SIZED.test(words)) && rising(words)
export const CENTS_HEIGHT_RATIO = 0.8

export type PricePart = { str: string; height: number }
export type Currency = 'EUR' | 'GBP' | 'USD'
const SIGNS: Record<string, Currency> = { '€': 'EUR', EUR: 'EUR', '£': 'GBP', GBP: 'GBP', $: 'USD', USD: 'USD' }

// Every currency a text names, pence included; more than one means the words do not state one price.
export function currenciesIn(s: string): Currency[] {
  const found = (s.match(CURRENCY) ?? []).flatMap((m) => SIGNS[m] ?? [])
  if (s.split(/\s+/).some((w) => PENCE.test(w))) found.push('GBP')
  return [...new Set(found)]
}

// The page states a currency when its words name exactly one, at least twice; a stray mark ("Deposit €10" on a £ menu)
// leaves two currencies, so no fallback. ponytail: "Alle Preise in €" alone does not count; add a stated-currency line if it costs review.
export function pageCurrency(pageText: string): Currency | null {
  const marks = [
    ...(pageText.match(CURRENCY) ?? []).flatMap((m) => SIGNS[m] ?? []),
    ...pageText
      .split(/\s+/)
      .filter((w) => PENCE.test(w))
      .map((): Currency => 'GBP'),
  ]
  const [only, ...others] = new Set(marks)
  return only && others.length === 0 && marks.length >= 2 ? only : null
}

// `whole`: the page printed no decimals ("£32"), so none are added.
export const formatMoney = (cents: number, lang: string, currency: Currency, whole = false): string =>
  new Intl.NumberFormat(lang, { style: 'currency', currency, ...(whole ? { maximumFractionDigits: 0 } : {}) }).format(
    cents / 100,
  )

// The sign a locale writes round an amount, with only the space between it and the digits: added to printed
// digits whose sign the page prints elsewhere ("4.25" on a £ menu reads "£4.25", "4,25 €" in German).
export function signAround(lang: string, currency: Currency): { before: string; after: string } {
  const parts = new Intl.NumberFormat(lang, { style: 'currency', currency }).formatToParts(1)
  const at = parts.findIndex((p) => p.type === 'currency')
  const digits = parts.flatMap((p, i) => (p.type === 'integer' || p.type === 'fraction' ? [i] : []))
  const [first = 0, last = 0] = [digits[0], digits.at(-1)]
  const join = (from: number, to: number): string =>
    parts
      .slice(from, to)
      .map((p) => p.value)
      .join('')
  return at < first ? { before: join(at, first), after: '' } : { before: '', after: join(last + 1, at + 1) }
}

// Bare digits without a currency sign follow the leaflet convention of fused euros and cents ("269" = 2,69);
// callers keep such amounts in review and never show them reformatted.
export function parseMoney(s: string): number | null {
  const hasCurrency = HAS_CURRENCY.test(s)
  let t = s.normalize('NFKC').replace(/−/g, '-').replace(CURRENCY, '').replace(/\s/g, '')
  if (PENCE.test(t)) return Number(t.slice(0, -1))
  let sign = 1
  if (t.startsWith('-')) {
    if (t[1] !== ',' && t[1] !== '.') sign = -1
    t = t.slice(1)
  }
  const m = AMOUNT.exec(t)
  if (!m || (m[1] === '' && m[2] === undefined)) return null
  const grouped = /[.,]/.test(m[1] ?? '')
  // Pounds and dollars group thousands with a comma; "$1.299" is not one amount.
  if (grouped && /[£$]|GBP|USD/.test(s) && (m[1] ?? '').includes('.')) return null
  // One decimal ("£12.5") only next to a currency: bare "26,9" is a misread 2,69.
  if (m[2]?.length === 1 && m[2] !== '-' && !hasCurrency) return null
  const whole = Number((m[1] ?? '').replace(/[.,]/g, '') || '0')
  if (m[2] === undefined) return sign * (hasCurrency || grouped ? whole * 100 : whole)
  const cents = m[2] === '-' ? 0 : m[2].length === 1 ? Number(m[2]) * 10 : Number(m[2])
  return sign * (whole * 100 + cents)
}

export function moneyFromParts(parts: readonly PricePart[]): number | null {
  const [euros, cents] = parts
  if (
    parts.length === 2 &&
    euros &&
    cents &&
    /^-?\d+[,.]?$/.test(euros.str) &&
    /^\d{2}$/.test(cents.str) &&
    cents.height < euros.height * CENTS_HEIGHT_RATIO
  ) {
    const sign = euros.str.startsWith('-') ? -1 : 1
    return sign * (Math.abs(Number(euros.str.replace(/[,.]$/, ''))) * 100 + Number(cents.str))
  }
  return parseMoney(parts.map((p) => p.str).join(' '))
}
