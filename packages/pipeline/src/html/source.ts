import { z } from 'zod'
import { iou } from '../pdf/geometry.ts'
import { fitScale } from '../pdf/raster.ts'
import { joinRuns, turned } from '../pdf/runs.ts'
import { faceKey } from '../pdf/face.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, Item, PageStructure, TextValue } from '../model/schema.ts'
import { modelTextAccepted } from '../validate/validate.ts'

// Every run a text cites (none for text read from the image), hidden ones included: geometry wants every box.
export const citedRuns = (e: Extraction, t: TextValue): Run[] =>
  'seen' in t ? [] : t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1))

const Cited = z.array(z.tuple([z.number(), z.number()]))
const under = (inner: string, outer: string): boolean => inner.startsWith(`${outer}.`) || inner.startsWith(`${outer}[`)
// Whether a validator finding sits on `path`, inside it or around it (the text there is in doubt).
export const flaggedAt = (path: string, flagged: readonly string[]): boolean =>
  flagged.some((f) => f === path || under(path, f) || under(f, path))
// The shown words any text of the page cites (names, prices, notes alike): those our own text stands in for.
// Text with a word set on its side, or a finding on it, is left printed (the print shows it right).
// `kept`: a word the backdrop keeps as printed (set on its side, at an angle, or in a hand we cannot draw): its
// whole text stays printed.
export function placedRuns(
  page: PageStructure,
  e: Extraction,
  flagged: readonly string[] = [],
  kept: (r: Run) => boolean = turned,
): Run[] {
  const cited = new Set<number>()
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value))
      value.forEach((v, i) => {
        visit(v, `${path}[${String(i)}]`)
      })
    else if (typeof value === 'object' && value !== null)
      for (const [key, v] of Object.entries(value)) {
        const src = key === 'src' ? Cited.safeParse(v) : null
        if (!src?.success) {
          visit(v, path ? `${path}.${key}` : key)
          continue
        }
        // ponytail: judged per cited text; a price whose label alone is turned loses its amount's spot too.
        const keptText = src.data.flatMap(([from, to]) => e.runs.slice(from, to + 1)).some(kept)
        if (!keptText && !flaggedAt(path, flagged))
          for (const [from, to] of src.data) for (let i = from; i <= to; i++) cited.add(i)
      }
  }
  visit(page, '')
  const hidden = new Set(e.hidden)
  return e.runs.filter((r, i) => cited.has(i) && !hidden.has(r.id))
}

// The words a text cites, without those the page does not show; a line-end hyphen before a capital joins
// ("MARILLEN-" + "PALATSCHINKEN"), before a small letter it stays a word break the model may clean.
// `modelCase`: a small-caps role, whose layer case is never the printed one; `capsFaces`: faces drawing capitals
// for lowercase (backdrop.json), whose words show in capitals, as printed.
export function visibleText(
  t: TextValue,
  e: Extraction,
  modelCase = false,
  capsFaces: ReadonlySet<string> = new Set(),
): string {
  if ('seen' in t) return t.seen
  const hidden = new Set(e.hidden)
  const cited = t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1))
  const words = cited.filter((r) => !hidden.has(r.id))
  const chunks: Run[][] = [[]]
  words.forEach((r, i) => {
    const prev = words[i - 1]
    if (prev && prev.line !== r.line && /\p{L}-$/u.test(prev.str) && /^\p{Lu}/u.test(r.str)) chunks.push([])
    chunks.at(-1)?.push(r)
  })
  // A currency sign set tight against a word ("for£3.50") gets the space a reader expects.
  const printed = chunks
    .map((c) => joinRuns(c))
    .join('')
    .replace(/(\p{L})([£$€])/gu, '$1 $2')
  // The model's text stands in for a broken text layer ("Truf e", or small-caps glyphs read as "MEatball app"),
  // never for a printed case the layer reports whole ("RAW BAR").
  const recased =
    t.text !== undefined && t.text.toLowerCase() === printed.toLowerCase() && caseReliable(printed) && !modelCase
  // Text the validator rejects never shows: the cited words do (a content error holds the page, eval/process.ts).
  const accepted = t.text !== undefined && modelTextAccepted(t.text, cited)
  const shown = t.text !== undefined && accepted && words.length === cited.length && !recased ? t.text : printed
  const allCaps = words.length > 0 && words.every((r) => r.font !== undefined && capsFaces.has(faceKey(r.font)))
  return allCaps ? shown.toUpperCase() : shown
}

// Every word is all capitals, all lower case, or one capital then lower case: a case a designer could have set.
// "MEatball" or "sausagE" is a small-caps font's glyph mapping, not the printed case.
export const caseReliable = (text: string): boolean =>
  (text.match(/\p{L}+/gu) ?? []).every((w) => /^(?:\p{Lu}+|\p{Ll}+|\p{Lu}\p{Ll}+)$/u.test(w))

// Every run index a product cites: name, prices with their conditions, unit and details.
function citations(item: Item): number[] {
  const out: number[] = []
  const add = (t: TextValue | undefined): void => {
    if (t && 'src' in t) for (const [from, to] of t.src) for (let i = from; i <= to; i++) out.push(i)
  }
  const block = (b: Block): void => {
    if (b.kind === 'heading' || b.kind === 'paragraph') add(b.text)
    if (b.kind === 'list') b.items.forEach(add)
    if (b.kind === 'table') {
      add(b.caption)
      b.rows.flat().forEach((cell) => {
        add(cell.text)
        cell.prices?.forEach((p) => {
          add({ src: p.src })
          add(p.qualifier)
        })
      })
    }
    if (b.kind === 'products') b.items.forEach((i) => out.push(...citations(i)))
  }
  add(item.name)
  item.prices.forEach((p) => {
    add({ src: p.src })
    add(p.qualifier)
  })
  add(item.unit)
  item.details.forEach(block)
  return out
}

// Every picture of a page with the runs its own product cites (none for a figure).
export type PictureBox = { path: string; box: readonly number[]; own: number[]; ref: string | null; figure: boolean }
export function imageBoxes(page: PageStructure): PictureBox[] {
  const out: PictureBox[] = []
  const block = (path: string, b: Block): void => {
    if (b.kind === 'figure')
      out.push({ path: `${path}.image`, box: b.image.box, own: [], ref: b.image.ref ?? null, figure: true })
    if (b.kind === 'products')
      b.items.forEach((item, i) => {
        product(`${path}.items[${i}]`, item)
      })
  }
  const product = (path: string, item: Item): void => {
    item.details.forEach((d, i) => {
      block(`${path}.details[${i}]`, d)
    })
    if (item.image)
      out.push({
        path: `${path}.image`,
        box: item.image.box,
        own: citations(item),
        ref: item.image.ref ?? null,
        figure: false,
      })
  }
  page.blocks.forEach((b, i) => {
    block(`blocks[${i}]`, b)
  })
  return out
}

// Figures printed in the same place on another page too (a running drawing, a logo): page furniture, per page the
// paths of those figures.
const RUNNING_OVERLAP = 0.5
export function runningFigures(pages: readonly { structure: PageStructure; extraction: Extraction }[]): Set<string>[] {
  const figures = pages.map(({ structure, extraction }) => {
    const { width, height } = fitScale(extraction.width, extraction.height)
    return structure.blocks.flatMap((b, i) => {
      if (b.kind !== 'figure') return []
      const [x, y, w, h] = b.image.box
      return [{ path: `blocks[${String(i)}].image`, box: { x: x / width, y: y / height, w: w / width, h: h / height } }]
    })
  })
  return figures.map(
    (own, p) =>
      new Set(
        own
          .filter((f) => figures.some((other, q) => q !== p && other.some((o) => iou(o.box, f.box) >= RUNNING_OVERLAP)))
          .map((f) => f.path),
      ),
  )
}

// Each list or paragraph of the pages as its visible lines (where a printed legend can be found).
export const textBlocks = (pages: readonly { structure: PageStructure; extraction: Extraction }[]): string[][] =>
  pages.flatMap((p) =>
    p.structure.blocks.flatMap((b) =>
      b.kind === 'list'
        ? [b.items.map((t) => visibleText(t, p.extraction))]
        : b.kind === 'paragraph'
          ? [[visibleText(b.text, p.extraction)]]
          : [],
    ),
  )

// The lists a note describes when it names the heading it sits under ("TEA TIME SET MENU: two courses £31.90…"):
// every list since that heading, as the note prices the whole section; null when it names no heading above it.
export function headedLists(blocks: readonly Block[], note: number, raw: (t: TextValue) => string): number[] | null {
  const letters = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const said = letters(raw(blocks[note]?.kind === 'paragraph' ? blocks[note].text : { seen: '-' }))
  for (let h = note - 1; h >= 0; h--) {
    const b = blocks[h]
    if (b?.kind !== 'heading') continue
    const name = letters(raw(b.text))
    if (!name || !said.startsWith(name)) continue
    const lists = blocks.flatMap((x, i) => (i > h && i < note && x.kind === 'products' ? [i] : []))
    return lists.length ? lists : null
  }
  return null
}
