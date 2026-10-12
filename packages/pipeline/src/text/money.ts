const CURRENCY = /[€£$]|\bEUR\b|\bGBP\b/g
const HAS_CURRENCY = /[€£$]|\bEUR\b|\bGBP\b/
const AMOUNT = /^(\d{1,3}(?:[.,]\d{3})+|\d*)(?:[.,](\d{2}|-))?$/
export const CENTS_HEIGHT_RATIO = 0.8

export type PricePart = { str: string; height: number }

// Bare digits without a currency sign follow the leaflet convention of fused euros and cents ("269" = 2,69);
// ponytail: corpus-specific heuristic, revisit when a test document prints whole amounts without a sign.
export function parseMoney(s: string): number | null {
  const hasCurrency = HAS_CURRENCY.test(s)
  let t = s
    .normalize('NFKC')
    .replace(/\u2212/g, '-')
    .replace(CURRENCY, '')
    .replace(/\s/g, '')
  let sign = 1
  if (t.startsWith('-')) {
    if (t[1] !== ',' && t[1] !== '.') sign = -1
    t = t.slice(1)
  }
  const m = AMOUNT.exec(t)
  if (!m || (m[1] === '' && m[2] === undefined)) return null
  const whole = Number((m[1] ?? '').replace(/[.,]/g, '') || '0')
  const grouped = /[.,]/.test(m[1] ?? '')
  if (m[2] === undefined) return sign * (hasCurrency || grouped ? whole * 100 : whole)
  return sign * (whole * 100 + (m[2] === '-' ? 0 : Number(m[2])))
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
