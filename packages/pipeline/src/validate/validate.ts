import { amountOf, joinRuns } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, ImageValue, Item, PageStructure, PriceValue, TextValue } from '../model/schema.ts'
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

export function validatePage(page: PageStructure, e: Extraction): Validation {
  const errors: Finding[] = []
  const review: Finding[] = []
  const generated: Finding[] = []
  const citations = new Map<number, number>()
  const seenTexts: string[] = []
  const figureAlts: { path: string; img: ImageValue }[] = []

  const runsOf = (path: string, ranges: readonly Range[], count = true): Run[] => {
    const out: Run[] = []
    for (const [from, to] of ranges) {
      if (from > to || to >= e.runs.length) {
        errors.push({ path, problem: `range [${from},${to}] outside 0..${e.runs.length - 1}` })
        continue
      }
      e.runs.slice(from, to + 1).forEach((run, offset) => {
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
    const joined = joinRuns(runsOf(path, t.src))
    if (t.text !== undefined && loose(t.text) !== loose(joined)) {
      errors.push({ path, problem: `"${t.text}" does not match the cited words "${joined}"` })
    }
    return t.text ?? joined
  }

  const price = (path: string, p: PriceValue): string => {
    const cited = runsOf(path, p.src)
    const amount = amountOf(cited)
    const words = cited.map((r) => r.str).join(' ')
    if (amount === null) errors.push({ path, problem: `price words "${words}" are not an amount` })
    else if (amount.fromBareDigits) review.push({ path, problem: `price read from bare digits "${words}"` })
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
  const pageWords = [joinRuns(e.runs), ...seenTexts].join(' ')
  figureAlts.forEach((f) => {
    image(f.path, f.img, pageWords, false)
  })

  const duplicates = new Set(e.duplicates)
  const uncovered = e.runs.filter((r, i) => !citations.has(i) && !duplicates.has(r.id)).map((r) => r.id)
  const doubleCited = [...citations].filter(([, n]) => n > 1).flatMap(([i]) => e.runs[i]?.id ?? [])
  if (uncovered.length) review.push({ path: 'page', problem: `${uncovered.length} words neither used nor dropped` })
  return { errors, review, generated, uncovered, doubleCited }
}
