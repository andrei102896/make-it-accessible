import { z } from 'zod'
import { iou } from '../pdf/geometry.ts'
import { fitScale } from '../pdf/raster.ts'
import { joinRuns, turned } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, Item, PageStructure, TextValue } from '../model/schema.ts'

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
export function placedRuns(page: PageStructure, e: Extraction, flagged: readonly string[] = []): Run[] {
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
        const turnedText = src.data.flatMap(([from, to]) => e.runs.slice(from, to + 1)).some(turned)
        if (!turnedText && !flaggedAt(path, flagged))
          for (const [from, to] of src.data) for (let i = from; i <= to; i++) cited.add(i)
      }
  }
  visit(page, '')
  const hidden = new Set(e.hidden)
  return e.runs.filter((r, i) => cited.has(i) && !hidden.has(r.id))
}

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
// Each shown character's run, matched to the cited runs' characters (whitespace and case aside): null for
// whitespace, and null for the whole text when the letters differ (the model's text stands in for a broken layer).
export function shownRuns(t: TextValue, e: Extraction, shown: string): (Run | null)[] | null {
  if ('seen' in t) return null
  const hidden = new Set(e.hidden)
  const runs = t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
  const chars = runs.flatMap((r) => Array.from(r.str.replace(/\s+/g, '')).map((ch) => ({ ch: ch.toLowerCase(), r })))
  let at = 0
  const out: (Run | null)[] = []
  for (const ch of Array.from(shown)) {
    if (/\s/.test(ch)) {
      out.push(null)
      continue
    }
    const c = chars[at++]
    if (c?.ch !== ch.toLowerCase()) return null
    out.push(c.r)
  }
  return out
}

// The shown text's characters each with its run's colour (whitespace takes the one before). When the letters
// differ, one segment, coloured only when every run agrees.
export function inkSegments(t: TextValue, e: Extraction, shown: string): Segment[] {
  if ('seen' in t) return [{ text: shown, color: null }]
  const letters = Array.from(shown)
  const owners = shownRuns(t, e, shown)
  if (!owners) {
    const hidden = new Set(e.hidden)
    const runs = t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
    const all = new Set(runs.map((r) => r.color ?? null))
    return [{ text: shown, color: all.size === 1 ? ([...all][0] ?? null) : null }]
  }
  return segmentsOf(letters, owners)
}

function segmentsOf(letters: readonly string[], owners: readonly (Run | null)[]): Segment[] {
  const out: Segment[] = []
  let color: string | null = null
  letters.forEach((ch, i) => {
    const owner = owners[i]
    if (owner) color = owner.color ?? null
    else if (i === 0) color = null
    const last = out.at(-1)
    if (last && last.color === color) last.text += ch
    else out.push({ text: ch, color })
  })
  return out
}

// The shown text cut at its printed line breaks: each line's characters with their runs, and the whitespace
// between lines as it is shown (none where a hyphenated word was joined), so the pieces make up `shown` exactly.
// Null when the text does not follow its runs or prints on one line.
export type LinePart = { text: string; runs: Run[]; segments: Segment[] } | { gap: string }
export function lineParts(t: TextValue, e: Extraction, shown: string): LinePart[] | null {
  const owners = shownRuns(t, e, shown)
  if (!owners) return null
  const letters = Array.from(shown)
  const key = (r: Run): string => `${String(r.flow)}:${String(r.line)}`
  const parts: LinePart[] = []
  let line: { start: number; end: number; key: string } | null = null
  const close = (): void => {
    if (!line) return
    const own = owners.slice(line.start, line.end)
    const runs = [...new Set(own.filter((r): r is Run => r !== null))]
    parts.push({
      text: letters.slice(line.start, line.end).join(''),
      runs,
      segments: segmentsOf(letters.slice(line.start, line.end), own),
    })
  }
  let gap = ''
  letters.forEach((ch, i) => {
    const owner = owners[i]
    if (!owner) {
      gap += ch
      return
    }
    if (line && line.key === key(owner)) {
      line.end = i + 1
      gap = ''
      return
    }
    close()
    if (gap || line) parts.push({ gap })
    gap = ''
    line = { start: i, end: i + 1, key: key(owner) }
  })
  close()
  if (gap) parts.push({ gap })
  return parts.filter((p) => 'runs' in p).length > 1 ? parts : null
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
