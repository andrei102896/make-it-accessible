import type { ClaimV3, KeyPageV3 } from './key-schema-v3.ts'
import { conditionText, count, valueOf, type Amount, type Source } from './key-v3.ts'
import { findOffer, isMoney, tokens, type Token } from './score/conditions.ts'
import type { Word } from './words.ts'

// Words printed within this many box heights of an amount are taken as printed with it (a badge beside a price).
const NEAR = 3
// A glyph without a Unicode mapping hides one to three letters ("O�er"); this letter stands for it in tokens.
const HIDDEN = 'ǂ'
type Box = { x: number; y: number; w: number; h: number }
type Valued = Extract<ClaimV3, { kind: 'price' | 'cell' | 'text' }>

const valued = (c: ClaimV3 | undefined): c is Valued => c?.kind === 'price' || c?.kind === 'cell' || c?.kind === 'text'
const ownWords = (s: Source): number[] => s.occurrence?.words ?? s.manual?.words ?? []

function place(s: Source, words: readonly Word[]): Box | undefined {
  if (s.occurrence) return s.occurrence.box
  if (s.manual?.box) return s.manual.box
  const own = ownWords(s).flatMap((i) => words[i] ?? [])
  if (!own.length) return undefined
  const x = Math.min(...own.map((w) => w.x))
  const y = Math.min(...own.map((w) => w.y))
  return { x, y, w: Math.max(...own.map((w) => w.x + w.w)) - x, h: Math.max(...own.map((w) => w.y + w.h)) - y }
}

// Whether a text line printed near the place holds the phrase: then it is in the text layer there, not only in the image.
function printedNear(phrase: string, box: Box | undefined, words: readonly Word[]): boolean {
  if (!box) return false
  const m = NEAR * box.h
  const near = (w: Word): boolean =>
    w.x + w.w / 2 >= box.x - m &&
    w.x + w.w / 2 <= box.x + box.w + m &&
    w.y + w.h / 2 >= box.y - m &&
    w.y + w.h / 2 <= box.y + box.h + m
  const lines = new Set(words.filter(near).map((w) => w.line))
  const wanted = tokens(phrase)
  return [...lines].some(
    (line) =>
      findOffer(
        wanted,
        tokens(
          words
            .filter((w) => w.line === line)
            .map((w) => w.str)
            .join(' '),
        ),
        { negated: true },
      ).length > 0,
  )
}

// The cited words as printed, each claimed amount among them standing once as its claimed value.
function citedText(
  cited: readonly number[],
  page: KeyPageV3,
  all: Map<string, Source>,
  words: readonly Word[],
): string {
  const owner = new Map<number, string>()
  // Manual amounts own their words first: a split occurrence's words belong to its parts.
  for (const s of [...all.values()].sort((a, b) => Number(!a.manual) - Number(!b.manual))) {
    const claim = page.occurrences[s.id]
    for (const w of ownWords(s)) if (!owner.has(w)) owner.set(w, claim?.kind === 'merged' ? claim.into : s.id)
  }
  const parts: { text: string; word?: Word }[] = []
  const shown = new Set<string>()
  for (const i of cited) {
    const w = words[i]
    if (!w) continue
    const id = owner.get(i)
    const s = id === undefined ? undefined : all.get(id)
    const claim = id === undefined ? undefined : page.occurrences[id]
    const v = s && valued(claim) ? valueOf(claim, s) : null
    if (id !== undefined && v) {
      if (!shown.has(id)) parts.push({ text: v.printed })
      shown.add(id)
      continue
    }
    const text = w.str.replaceAll('�', HIDDEN)
    const prev = parts.at(-1)
    // A word hyphenated at the end of a line goes on at the start of the next.
    if (prev?.word && prev.word.line !== w.line && prev.text.endsWith('-'))
      parts[parts.length - 1] = { text: prev.text.slice(0, -1) + text, word: w }
    else parts.push({ text, word: w })
  }
  return parts.map((p) => p.text).join(' ')
}

// Printed and written tokens agree: amounts by value and currency, words letter for letter, a hidden glyph by 1–3 letters.
const alike = (printed: Token, written: Token | undefined): boolean =>
  isMoney(printed)
    ? written !== undefined &&
      isMoney(written) &&
      printed.cents === written.cents &&
      printed.currency === written.currency
    : typeof written === 'string' &&
      new RegExp(
        `^${printed
          .split(HIDDEN)
          .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
          .join('\\p{L}{1,3}')}$`,
        'u',
      ).test(written)

function checkOffer(
  id: string,
  claim: Extract<ClaimV3, { kind: 'text' }>,
  s: Source,
  v: Amount | null,
  ctx: { page: KeyPageV3; all: Map<string, Source>; words: readonly Word[]; where: string },
): string[] {
  const { page, all, words, where } = ctx
  const problems: string[] = []
  const offer = conditionText(claim.offer)
  const at = `${where}: the offer of ${id} "${offer}"`
  const prints = (t: Token): boolean =>
    isMoney(t) && t.cents === v?.cents && (t.currency === null || v.currency === null || t.currency === v.currency)
  if (v && !tokens(offer).some(prints)) problems.push(`${at} does not print ${v.printed}`)
  if (typeof claim.offer !== 'string') {
    if (claim.offerWords.length) problems.push(`${at} is read from the render and cites no words`)
    if (printedNear(offer, place(s, words), words)) problems.push(`${at} is in the text layer at its place; cite it`)
    else if (!claim.offer.confirmed) problems.push(`${at} read from the render awaits Andrei's confirmation`)
    return problems
  }
  if (s.manual?.source === 'image') return [...problems, `${at}: an image amount's offer is read from the render`]
  if (claim.offerWords.some((i) => !words[i])) problems.push(`${at} cites a word the snapshot does not have`)
  if (!ownWords(s).every((i) => claim.offerWords.includes(i))) problems.push(`${at} does not cite ${id}'s own words`)
  const printed = citedText(claim.offerWords, page, all, words)
  const [p, w] = [tokens(printed), tokens(offer)]
  if (p.length !== w.length || !p.every((t, i) => alike(t, w[i])))
    problems.push(`${at} does not read as its cited words "${printed}"`)
  // Two page prices printed on one line are one offer, so neither can be keyed without the other's words.
  const lines = new Set(ownWords(s).flatMap((i) => words[i]?.line ?? []))
  for (const [other, c] of Object.entries(page.occurrences)) {
    const o = all.get(other)
    if (other === id || c.kind !== 'text' || !o) continue
    if (
      ownWords(o).some((i) => lines.has(words[i]?.line ?? '')) &&
      !ownWords(o).every((i) => claim.offerWords.includes(i))
    )
      problems.push(`${at} leaves out ${other}, a page price on the same line`)
  }
  return problems
}

// Words printed with a price are proven at its place: a page price's offer by the words it cites, a product price's
// condition read from the render by no text line near it printing it.
export function checkPrinted(
  page: KeyPageV3,
  all: Map<string, Source>,
  words: readonly Word[],
  text: string,
  where: string,
): string[] {
  const problems: string[] = []
  for (const [id, claim] of Object.entries(page.occurrences)) {
    const s = all.get(id)
    if (!s) continue
    if (claim.kind === 'text')
      problems.push(...checkOffer(id, claim, s, valueOf(claim, s), { page, all, words, where }))
    if (claim.kind !== 'price') continue
    for (const c of claim.conditions) {
      if (typeof c === 'string') {
        if (count(text, c) === 0) problems.push(`${where}: price condition "${c}" not in the text layer`)
      } else if (printedNear(c.text, place(s, words), words))
        problems.push(`${where}: condition "${c.text}" of ${id} is in the text layer at its place; write it plainly`)
      else if (!c.confirmed)
        problems.push(`${where}: condition "${c.text}" read from the render awaits Andrei's confirmation`)
    }
  }
  return problems
}
