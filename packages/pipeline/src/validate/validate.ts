import { amountOf, asPrinted, joinRuns, printsFusedCents } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, ImageValue, Item, PageStructure, PriceValue, TextValue } from '../model/schema.ts'
import { pageCurrency, SIZED } from '../text/money.ts'
import { canon } from '../text/normalize.ts'

const MAX_ALT_LENGTH = 250

export type Finding = { path: string; problem: string }
export type Validation = {
  errors: Finding[]
  review: Finding[]
  generated: Finding[]
  uncovered: string[]
  doubleCited: string[]
}

type Range = [number, number]

const loose = (s: string): string => canon(s).replace(/[-\u2010\u2011()[\]*]/g, '')

// Ligatures a font maps to no text: pdftotext splits the word where the glyph drew ("Pla" + "er", "Truf" + "e").
// Seen on Gigi (ti, tt) and Noah's (fi, fl); a dropped glyph leaves LOST_GAP em or more, a word space ~0.25 em.
const LOST = ['ffi', 'ffl', 'ff', 'fi', 'fl', 'ft', 'ti', 'tt']
const LOST_GAP: [number, number] = [0.35, 1]
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

export function validatePage(page: PageStructure, e: Extraction): Validation {
  const errors: Finding[] = []
  const review: Finding[] = []
  const generated: Finding[] = []
  const citations = new Map<number, number>()
  const seenTexts: string[] = []
  const figureAlts: { path: string; img: ImageValue }[] = []
  const hidden = new Set(e.hidden)
  const onPage = e.runs.filter((r) => !hidden.has(r.id))
  const currency = pageCurrency(joinRuns(onPage))
  // Only a leaflet with fused cents needs a currency and a check on bare digits; elsewhere "19" is shown as printed.
  const fused = printsFusedCents(onPage)

  const runsOf = (path: string, ranges: readonly Range[], count = true): Run[] => {
    const out: Run[] = []
    for (const [from, to] of ranges) {
      if (from > to || to >= e.runs.length) {
        errors.push({ path, problem: `range [${from},${to}] outside 0..${e.runs.length - 1}` })
        continue
      }
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
    if (t.text !== undefined && loose(t.text) !== loose(joined)) {
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
    if (amount === null) {
      const printed = asPrinted(cited)
      if (printed === null) errors.push({ path, problem: `price words "${words}" are not an amount` })
      // Sizes with no label read as numbers only ("3.99/4.99/5.99" whose SMALL/MEDIUM/LARGE is artwork).
      else if (SIZED.test(printed) && !p.qualifier)
        review.push({ path, problem: `prices of several sizes with no size label: "${words}"` })
    } else if (amount.currency === null) {
      if (fused) errors.push({ path, problem: `no currency printed for "${words}" or on the page` })
    } else if (amount.fromBareDigits && fused) review.push({ path, problem: `price read from bare digits "${words}"` })
    return [words, p.qualifier ? text(`${path}.qualifier`, p.qualifier) : ''].join(' ')
  }

  const image = (path: string, img: ImageValue, context: string, strict = true): void => {
    if (img.alt === null) return
    generated.push({ path, problem: `alt text: "${img.alt}"` })
    if (/<|https?:/i.test(img.alt)) errors.push({ path, problem: 'alt contains markup or a URL' })
    if (img.alt.length > MAX_ALT_LENGTH) review.push({ path, problem: `alt is ${img.alt.length} characters` })
    for (const digits of img.alt.match(/\d+/g) ?? []) {
      if (!canon(context).includes(digits))
        (strict ? errors : review).push({ path, problem: `alt states "${digits}", which is not printed for it` })
    }
  }

  const block = (path: string, b: Block): string => {
    if (b.uncertain) review.push({ path, problem: `model unsure: ${b.uncertain}` })
    switch (b.kind) {
      case 'heading':
      case 'paragraph':
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

  page.blocks.forEach((b, i) => block(`blocks[${i}]`, b))
  runsOf('dropped', page.dropped)
  const pageWords = [joinRuns(e.runs.filter((r) => !hidden.has(r.id))), ...seenTexts].join(' ')
  figureAlts.forEach((f) => {
    image(f.path, f.img, pageWords, false)
  })

  const skipped = new Set([...e.duplicates, ...e.hidden])
  const uncovered = e.runs.filter((r, i) => !citations.has(i) && !skipped.has(r.id)).map((r) => r.id)
  const doubleCited = [...citations].filter(([, n]) => n > 1).flatMap(([i]) => e.runs[i]?.id ?? [])
  if (uncovered.length) review.push({ path: 'page', problem: `${uncovered.length} words neither used nor dropped` })
  return { errors, review, generated, uncovered, doubleCited }
}
