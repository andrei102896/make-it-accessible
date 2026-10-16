import { iou } from '../pdf/geometry.ts'
import { fitScale } from '../pdf/raster.ts'
import { joinRuns } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, Item, PageStructure, TextValue } from '../model/schema.ts'

// Every run a text cites (none for text read from the image), hidden ones included: geometry wants every box.
export const citedRuns = (e: Extraction, t: TextValue): Run[] =>
  'seen' in t ? [] : t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1))

// The words a text cites, without those the page does not show; a line-end hyphen before a capital joins
// ("MARILLEN-" + "PALATSCHINKEN"), before a small letter it stays a word break the model may clean.
// `modelCase`: the role is a small-caps face, whose layer case is never the printed one (profile.ts smallCaps).
export function visibleText(t: TextValue, e: Extraction, modelCase = false): string {
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
  return t.text !== undefined && words.length === cited.length && !recased ? t.text : printed
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

export type Segment = { text: string; color: string | null }
// The shown text's characters matched to the cited runs' characters (whitespace and case aside), each taking its
// run's colour. When the letters differ (the model's text stands in for a broken layer), one segment, coloured only
// when every run agrees.
export function inkSegments(t: TextValue, e: Extraction, shown: string): Segment[] {
  if ('seen' in t) return [{ text: shown, color: null }]
  const hidden = new Set(e.hidden)
  const runs = t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
  const chars = runs.flatMap((r) =>
    Array.from(r.str.replace(/\s+/g, '')).map((ch) => ({ ch: ch.toLowerCase(), color: r.color ?? null })),
  )
  const letters = Array.from(shown)
  const colors: (string | null)[] = []
  let at = 0
  for (const ch of letters) {
    if (/\s/.test(ch)) {
      colors.push(colors.at(-1) ?? null)
      continue
    }
    const c = chars[at++]
    if (c?.ch !== ch.toLowerCase()) {
      const all = new Set(runs.map((r) => r.color ?? null))
      return [{ text: shown, color: all.size === 1 ? ([...all][0] ?? null) : null }]
    }
    colors.push(c.color)
  }
  const out: Segment[] = []
  letters.forEach((ch, i) => {
    const color = colors[i] ?? null
    const last = out.at(-1)
    if (last && last.color === color) last.text += ch
    else out.push({ text: ch, color })
  })
  return out
}

// The segments as HTML: runs printed in a brand ink wrapped in its class, the rest joined so `each` (escape or
// link) sees whole words.
export function inkedHtml(
  segments: readonly Segment[],
  inks: ReadonlySet<string>,
  each: (s: string) => string,
): string {
  const groups: Segment[] = []
  for (const s of segments) {
    const color = s.color !== null && inks.has(s.color) ? s.color : null
    const last = groups.at(-1)
    if (last && last.color === color) last.text += s.text
    else groups.push({ text: s.text, color })
  }
  return groups
    .map((g) => (g.color ? `<span class="ink-${g.color.slice(1)}">${each(g.text)}</span>` : each(g.text)))
    .join('')
}
