import type { Block, PageStructure } from '../model/schema.ts'
import type { OcrWord } from '../pdf/ocr.ts'
import { pictureIn } from '../pdf/art.ts'
import type { Box, Extraction, Run } from '../pdf/types.ts'
import { lettersOf } from '../text/normalize.ts'

// Proofs that what the model gave is printed: from the text layer's geometry, or read a second time by OCR.

// Typographic separators between words ("–", "/", "|", "•", leader dots) are no word of their own; "&", "+", "*",
// "%" and signs are (Lexington's "eggs & chopped beef").
const SEPARATOR = /^[\p{Pd}/|_•·.…\s\u200b]+$/u
export const separatorOnly = (r: Run): boolean => SEPARATOR.test(r.str)

// Text read from the image is confirmed by OCR only from this many letters: "V" or "GF" is printed anywhere.
const MIN_LETTERS = 4

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const bottom = (b: Box): number => b.y + b.h

type Cites = { amounts: Set<string>; headings: Box[]; read: Set<string> }

// The page's amounts (run ids every price cites), its headings' boxes (what a column head may stand above) and the
// words its headings and paragraphs read.
export function pageCites(page: PageStructure, e: Extraction): Cites {
  const amounts = new Set<string>()
  const headings: Box[] = []
  const read = new Set<string>()
  const runs = (src: readonly (readonly [number, number])[]): Run[] =>
    src.flatMap(([from, to]) => e.runs.slice(from, to + 1))
  const visit = (blocks: readonly Block[]): void => {
    for (const b of blocks) {
      if ((b.kind === 'heading' || b.kind === 'paragraph') && 'src' in b.text)
        for (const r of runs(b.text.src)) read.add(r.id)
      if (b.kind === 'heading' && 'src' in b.text) headings.push(...runs(b.text.src).map((r) => r.box))
      const prices =
        b.kind === 'products'
          ? b.items.flatMap((i) => i.prices)
          : b.kind === 'table'
            ? b.rows.flat().flatMap((c) => c.prices ?? [])
            : []
      for (const p of prices) for (const r of runs(p.src)) amounts.add(r.id)
      if (b.kind === 'products') for (const i of b.items) visit(i.details)
    }
  }
  visit(page.blocks)
  return { amounts, headings, read }
}

// One measure, or several in one word: "125ml/500ml/750ml" names the sizes of "£7.5/26/38".
const MEASURE = String.raw`\(?\d+(?:\.\d+)?\s?(?:ml|cl|l|oz|g|kg|lb)\)?`
const MEASURES = new RegExp(String.raw`^${MEASURE}(?:\/${MEASURE})+$`, 'i')

// A price of several sizes printed below the page's one word naming as many measures, which the answer reads.
export function sizesPrinted(price: string, amount: readonly Run[], layer: readonly Run[], cites: Cites): boolean {
  const count = price.split('/').length
  const labels = layer.filter((r) => MEASURES.test(r.str) && r.str.split('/').length === count && cites.read.has(r.id))
  const top = Math.min(...amount.map((r) => r.box.y))
  return new Set(labels.map((r) => r.str.toLowerCase())).size === 1 && labels.some((r) => bottom(r.box) <= top)
}

// A price's label printed once as its column's head: the nearest words above the amount in its column, other
// amounts aside, one piece of their line alone over the column, no heading between, reading as the label.
export function printedHead(
  amount: readonly Run[],
  label: string,
  layer: readonly Run[],
  cites: { amounts: ReadonlySet<string>; headings: readonly Box[] },
): boolean {
  if (!amount.length || !lettersOf(label)) return false
  const left = Math.min(...amount.map((r) => r.box.x))
  const right = Math.max(...amount.map((r) => r.box.x + r.box.w))
  const top = Math.min(...amount.map((r) => r.box.y))
  const inColumn = (b: Box): boolean => b.x < right && left < b.x + b.w
  const above = layer.filter(
    (r) => bottom(r.box) <= top && inColumn(r.box) && lettersOf(r.str) && !cites.amounts.has(r.id),
  )
  const nearest = above.reduce<Run | null>((best, r) => (!best || bottom(r.box) > bottom(best.box) ? r : best), null)
  if (!nearest) return false
  // The line's words in pieces split where a gap passes one em: each column's head is its own piece.
  const pieces: Run[][] = []
  for (const r of layer
    .filter((w) => w.flow === nearest.flow && w.line === nearest.line)
    .sort((a, b) => a.box.x - b.box.x)) {
    const piece = pieces.at(-1)
    const last = piece?.at(-1)
    if (piece && last && r.box.x - (last.box.x + last.box.w) <= (r.font?.size ?? r.box.h)) piece.push(r)
    else pieces.push([r])
  }
  const over = pieces.filter((p) => p.some((r) => inColumn(r.box)))
  const head = over[0]
  if (over.length !== 1 || !head) return false
  const headEnd = Math.max(...head.map((r) => bottom(r.box)))
  if (cites.headings.some((b) => b.y >= headEnd && bottom(b) <= top)) return false
  return lettersOf(head.map((r) => r.str).join(' ')) === lettersOf(label)
}

// Text read from the image that OCR reads too, as one sequence of words, none of them a word the text layer has
// (those the model should have cited); it leaves an OCR block only for the line just below, under it (a logo's).
export function readTwice(seen: string, ocr: readonly OcrWord[], layer: readonly Run[]): boolean {
  const want = lettersOf(seen)
  if (want.length < MIN_LETTERS) return false
  const own = ocr.filter((w) => lettersOf(w.str) && !layer.some((r) => overlaps(w.box, r.box)))
  const below = (a: Box, b: Box): boolean =>
    b.y >= a.y && b.y - bottom(a) <= Math.max(a.h, b.h) && b.x < a.x + a.w && a.x < b.x + b.w
  return own.some((_, i) => {
    let read = ''
    let prev: OcrWord | undefined
    for (const w of own.slice(i)) {
      if (prev && w.block !== prev.block && !below(prev.box, w.box)) return false
      prev = w
      read += lettersOf(w.str)
      if (read === want) return true
      if (!want.startsWith(read)) return false
    }
    return false
  })
}

// Digits an alt states that OCR reads inside its picture's box (PDF points).
export const digitsIn = (digits: string, box: Box, ocr: readonly OcrWord[]): boolean =>
  ocr.some((w) => {
    const [cx, cy] = [w.box.x + w.box.w / 2, w.box.y + w.box.h / 2]
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= bottom(box) && lettersOf(w.str).includes(digits)
  })

// A word's letters and digits in pieces ("EST-1990" → est, 1990).
const tokens = (s: string): string[] =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
// A picture's words are printed within this (pt) of its drawn box.
const IN_PICTURE = 2

// The words printed inside a picture (its drawn box when the vector layer has it) whose every piece its alt names:
// a logo's own "EST-1990 HOWIES RESTAURANT" for "Howies Restaurant logo, est. 1990", no text printed over it.
export function wordsOfPicture(
  box: Box,
  alt: string,
  e: Pick<Extraction, 'runs' | 'pictures' | 'width' | 'height'>,
): Run[] {
  const named = new Set(tokens(alt))
  const at = pictureIn(box, e.pictures ?? [], e.width, e.height) ?? box
  return e.runs.filter((r) => {
    const [cx, cy] = [r.box.x + r.box.w / 2, r.box.y + r.box.h / 2]
    const inside =
      cx >= at.x - IN_PICTURE &&
      cx <= at.x + at.w + IN_PICTURE &&
      cy >= at.y - IN_PICTURE &&
      cy <= bottom(at) + IN_PICTURE
    const own = tokens(r.str)
    return !r.icon && inside && own.length > 0 && own.every((t) => named.has(t))
  })
}
