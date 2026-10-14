// Printed text turned into markup without changing a character of it: links, dietary codes, short badges.

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const URL = String.raw`(?:https?:\/\/|www\.)[^\s<>"]*[^\s<>".,;:!?)]`
const DOMAIN = String.raw`\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|co\.uk|org\.uk|uk|org|net|de|at|ch|eu|us|ie|nl|info|biz)\b(?:\/[^\s<>"]*[^\s<>".,;:!?)])?`
const EMAIL = String.raw`\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b`
// A phone number starts with 0 or + (UK, DACH, international) or is a US (555) 555-5555; never a price or a year.
const PHONE = String.raw`(?:\+|\b0)\d[\d ()-]{6,16}\d\b|\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b`
const LINKABLE = new RegExp(`(${EMAIL})|(${URL})|(${DOMAIN})|(${PHONE})`, 'gi')
const MIN_PHONE_DIGITS = 9

// Escaped text with every printed web address, e-mail and phone number as a link; the href is built only from
// the matched characters, so nothing else reaches an attribute.
export function linkify(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(LINKABLE)) {
    const [match, email, url, domain, phone] = m
    const digits = phone?.replace(/[^\d+]/g, '') ?? ''
    const href = email
      ? `mailto:${email}`
      : url
        ? /^https?:/i.test(url)
          ? url
          : `https://${url}`
        : domain
          ? `https://${domain}`
          : digits.replace(/\D/g, '').length >= MIN_PHONE_DIGITS
            ? `tel:${digits}`
            : null
    if (!href) continue
    out += `${esc(text.slice(last, m.index))}<a href="${esc(href)}">${esc(match)}</a>`
    last = m.index + match.length
  }
  return out + esc(text.slice(last))
}

export type Legend = ReadonlyMap<string, string>
const ENTRY = /^(\p{Lu}{1,4})\s*[-–=:]?\s+(\p{Lu}\p{Ll}+(?: \p{L}+){0,3})$/u
const MIN_ENTRIES = 2

// A dietary legend as printed: one block (a list, or a paragraph split by commas) whose every line is a short
// code and its words ("V Vegetarian", "GF – Gluten Free"), at least two of them; else none.
export function legendOf(blocks: readonly (readonly string[])[]): Legend {
  for (const lines of blocks) {
    const matched = lines.flatMap((t) => t.split(/\s*[,·|;]\s*/)).map((p) => ENTRY.exec(p.trim()))
    const entries = new Map(matched.flatMap((m) => (m?.[1] && m[2] ? [[m[1], m[2]] as const] : [])))
    if (entries.size >= MIN_ENTRIES && entries.size === matched.length) return entries
  }
  return new Map()
}

// The legend's codes printed at the end of a text ("with a sweet chilli dip V GFO"): the text without them, and
// the codes in order.
export function trailingCodes(text: string, legend: Legend): { rest: string; codes: string[] } {
  const words = text.trim().split(/\s+/)
  const codes: string[] = []
  while (words.length && legend.has(words.at(-1) ?? '')) codes.unshift(words.pop() ?? '')
  return { rest: words.join(' '), codes }
}

// The code stays visible; a screen reader hears the legend's word (the comma keeps two expansions apart).
export const dietTag = (code: string, legend: Legend): string =>
  `<span class="diet"><span aria-hidden="true">${esc(code)}</span><span class="sr-only">, ${esc(legend.get(code) ?? code)}</span></span>`

// A short printed badge ("AKTION", "EXTREM AKTION", "-33 %") shown as one.
const MAX_BADGE = 16
export const isBadge = (text: string): boolean =>
  (text.length <= MAX_BADGE && !/\d/.test(text) && text === text.toUpperCase() && /\p{Lu}/u.test(text)) ||
  /^[-−]\s?\d+\s?%$/.test(text)

// An add-on line under a dish ("Add vegan cheese £1").
export const isAddOn = (text: string): boolean => /^(?:add|extra|plus)\b/i.test(text)
