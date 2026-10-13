import type { ClaimV3, KeyPageV3 } from './key-schema-v3.ts'
import { conditionText, count, valueOf, type Amount, type Source } from './key-v3.ts'
import { findOffer, isMoney, tokens, type Token } from './score/conditions.ts'
import type { Word } from './words.ts'

// Words printed within this many box heights of an amount are taken as printed with it (a badge beside a price).
const NEAR = 3
// A glyph without a Unicode mapping hides one to three letters ("O\ufffder"); this letter stands for it in tokens.
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

// Which amount owns each word: manual amounts first (a split occurrence's words belong to its parts), merged parts
// to the occurrence they merge into.
function owners(page: KeyPageV3, all: Map<string, Source>): Map<number, string> {
  const owner = new Map<number, string>()
  for (const s of [...all.values()].sort((a, b) => Number(!a.manual) - Number(!b.manual))) {
    const claim = page.occurrences[s.id]
    for (const w of ownWords(s)) if (!owner.has(w)) owner.set(w, claim?.kind === 'merged' ? claim.into : s.id)
  }
  return owner
}

// The cited words as printed, each claimed amount among them standing once as its claimed value.
function citedText(
  cited: readonly number[],
  page: KeyPageV3,
  all: Map<string, Source>,
  words: readonly Word[],
): string {
  const owner = owners(page, all)
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
    const text = w.str.replaceAll('\ufffd', HIDDEN)
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

// Poppler's text block of a line id (flow.block.line).
const blockOf = (line: string): string => line.split('.').slice(0, 2).join('.')

// Cited words follow the page: in each text block one unbroken run, blocks in stream order. Leaving out the edge of a
// line, or another block order, needs a note Andrei confirms; any amount on a cited line, however claimed, is cited whole.
function citation(
  cited: readonly number[],
  words: readonly Word[],
  page: KeyPageV3,
  all: Map<string, Source>,
): { problems: string[]; needsNote: boolean } {
  const span = new Map<string, [number, number]>()
  words.forEach((w, i) => {
    const [lo, hi] = span.get(w.line) ?? [i, i]
    span.set(w.line, [Math.min(lo, i), Math.max(hi, i)])
  })
  const runs: { block: string; at: number[] }[] = []
  for (const i of cited) {
    const w = words[i]
    if (!w) continue
    const last = runs.at(-1)
    if (last?.block === blockOf(w.line)) last.at.push(i)
    else runs.push({ block: blockOf(w.line), at: [i] })
  }
  const problems: string[] = []
  const blocks = runs.map((r) => r.block)
  if (new Set(blocks).size !== blocks.length) problems.push('cites a text block in pieces')
  if (runs.some((r) => r.at.some((i, k) => k > 0 && i !== (r.at[k - 1] ?? NaN) + 1)))
    problems.push('skips or reorders words inside a text block')
  const firsts = runs.map((r) => r.at[0] ?? 0)
  const reordered = firsts.some((f, k) => k > 0 && f < (firsts[k - 1] ?? 0))
  const edge = runs.some((r) => {
    const first = r.at[0] ?? 0
    const last = r.at.at(-1) ?? 0
    return span.get(words[first]?.line ?? '')?.[0] !== first || span.get(words[last]?.line ?? '')?.[1] !== last
  })
  const owner = owners(page, all)
  const lines = new Set(cited.flatMap((i) => words[i]?.line ?? []))
  const priced = new Set<string>()
  words.forEach((w, i) => {
    const id = owner.get(i)
    if (id !== undefined && lines.has(w.line)) priced.add(id)
  })
  for (const id of priced) {
    const s = all.get(id)
    const merged = Object.entries(page.occurrences).flatMap(([part, c]) => {
      const p = all.get(part)
      return c.kind === 'merged' && c.into === id && p ? ownWords(p) : []
    })
    if (s && ![...ownWords(s), ...merged].every((i) => cited.includes(i)))
      problems.push(`leaves out ${id}, an amount on a line it cites`)
  }
  return { problems, needsNote: reordered || edge }
}

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
  const order = citation(claim.offerWords, words, page, all)
  order.problems.forEach((o) => problems.push(`${at} ${o}`))
  if (order.needsNote && !claim.offerNote)
    problems.push(`${at} leaves out the edge of a line or departs from stream order; say why in offerNote`)
  else if (order.needsNote && !claim.offerNote?.confirmed)
    problems.push(`${at}: offerNote "${claim.offerNote?.text ?? ''}" awaits Andrei's confirmation`)
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
