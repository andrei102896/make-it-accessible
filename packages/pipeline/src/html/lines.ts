import type { Block, PageStructure } from '../model/schema.ts'
import type { Box, Extraction, Rule } from '../pdf/types.ts'
import { blockBox, blockRuns, type Boxes } from './boxes.ts'
import type { Band } from './layout.ts'

// The PDF's rules (pdf/vectors.ts) as classes per block, band and `band:column`: under or through a heading, above
// or below a block, a band's top, between columns. `looks` maps each class to its `--rule` or `--rule-w`.
export type PageLines = {
  blocks: Map<number, string>
  bands: Map<number, string>
  columns: Map<string, string>
  looks: Map<string, string>
}
export const NO_LINES: PageLines = { blocks: new Map(), bands: new Map(), columns: new Map(), looks: new Map() }

// In first-line heights: through a heading within THROUGH of its middle (measured ≤ 0.18, a rule over one 0.30);
// crossing a block past INTO; a neighbour within GAP; a heading's own rule within UNDER below it.
const THROUGH = 0.2
const INTO = 0.35
const GAP = 1.5
const UNDER = 1
// A rule through a heading ends within a line (at least NEAR points) of it; farther, it is the next column's.
const NEAR = 8
// A rule covering this share of a band's height (or a list's) divides its columns; one covering this share of the
// block below is that block's rule; a rule this close to a frame's edge is the frame.
const COVER = 0.5
const FULL = 0.9
const ON_FRAME = 1
// Points of tolerance on a column's or a heading's edge.
const EDGE = 4

type Placed = { i: number; b: Block; box: Box; line: number }
type Page = { structure: PageStructure; extraction: Extraction }

const level = (r: Rule): boolean => r.box.w > 0
const span = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0)
const overlapX = (r: Box, b: Box): number => span(r.x, r.x + r.w, b.x, b.x + b.w)
const crosses = (y: number, p: Placed): boolean => y > p.box.y + p.line * INTO && y < p.box.y + p.box.h - p.line * INTO

function placedOf(page: Page): Placed[] {
  const e = page.extraction
  return page.structure.blocks.flatMap((b, i) => {
    const box = blockBox(b, e)
    if (!box) return []
    const top = blockRuns(b, e).filter((r) => r.box.y <= box.y + 2)
    return [{ i, b, box, line: Math.max(0, ...top.map((r) => r.box.h)) }]
  })
}

// The page's rules, less those along a frame's edge (a frame drawn as separate strokes).
function rulesOf(e: Extraction): Rule[] {
  const frames = (e.vectors ?? []).filter((v) => v.kind === 'frame').map((v) => v.box)
  const onEdge = (r: Rule, f: Box): boolean =>
    level(r)
      ? r.box.x < f.x + f.w &&
        r.box.x + r.box.w > f.x &&
        [f.y, f.y + f.h].some((y) => Math.abs(r.box.y - y) <= ON_FRAME)
      : r.box.y < f.y + f.h &&
        r.box.y + r.box.h > f.y &&
        [f.x, f.x + f.w].some((x) => Math.abs(r.box.x - x) <= ON_FRAME)
  return (e.rules ?? []).filter((r) => !frames.some((f) => onEdge(r, f)))
}

// A rule crossing two or more columns of a band between their sections is a row break (Rucola's dotted line above
// pastas and sides): the band splits there; a part with one column left is no band.
export function splitBands(page: Page, bands: readonly Band[]): Band[] {
  const at = new Map(placedOf(page).map((p) => [p.i, p]))
  const cuts = rulesOf(page.extraction).filter(level)
  return bands.flatMap((band) => {
    const boxes = band.columns.map((c) => c.flatMap((i) => at.get(i) ?? []))
    const ys = cuts
      .filter((r) => {
        const split = boxes.filter((c) => {
          const x0 = Math.min(...c.map((p) => p.box.x))
          const x1 = Math.max(...c.map((p) => p.box.x + p.box.w))
          const mid = (p: Placed): number => p.box.y + p.box.h / 2
          return (
            span(r.box.x, r.box.x + r.box.w, x0, x1) >= (x1 - x0) * COVER &&
            c.some((p) => mid(p) < r.box.y) &&
            c.some((p) => mid(p) > r.box.y) &&
            !c.some((p) => crosses(r.box.y, p))
          )
        })
        return split.length >= 2
      })
      .map((r) => r.box.y)
      .sort((a, b) => a - b)
    if (!ys.length) return [band]
    const rows = [...ys, Infinity].map((y, k) =>
      boxes.map((c) =>
        c.filter((p) => p.box.y + p.box.h / 2 < y && p.box.y + p.box.h / 2 >= (ys[k - 1] ?? -Infinity)).map((p) => p.i),
      ),
    )
    return rows.flatMap((columns) => {
      const kept = columns.filter((c) => c.length)
      return kept.length >= 2 ? [{ ...band, columns: kept }] : []
    })
  })
}

function lookOf(r: Rule, looks: Map<string, string>): string {
  const px = Math.max(r.double ? 3 : 1, Math.min(6, Math.round((r.width * 4) / 3)))
  const style = r.double ? 'double' : r.dash
  const cls = `ln-${style}-${r.color.slice(1)}-${String(px)}`
  looks.set(cls, `--rule: ${String(px)}px ${style} ${r.color}`)
  return cls
}

export function linesOf(page: Page, bands: readonly Band[], boxes: Boxes): PageLines {
  const rules = rulesOf(page.extraction)
  if (!rules.length) return NO_LINES
  const placed = placedOf(page)
  const out: PageLines = { blocks: new Map(), bands: new Map(), columns: new Map(), looks: new Map() }
  const add = (i: number, cls: string): void => {
    const own = new Set([...(out.blocks.get(i) ?? 'ruled').split(' '), ...cls.split(' ')])
    out.blocks.set(i, [...own].join(' '))
  }
  const notched = new Set(boxes.boxes.flatMap((b) => (b.notched && b.blocks[0] !== undefined ? [b.blocks[0]] : [])))
  const bandOf = new Map<number, number>()
  const columnOf = new Map<number, number[]>()
  for (const [n, band] of bands.entries())
    for (const c of band.columns)
      for (const i of c) {
        bandOf.set(i, n)
        columnOf.set(i, c)
      }
  // A heading's measure: its printed column, or the page's content.
  const measureOf = (i: number): number => {
    const column = columnOf.get(i)
    const xs = placed.filter((p) => !column || column.includes(p.i)).map((p) => p.box)
    return Math.max(...xs.map((b) => b.x + b.w)) - Math.min(...xs.map((b) => b.x))
  }
  for (const r of rules.filter(level)) {
    const y = r.box.y
    const x1 = r.box.x + r.box.w
    const look = (): string => lookOf(r, out.looks)
    const heading = placed.find((p) => {
      const near = Math.max(p.line, NEAR)
      const left = x1 >= p.box.x - near && r.box.x < p.box.x - EDGE
      const right = r.box.x <= p.box.x + p.box.w + near && x1 > p.box.x + p.box.w + EDGE
      return (
        p.b.kind === 'heading' &&
        !notched.has(p.i) &&
        Math.abs(y - (p.box.y + p.line / 2)) <= p.line * THROUGH &&
        (left || right)
      )
    })
    if (heading) {
      const left = r.box.x < heading.box.x - EDGE ? ' rule-left' : ''
      const right = x1 > heading.box.x + heading.box.w + EDGE ? ' rule-right' : ''
      add(heading.i, `rule-through${left}${right} ${look()}`)
      continue
    }
    const beside = placed.filter((p) => overlapX(r.box, p.box) >= Math.min(r.box.w, p.box.w) * COVER)
    if (beside.some((p) => crosses(y, p))) continue
    const below = beside
      .filter((p) => p.box.y + p.line * INTO >= y && p.box.y - y <= p.line * GAP)
      .sort((a, b) => a.box.y - b.box.y)
    const above = beside
      .filter((p) => p.box.y + p.box.h - p.line * INTO <= y && y - p.box.y - p.box.h <= p.line * GAP)
      .sort((a, b) => b.box.y + b.box.h - a.box.y - a.box.h)[0]
    const next = below[0]
    if (above?.b.kind === 'heading' && y - above.box.y - above.box.h <= above.line * UNDER) {
      const share = r.box.w / Math.max(r.box.w, measureOf(above.i))
      const width = share < FULL ? ` rw-${String(Math.round(share * 20) * 5)}` : ''
      if (width) out.looks.set(width.trim(), `--rule-w: ${String(Math.round(share * 20) * 5)}%`)
      const centred = Math.abs(r.box.x + r.box.w / 2 - (above.box.x + above.box.w / 2)) <= EDGE * 2
      add(above.i, `rule-under${centred ? ' rule-centred' : ''}${width} ${look()}`)
      continue
    }
    const row = next ? below.filter((p) => p.box.y - next.box.y <= next.line) : []
    // The blocks right below that open two or more columns of one band: the rule is the band's top.
    const opening = row.filter((p) => bands[bandOf.get(p.i) ?? -1]?.columns.some((c) => c[0] === p.i))
    const band = bandOf.get(opening[0]?.i ?? -1)
    if (band !== undefined && opening.length >= 2 && opening.every((p) => bandOf.get(p.i) === band))
      out.bands.set(band, `rule-top ${look()}`)
    else if (next) {
      // One rule per column: blocks stacked in one column (a heading and the price beside it) share the first's.
      const firsts = new Map<number[] | undefined, Placed>()
      for (const p of [...row].sort((a, b) => a.i - b.i))
        if (!firsts.has(columnOf.get(p.i))) firsts.set(columnOf.get(p.i), p)
      for (const p of firsts.values()) if (targetable(p) && r.box.w >= p.box.w * COVER) add(p.i, `rule-above ${look()}`)
    } else if (above && targetable(above) && r.box.w >= above.box.w * COVER) add(above.i, `rule-below ${look()}`)
  }
  for (const r of rules.filter((x) => !level(x))) {
    const look = (): string => lookOf(r, out.looks)
    const hits = dividerOf(r, bands, placed)
    if (hits) out.columns.set(hits, `rule-left ${look()}`)
    const list = placed.find(
      (p) =>
        p.b.kind === 'products' &&
        r.box.x > p.box.x + p.box.w / 4 &&
        r.box.x < p.box.x + (p.box.w * 3) / 4 &&
        span(r.box.y, r.box.y + r.box.h, p.box.y, p.box.y + p.box.h) >= p.box.h * COVER,
    )
    if (!hits && list) add(list.i, `rule-columns ${look()}`)
  }
  return out
}

const targetable = (p: Placed): boolean => p.b.kind !== 'table' && p.b.kind !== 'figure'

// `band:column` for a vertical rule in the gutter left of that column, covering most of the band's height.
function dividerOf(r: Rule, bands: readonly Band[], placed: readonly Placed[]): string | null {
  const at = new Map(placed.map((p) => [p.i, p]))
  for (const [n, band] of bands.entries()) {
    const cols = band.columns.map((c) => c.flatMap((i) => at.get(i) ?? []))
    const all = cols.flat()
    if (!all.length) continue
    const y0 = Math.min(...all.map((p) => p.box.y))
    const y1 = Math.max(...all.map((p) => p.box.y + p.box.h))
    for (let k = 1; k < cols.length; k++) {
      const left = cols[k - 1] ?? []
      const right = cols[k] ?? []
      const gutter0 = Math.max(...left.map((p) => p.box.x + p.box.w)) - EDGE
      const gutter1 = Math.min(...right.map((p) => p.box.x)) + EDGE
      if (r.box.x < gutter0 || r.box.x > gutter1) continue
      if (span(r.box.y, r.box.y + r.box.h, y0, y1) >= (y1 - y0) * COVER) return `${String(n)}:${String(k)}`
    }
  }
  return null
}

// Rules are drawn, never written: borders only (kept by forced colours and print). A heading's own rule outranks
// the signature rule and the ornament on the same ::after; 60rem must match the column grid in style.ts.
export function linesCss(looks: ReadonlyMap<string, string>): string {
  if (!looks.size) return ''
  const h = ':is(h1, h2, h3, h4, h5, h6)'
  const drawn =
    'display: block; width: auto; margin: 0; border: 0; border-top: var(--rule); background: none; -webkit-mask: none; mask: none; aspect-ratio: auto;'
  return [
    '.rule-above { border-top: var(--rule); padding-top: .6rem; } .rule-below { border-bottom: var(--rule); padding-bottom: .6rem; }',
    `${h}.rule-under.rule-under::after { content: ""; ${drawn} width: var(--rule-w, 100%); margin-top: .35em; }`,
    `${h}.rule-under.rule-centred { text-align: center; } ${h}.rule-under.rule-centred::after { margin-inline: auto; }`,
    `${h}.rule-through.rule-through { display: flex; align-items: center; gap: .75em; } ${h}.rule-through > span { text-wrap: balance; }`,
    `${h}.rule-through.rule-through::before, ${h}.rule-through.rule-through::after { content: none; }`,
    `${h}.rule-through.rule-left::before, ${h}.rule-through.rule-right::after { content: ""; ${drawn} flex: 1 0 1.25em; }`,
    '.cols.rule-top { border-top: var(--rule); padding-top: 1rem; } .products.rule-columns { column-rule: var(--rule); }',
    '@media (min-width: 60rem) { .cols > .col.rule-left { border-left: var(--rule); padding-left: 1.25rem; margin-left: -1.25rem; align-self: stretch; } }',
    ...[...looks].map(([cls, decl]) => `.${cls} { ${decl}; }`),
  ].join('\n')
}
