import type { Block, PageStructure, TextValue } from '../model/schema.ts'
import { fitScale } from '../pdf/raster.ts'
import type { Box, Extraction, Run } from '../pdf/types.ts'
import { unionOf } from './profile.ts'
import { visibleText } from './source.ts'

// A page's segments: the header (the name as text or logo, tagline, address, printed at the top of the first page
// before the first section) and the tail (small print at the foot of a page). Everything else is content.
export type Segments = {
  header: Set<number>
  tail: Set<number>
  // The header block that prints the name, and the header's centring and logo width (share of the page).
  title: number | null
  centered: boolean
  logoShare: number | null
}
// Sections printed side by side: each column holds its sections' block indices in print order. A `side` band is
// one narrow column beside sections whose items flow across the rest of the page (Almond's raw bar beside the
// appetizers).
export type Band = { columns: number[][]; side?: boolean }
export type Layout = Segments & { bands: Band[] }
export const NO_LAYOUT: Layout = {
  header: new Set(),
  tail: new Set(),
  title: null,
  centered: false,
  logoShare: null,
  bands: [],
}

// The header lies within the top share of the page; a tail paragraph starts below the bottom share or is set
// smaller than the body text; a title is at least this many times the body; a tagline has at most this many words.
const TOP = 0.2
const BOTTOM = 0.85
const TITLE_RATIO = 2
const TAGLINE_WORDS = 12
const CENTRED = 0.1
// A section wider than this share of the page is a full-width row; narrower ones side by side form columns, at most
// MAX_COLUMNS; two sections share a column when their x-ranges overlap by more than the tolerance.
const FULL_WIDTH = 0.6
const MAX_COLUMNS = 4
const OVERLAP = 0.03

type Page = { structure: PageStructure; extraction: Extraction }
const same = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const cited = (e: Extraction, t: TextValue): Run[] =>
  'seen' in t ? [] : t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1))
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

const textOf = (b: Block): TextValue | null => (b.kind === 'heading' || b.kind === 'paragraph' ? b.text : null)
const isSection = (b: Block | undefined, next: Block | undefined): boolean =>
  b !== undefined &&
  (b.kind === 'products' ||
    b.kind === 'list' ||
    b.kind === 'table' ||
    (b.kind === 'heading' && (next?.kind === 'products' || next?.kind === 'list' || next?.kind === 'table')))

// A block's printed box in PDF points (figures are given in model-image pixels).
function boxOf(b: Block, e: Extraction): Box | null {
  if (b.kind === 'figure') {
    const { width } = fitScale(e.width, e.height)
    const k = e.width / width
    const [x, y, w, h] = b.image.box
    return { x: x * k, y: y * k, w: w * k, h: h * k }
  }
  const t = textOf(b)
  return t ? unionOf(cited(e, t)) : null
}
const sizeOf = (b: Block, e: Extraction): number => {
  const t = textOf(b)
  return t ? median(cited(e, t).flatMap((r) => (r.font ? [r.font.size] : []))) : 0
}

export function segmentsOf(page: Page, first: boolean, body: number, title: string): Segments {
  const { structure, extraction: e } = page
  const blocks = structure.blocks
  const header = new Set<number>()
  let titleAt: number | null = null
  if (first) {
    for (const [i, b] of blocks.entries()) {
      const t = textOf(b)
      const words = t ? visibleText(t, e) : ''
      const names = words.length > 0 && (same(title).includes(same(words)) || same(words).includes(same(title)))
      const big = sizeOf(b, e) >= TITLE_RATIO * body
      // The name may head the first list itself (Kendells: the title, then the bread and olives).
      if (isSection(b, blocks[i + 1]) && !names && !big) break
      // A name read from the image (a wordmark) has no box; everything else must sit at the top of the page.
      const box = boxOf(b, e)
      const seen = t !== null && 'seen' in t && names
      if (!seen && (!box || box.y / e.height > TOP)) break
      // A short line is a tagline only as a paragraph: a heading that neither names the place nor towers over
      // the body opens the first section (Carmine's "DEVILED CRABS" box under the logo).
      const tagline = b.kind === 'paragraph' && words.split(/\s+/).filter(Boolean).length <= TAGLINE_WORDS
      if (!(b.kind === 'figure' || names || big || tagline)) break
      header.add(i)
      if (b.kind === 'heading' && (names || big) && titleAt === null) titleAt = i
    }
  }
  const tail = new Set<number>()
  for (let i = blocks.length - 1; i >= 0 && !header.has(i); i--) {
    const b = blocks[i]
    const box = b ? boxOf(b, e) : null
    if (!b || b.kind !== 'paragraph' || !box) break
    const low = (box.y + box.h) / e.height >= BOTTOM
    const small = sizeOf(b, e) > 0 && sizeOf(b, e) < body
    if (!low && !small) break
    tail.add(i)
  }
  const boxes = [...header].flatMap((i) => {
    const b = blocks[i]
    const box = b ? boxOf(b, e) : null
    return box ? [box] : []
  })
  const x0 = Math.min(...boxes.map((b) => b.x))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const centered = boxes.length > 0 && Math.abs((x0 + x1) / 2 / e.width - 0.5) < CENTRED
  const logo = [...header].map((i) => blocks[i]).find((b) => b?.kind === 'figure')
  const logoBox = logo ? boxOf(logo, e) : null
  return { header, tail, title: titleAt, centered, logoShare: logoBox ? logoBox.w / e.width : null }
}

// A section's column is where its heading is printed (`range`); whether its items flow across the page (`flow`,
// the union of their names and prices) decides if it is a full-width row with a multi-column list inside.
type Section = { blocks: number[]; range: [number, number] | null; flow: [number, number] | null }

// A page's sections: each starts at a block-level heading (or at a list with no heading before it) and runs to
// the next. Header and tail blocks are left out.
function sectionsOf(page: Page, header: Set<number>, tail: Set<number>): Section[] {
  const { structure, extraction: e } = page
  const sections: Section[] = []
  const span = (box: Box): [number, number] => [box.x / e.width, (box.x + box.w) / e.width]
  const widen = (a: [number, number] | null, b: [number, number]): [number, number] =>
    a ? [Math.min(a[0], b[0]), Math.max(a[1], b[1])] : b
  structure.blocks.forEach((b, i) => {
    if (header.has(i) || tail.has(i)) return
    if (b.kind === 'heading' || !sections.length) sections.push({ blocks: [], range: null, flow: null })
    const section = sections.at(-1)
    if (!section) return
    section.blocks.push(i)
    if (b.kind === 'heading') {
      const box = boxOf(b, e)
      if (box) section.range = widen(section.range, span(box))
    } else if (b.kind === 'products' || b.kind === 'table') {
      const runs =
        b.kind === 'products'
          ? b.items.flatMap((it) => [...cited(e, it.name), ...it.prices.flatMap((pr) => cited(e, { src: pr.src }))])
          : b.rows
              .flat()
              .flatMap((c) => [
                ...(c.text ? cited(e, c.text) : []),
                ...(c.prices ?? []).flatMap((pr) => cited(e, { src: pr.src })),
              ])
      const box = unionOf(runs)
      if (box) {
        section.flow = widen(section.flow, span(box))
        section.range ??= span(box)
      }
    }
  })
  return sections
}

type Cluster = { x1: number; sections: Section[] }
const blocksOf = (sections: Section[]): number[] =>
  sections.sort((a, b) => (a.blocks[0] ?? 0) - (b.blocks[0] ?? 0)).flatMap((s) => s.blocks)

// Sections sorted by where their headings start, clustered into columns by overlap; at most MAX_COLUMNS, the two
// with the narrowest gap merging first.
function clustersOf(run: readonly Section[]): Cluster[] {
  const columns: Cluster[] = []
  for (const s of [...run].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0))) {
    const [x0, x1] = s.range ?? [0, 1]
    const last = columns.at(-1)
    if (last && x0 < last.x1 - OVERLAP) {
      last.sections.push(s)
      last.x1 = Math.max(last.x1, x1)
    } else columns.push({ x1, sections: [s] })
  }
  while (columns.length > MAX_COLUMNS) {
    const gaps = columns.slice(1).map((c, i) => (c.sections[0]?.range?.[0] ?? 0) - (columns[i]?.x1 ?? 0))
    const at = gaps.indexOf(Math.min(...gaps))
    const [gone] = columns.splice(at + 1, 1)
    const into = columns[at]
    if (gone && into) {
      into.sections.push(...gone.sections)
      into.x1 = Math.max(into.x1, gone.x1)
    }
  }
  return columns
}

// Consecutive narrow sections form a band of columns; a section whose items flow across the page is a row of its
// own, unless it starts to the right of a single narrow column, which it then stands beside (a side band).
export function bandsOf(page: Page, header: Set<number>, tail: Set<number>): Band[] {
  const bands: Band[] = []
  let run: Section[] = []
  let side: { x1: number; left: Section[]; right: Section[] } | null = null
  const flushSide = (): void => {
    if (side) bands.push({ columns: [blocksOf(side.left), blocksOf(side.right)], side: true })
    side = null
  }
  const close = (): void => {
    const columns = clustersOf(run)
    if (columns.length >= 2) bands.push({ columns: columns.map((c) => blocksOf(c.sections)) })
    run = []
  }
  for (const s of sectionsOf(page, header, tail)) {
    const wide = !s.range || !s.flow || s.flow[1] - s.flow[0] > FULL_WIDTH
    const flowsRightOf = (x1: number): boolean => s.flow !== null && s.flow[0] >= x1 - OVERLAP
    if (!wide) {
      if (side && s.range && s.range[0] < side.x1 - OVERLAP) side.left.push(s)
      else {
        flushSide()
        run.push(s)
      }
      continue
    }
    if (side && flowsRightOf(side.x1)) {
      side.right.push(s)
      continue
    }
    flushSide()
    const columns = clustersOf(run)
    const only = columns.length === 1 ? columns[0] : undefined
    if (only && flowsRightOf(only.x1)) {
      side = { x1: only.x1, left: only.sections, right: [s] }
      run = []
    } else close()
  }
  flushSide()
  close()
  return bands
}

export function layoutOf(page: Page, first: boolean, body: number, title: string): Layout {
  const segments = segmentsOf(page, first, body, title)
  return { ...segments, bands: bandsOf(page, segments.header, segments.tail) }
}

// The page body from its rendered blocks: sections printed side by side share a grid, the tail is small print.
export function assemble(parts: readonly { at: number; html: string }[], layout: Layout): string[] {
  const inBand = new Map<number, Band>()
  for (const band of layout.bands) for (const column of band.columns) for (const at of column) inBand.set(at, band)
  const htmlOf = new Map(parts.map((p) => [p.at, p.html]))
  const done = new Set<Band>()
  const out: string[] = []
  for (const p of parts) {
    if (layout.header.has(p.at) || layout.tail.has(p.at)) continue
    const band = inBand.get(p.at)
    if (!band) out.push(p.html)
    else if (!done.has(band)) {
      done.add(band)
      const columns = band.columns.map(
        (column) => `<div class="col">\n${column.flatMap((at) => htmlOf.get(at) ?? []).join('\n')}\n</div>`,
      )
      out.push(
        `<div class="cols cols-${String(band.columns.length)}${band.side ? ' side' : ''}">\n${columns.join('\n')}\n</div>`,
      )
    }
  }
  const tail = parts.filter((p) => layout.tail.has(p.at)).map((p) => p.html)
  if (tail.length) out.push(`<footer class="small-print">\n${tail.join('\n')}\n</footer>`)
  return out
}
