const SOFT_HYPHEN = /\u00AD/g
const APOSTROPHE = /[\u2018\u2019]/g
const LETTER_SPACED = /(?<!\p{L})(?:\p{L} ){2,}\p{L}(?!\p{L})/gu

export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(SOFT_HYPHEN, '')
    .replace(APOSTROPHE, "'")
    .replace(/\s+/g, ' ')
    .replace(LETTER_SPACED, (m) => m.replace(/ /g, ''))
    .trim()
    .toLowerCase()
}

export function canon(s: string): string {
  return norm(s).replace(/\s/g, '')
}
