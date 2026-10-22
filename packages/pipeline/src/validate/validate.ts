import { amountOf, asPrinted, joinRuns, printsFusedCents } from '../pdf/runs.ts'
import type { OcrWord } from '../pdf/ocr.ts'
import { fitScale } from '../pdf/raster.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, ImageValue, Item, PageStructure, PriceValue, TextValue } from '../model/schema.ts'
import { pageCurrency, SIZED } from '../text/money.ts'
import { canon } from '../text/normalize.ts'
import { consistencyFindings } from './consistency.ts'
import { digitsIn, pageCites, printedHead, readTwice, separatorOnly, wordsOfPicture } from './proof.ts'

const MAX_ALT_LENGTH = 250

export type Finding = { path: string; problem: string }
export type Validation = {
  errors: Finding[]
  review: Finding[]
  generated: Finding[]
  uncovered: string[]
  doubleCited: string[]
}

export const readFromImage = (f: Finding): boolean => /read from the image/.test(f.problem)
// What no independent check confirmed (Andrei, 2026-10-19: self-serve holds all of it): errors, review findings, and
// words the model read from the image (a "vegan" label, a dish name) — not alt text, which describes a picture.
export const unverified = (v: Pick<Validation, 'errors' | 'review' | 'generated'>): Finding[] => [
  ...v.errors,
  ...v.review,
  ...v.generated.filter(readFromImage),
]

// The paths a page marks for review: its errors and review findings (the printed view leaves them as printed).
export const flaggedPaths = (v: Validation): string[] => [...v.errors, ...v.review].map((f) => f.path)

type Range = [number, number]

// A text citing only words that draw nothing: one finding per text, at the first such place.
const NOTHING = 'cites words that draw nothing on the page'
const loose = (s: string): string => canon(s).replace(/[-\u2010\u2011()[\]*]/g, '')
// The punctuation that ends a span parts it from what follows ("PERONI NASTRO AZZURRO," + its strength): not a word.
const reading = (s: string): string => loose(s).replace(/[,;:]+$/u, '')

// Ligatures a font maps to no text: pdftotext splits the word where the glyph drew ("Pla" + "er", "Truf" + "e").
// Seen on Gigi (ti, tt) and Noah's (fi, fl); a dropped glyph leaves LOST_GAP em or more, a word space ~0.25 em.
const LOST = ['ffi', 'ffl', 'ff', 'fi', 'fl', 'ft', 'ti', 'tt']
const LOST_GAP: [number, number] = [0.35, 1]
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whether the model's text may stand for the cited words: the same characters, or lost ligatures filled in. The
// page shows nothing else (html/source.ts); every other difference is an error here.
export const modelTextAccepted = (text: string, cited: readonly Run[]): boolean =>
  reading(text) === reading(joinRuns(cited)) || ligaturesLost(text, cited)

// The model's text is the cited words with lost ligatures filled in where a word splits on one line (after a comma
// too: "apricots, " + "gs").
function ligaturesLost(model: string, runs: readonly Run[]): boolean {
  const pattern = runs
    .map((r, i) => {
      const prev = runs[i - 1]
      // Runs read before fonts were measured have no size: the box height stands in, a little larger.
      const size = prev?.font?.size ?? prev?.box.h ?? 0
      const gap = prev ? r.box.x - prev.box.x - prev.box.w : 0
      const split =
        prev?.line === r.line &&
        /[\p{L},;:.]$/u.test(prev.str) &&
        /^\p{Ll}/u.test(r.str) &&
        gap >= size * LOST_GAP[0] &&
        gap <= size * LOST_GAP[1]
      return `${split ? `(?:${LOST.join('|')})?` : ''}${escape(loose(r.str))}`
    })
    .join('')
  return new RegExp(`^${pattern}$`, 'u').test(loose(model))
}

// `ocr`: Tesseract's reading of the page, a second reader for text and digits the model read from the image.
export function validatePage(page: PageStructure, e: Extraction, ocr: readonly OcrWord[] = []): Validation {
  const errors: Finding[] = []
  const review: Finding[] = []
  const generated: Finding[] = []
  const citations = new Map<number, number>()
  const seenTexts: string[] = []
  const figureAlts: { path: string; img: ImageValue }[] = []
  const hidden = new Set(e.hidden)
  const lost = new Set(e.lost ?? [])
  const onPage = e.runs.filter((r) => !hidden.has(r.id))
  const currency = pageCurrency(joinRuns(onPage))
  // Only a leaflet with fused cents needs a currency and a check on bare digits; elsewhere "19" is shown as printed.
  const fused = printsFusedCents(onPage)
  const cites = pageCites(page, e)
  const toPt = e.width / fitScale(e.width, e.height).width

  const runsOf = (path: string, ranges: readonly Range[], count = true): Run[] => {
    const out: Run[] = []
    for (const [from, to] of ranges) {
      if (from > to || to >= e.runs.length) {
        errors.push({ path, problem: `range [${from},${to}] outside 0..${e.runs.length - 1}` })
        continue
      }
      // The model never sees a hidden word: a range of nothing else is a saved answer from before the page was
      // read again, maybe standing for a visible mark beside it (Howies' covered "NGCI"); a person looks.
      const first = e.runs[from]
      const nothing = `${NOTHING} (${Math.round(first?.box.x ?? 0)}, ${Math.round(first?.box.y ?? 0)})`
      if (
        path !== 'dropped' &&
        e.runs.slice(from, to + 1).every((r) => hidden.has(r.id)) &&
        !review.some((f) => f.path === path && f.problem.startsWith(NOTHING))
      )
        review.push({ path, problem: nothing })
      e.runs.slice(from, to + 1).forEach((run, offset) => {
        // A hidden word inside a cited range is not published (the renderer skips it too).
        if (hidden.has(run.id)) return
        out.push(run)
        if (count) citations.set(from + offset, (citations.get(from + offset) ?? 0) + 1)
      })
    }
    return out
  }

  const text = (path: string, t: TextValue): string => {
    if ('seen' in t) {
      // Image text with digits can change an offer ("BIS ZU 10%", "2+1"), so a person confirms it; the rest is labelled AI-generated.
      ;(/\d/.test(t.seen) ? review : generated).push({ path, problem: `text read from the image: "${t.seen}"` })
      seenTexts.push(t.seen)
      return t.seen
    }
    const cited = runsOf(path, t.src)
    const joined = joinRuns(cited)
    // A word a dropped glyph leaves unwhole ("Pance a") is an error, its leaf flagged, unless the model read it whole.
    if (t.text === undefined && cited.some((r) => lost.has(r.id)))
      errors.push({ path, problem: `letters the PDF draws but names nowhere are missing from "${joined}"` })
    if (t.text !== undefined && reading(t.text) !== reading(joined)) {
      if (ligaturesLost(t.text, cited))
        generated.push({
          path,
          problem: `letters read from the image where the text layer lost a ligature: "${t.text}"`,
        })
      else errors.push({ path, problem: `"${t.text}" does not match the cited words "${joined}"` })
    }
    return t.text ?? joined
  }

  const price = (path: string, p: PriceValue): string => {
    const cited = runsOf(path, p.src)
    const amount = amountOf(cited, currency)
    const words = cited.map((r) => r.str).join(' ')
    // A price whose digits are partly drawn as shapes ("3" + a drawn ".99", La Segunda) reads as another amount.
    if (cited.some((r) => lost.has(r.id)))
      errors.push({ path, problem: `letters the PDF draws but names nowhere are missing from "${words}"` })
    // On a scan the two readers' amounts must agree (model/align.ts); neither is believed over the other.
    if (p.text !== undefined && reading(p.text) !== reading(words))
      errors.push({ path, problem: `the page image reads "${p.text}" where OCR reads "${words}"` })
    if (amount === null) {
      const printed = asPrinted(cited)
      if (printed === null) errors.push({ path, problem: `price words "${words}" are not an amount` })
      // Sizes with no label read as numbers only ("3.99/4.99/5.99" whose SMALL/MEDIUM/LARGE is artwork).
      else if (SIZED.test(printed) && !p.qualifier)
        review.push({ path, problem: `prices of several sizes with no size label: "${words}"` })
    } else if (amount.currency === null) {
      if (fused) errors.push({ path, problem: `no currency printed for "${words}" or on the page` })
    } else if (amount.fromBareDigits && fused) review.push({ path, problem: `price read from bare digits "${words}"` })
    const q = p.qualifier
    if (q && 'seen' in q && printedHead(cited, q.seen, onPage, cites)) {
      generated.push({ path: `${path}.qualifier`, problem: `label printed as its column head: "${q.seen}"` })
      return [words, q.seen].join(' ')
    }
    return [words, q ? text(`${path}.qualifier`, q) : ''].join(' ')
  }

  const image = (path: string, img: ImageValue, context: string, strict = true): void => {
    if (img.alt === null) return
    generated.push({ path, problem: `alt text: "${img.alt}"` })
    if (/<|https?:/i.test(img.alt)) errors.push({ path, problem: 'alt contains markup or a URL' })
    if (img.alt.length > MAX_ALT_LENGTH) review.push({ path, problem: `alt is ${img.alt.length} characters` })
    for (const digits of img.alt.match(/\d+/g) ?? []) {
      const [x, y, w, h] = img.box.map((v) => v * toPt)
      if (!canon(context).includes(digits) && !digitsIn(digits, { x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 }, ocr))
        (strict ? errors : review).push({ path, problem: `alt states "${digits}", which is not printed for it` })
    }
  }

  // `top`: a block of the page, not a dish's detail (a label read twice is still no proof of whose it is).
  const block = (path: string, b: Block, top = false): string => {
    if (b.uncertain) review.push({ path, problem: `model unsure: ${b.uncertain}` })
    switch (b.kind) {
      case 'heading':
      case 'paragraph':
        if (top && 'seen' in b.text && !/\d/.test(b.text.seen) && readTwice(b.text.seen, ocr, onPage)) {
          generated.push({ path, problem: `image text read again by OCR: "${b.text.seen}"` })
          seenTexts.push(b.text.seen)
          return b.text.seen
        }
        return text(path, b.text)
      case 'list':
        return b.items.map((t, i) => text(`${path}.items[${i}]`, t)).join(' ')
      case 'table':
        return [
          b.caption ? text(`${path}.caption`, b.caption) : '',
          ...b.rows.flatMap((row, r) =>
            row.map((cell, c) => {
              const at = `${path}.rows[${r}][${c}]`
              return [
                cell.text ? text(at, cell.text) : '',
                ...(cell.prices ?? []).map((p, i) => price(`${at}.prices[${i}]`, p)),
              ].join(' ')
            }),
          ),
        ].join(' ')
      case 'products':
        return b.items.map((item, i) => product(`${path}.items[${i}]`, item)).join(' ')
      case 'figure':
        figureAlts.push({ path: `${path}.image`, img: b.image })
        return ''
    }
  }

  const product = (path: string, item: Item): string => {
    if (item.uncertain) review.push({ path, problem: `model unsure: ${item.uncertain}` })
    item.prices.forEach((p, i) => {
      if (item.prices.slice(0, i).some((q) => JSON.stringify(q.src) === JSON.stringify(p.src)))
        errors.push({
          path: `${path}.prices[${i}]`,
          problem: 'price cites the same words as another price of this item',
        })
    })
    const words = [
      text(`${path}.name`, item.name),
      ...item.prices.map((p, i) => price(`${path}.prices[${i}]`, p)),
      item.unit ? text(`${path}.unit`, item.unit) : '',
      ...item.details.map((d, i) => block(`${path}.details[${i}]`, d)),
    ].join(' ')
    if (item.image) image(`${path}.image`, item.image, words)
    return words
  }

  page.blocks.forEach((b, i) => block(`blocks[${i}]`, b, true))
  runsOf('dropped', page.dropped)
  const pageWords = [joinRuns(e.runs.filter((r) => !hidden.has(r.id))), ...seenTexts].join(' ')
  figureAlts.forEach((f) => {
    image(f.path, f.img, pageWords, false)
  })

  // A figure's own words (a logo's lettering its alt names) are the figure's, read in its alt.
  const pictured = figureAlts.flatMap(({ img }) => {
    const [x = 0, y = 0, w = 0, h = 0] = img.box.map((v) => v * toPt)
    return img.alt ? wordsOfPicture({ x, y, w, h }, img.alt, e).map((r) => r.id) : []
  })
  const skipped = new Set([...e.duplicates, ...e.hidden, ...pictured])
  const uncovered = e.runs
    .filter((r, i) => !citations.has(i) && !skipped.has(r.id) && !separatorOnly(r))
    .map((r) => r.id)
  const doubleCited = [...citations].filter(([, n]) => n > 1).flatMap(([i]) => e.runs[i]?.id ?? [])
  if (uncovered.length) review.push({ path: 'page', problem: `${uncovered.length} words neither used nor dropped` })
  // Prices and details that the page's own geometry gives to another dish (consistency.ts).
  review.push(...consistencyFindings(page, e))
  return { errors, review, generated, uncovered, doubleCited }
}
