import type { Block, PageStructure } from '../model/schema.ts'
import { fitScale } from '../pdf/raster.ts'
import { unfilled } from '../pdf/vectors.ts'
import type { Box, Extraction, Run, Vector } from '../pdf/types.ts'
import { contrast, fromHex, hex, readableOn, type Rgb } from './color.ts'
import { unionOf } from './profile.ts'
import { citedRuns } from './source.ts'
import type { Drawn, Painted } from './brand.ts'

// The PDF's frames and panels (pdf/vectors.ts) as boxes round the blocks printed inside them. A frame holding most
// of the page's content is the page's own frame (Almond, Rucola, Noah's drinks): a border round the page section.
// `ink`: on a dark fill, the colour its words are printed in, made readable; the fill as shown is a panel's `color`
// or a frame's `fill` (moved a little when the printed ink cannot move: Sarge's white on red).
export type PageBox = { vector: Vector; blocks: number[]; notched: boolean; centred: boolean; ink: string | null }
export type Boxes = { pageFrame: Vector | null; boxes: PageBox[] }
export const NO_BOXES: Boxes = { pageFrame: null, boxes: [] }

const PAGE_HOLDS = 0.8
// A heading whose middle lies within this (points) above a fill's top edge is set in it, not above it.
const ON_FILL = 1
const CENTRED = 0.1
type Page = { structure: PageStructure; extraction: Extraction }
type Part = { at: number; html: string }

// A block's printed extent in PDF points (figures are given in model-image pixels).
export function blockBox(b: Block, e: Extraction): Box | null {
  if (b.kind === 'figure') {
    const k = e.width / fitScale(e.width, e.height).width
    const [x, y, w, h] = b.image.box
    return { x: x * k, y: y * k, w: w * k, h: h * k }
  }
  return unionOf(blockRuns(b, e))
}

export function blockRuns(b: Block, e: Extraction): Run[] {
  if (b.kind === 'figure') return []
  return b.kind === 'heading' || b.kind === 'paragraph'
    ? citedRuns(e, b.text)
    : b.kind === 'list'
      ? b.items.flatMap((t) => citedRuns(e, t))
      : b.kind === 'table'
        ? b.rows
            .flat()
            .flatMap((c) => [
              ...(c.text ? citedRuns(e, c.text) : []),
              ...(c.prices ?? []).flatMap((p) => citedRuns(e, { src: p.src })),
            ])
        : b.items.flatMap((it) => [
            ...citedRuns(e, it.name),
            ...it.prices.flatMap((p) => citedRuns(e, { src: p.src })),
            ...it.details.flatMap((d) => (d.kind === 'paragraph' ? citedRuns(e, d.text) : [])),
          ])
}

const area = (b: Box): number => b.w * b.h
const centre = (b: Box): [number, number] => [b.x + b.w / 2, b.y + b.h / 2]
const holds = (v: Box, b: Box): boolean => {
  const [x, y] = centre(b)
  return x > v.x && x < v.x + v.w && y > v.y && y < v.y + v.h
}
// A heading set in the gap of the frame's top edge (Carmine's): its middle lies on that edge.
const onTopEdge = (v: Box, b: Box): boolean => {
  const [x, y] = centre(b)
  return x > v.x && x < v.x + v.w && Math.abs(y - v.y) <= b.h / 2 + 1
}

// A heading cut into a frame's rule belongs to it; one over a fill only when printed on it (a tab): standing above
// the fill it is printed on the page (The Exeter Arms' "Bar Snacks" over its orange panels).
const onEdge = (v: Vector, b: Box): boolean =>
  onTopEdge(v.box, b) && (groundOf(v) === null || centre(b)[1] >= v.box.y - ON_FILL)

// The page's boxes: each content block (header and tail left out) belongs to the smallest box holding it.
export function boxesOf(page: Page, skip: ReadonlySet<number>): Boxes {
  const vectors = [...(page.extraction.vectors ?? [])].sort((a, b) => area(a.box) - area(b.box))
  if (!vectors.length) return NO_BOXES
  const e = page.extraction
  const content = page.structure.blocks.flatMap((b, i) => {
    const box = skip.has(i) ? null : blockBox(b, e)
    return box ? [{ i, b, box }] : []
  })
  const pageFrame =
    [...vectors]
      .reverse()
      .find(
        (v) => v.kind === 'frame' && content.filter((c) => holds(v.box, c.box)).length >= content.length * PAGE_HOLDS,
      ) ?? null
  const members = new Map<Vector, number[]>()
  for (const c of content) {
    const v = vectors.find(
      (x) => x !== pageFrame && (holds(x.box, c.box) || (c.b.kind === 'heading' && onEdge(x, c.box))),
    )
    if (v) members.set(v, [...(members.get(v) ?? []), c.i])
  }
  const boxes = [...members].map(([vector, blocks]): PageBox => {
    const first = content.find((c) => c.i === blocks[0])
    const offset = first ? Math.abs(centre(first.box)[0] - centre(vector.box)[0]) / vector.box.w : 1
    const runs = content.filter((c) => blocks.includes(c.i)).flatMap((c) => blockRuns(c.b, e))
    const ground = groundOf(vector)
    const paint = ground === null ? undefined : paintOf(ground, runs)
    // A heading on a filled box's edge is printed on the fill: it stays inside, never cut into the border.
    const notched = first?.b.kind === 'heading' && onTopEdge(vector.box, first.box) && !paint
    return {
      vector: painted(vector, paint),
      blocks: blocks.sort((a, b) => a - b),
      notched,
      centred: offset < CENTRED,
      ink: paint?.ink ?? null,
    }
  })
  return { pageFrame: pageFrame && unfilled(pageFrame), boxes }
}

// What a box is filled with: a panel's colour, a frame's fill; null for a frame that is only a rule.
const groundOf = (v: Vector): string | null => (v.kind === 'panel' ? v.color : (v.fill ?? null))
// A frame's colour is its printed rule, never recoloured: a moved fill goes to `fill`, an unreadable one is dropped.
type Paint = { fill: string; ink: string | null }
function painted(v: Vector, paint: Paint | null | undefined): Vector {
  if (paint === undefined) return v
  if (v.kind === 'panel') return paint ? { ...v, color: paint.fill } : v
  return paint ? { ...v, fill: paint.fill } : unfilled(v)
}

// A light fill keeps every colour the page draws, each moved by lightness on its own where it does not read there
// (boxesCss). On a dark fill (Osteria's red, Sarge's black and red) the words take their printed colour (the
// commonest) moved to 4.5:1; when it cannot move far enough (white), the fill darkens instead. Null: neither reads.
const AA = 4.5
const PAGE_TEXT: readonly [number, number, number] = [26, 26, 26]
function paintOf(ground: string, runs: readonly Run[]): Paint | null {
  const fill = fromHex(ground)
  if (contrast(fill, PAGE_TEXT) >= AA) return { fill: ground, ink: null }
  const tally = new Map<string, number>()
  for (const r of runs) if (r.color) tally.set(r.color, (tally.get(r.color) ?? 0) + r.str.length)
  const printed = fromHex([...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff')
  const ink = readableOn(printed, fill, AA)
  if (ink) return { fill: ground, ink: hex(ink) }
  const moved = readableOn(fill, printed, AA)
  return moved ? { fill: hex(moved), ink: hex(printed) } : null
}

// The class naming a box's look, shared by every box drawn alike.
export function vectorClass(v: Vector, ink: string | null = null): string {
  if (v.kind === 'panel') return `panel-${v.color.slice(1)}${ink ? `-${ink.slice(1)}` : ''}`
  const fill = v.fill ? `-${v.fill.slice(1)}${ink ? `-${ink.slice(1)}` : ''}` : ''
  return `frame-${v.color.slice(1)}-${String(borderPx(v))}${v.double ? 'd' : ''}${v.rounded ? 'r' : ''}${fill}`
}
// A printed rule in CSS pixels (1 pt = 4/3 px), kept between 1 and 6; a double rule needs three to show both lines.
const borderPx = (v: Vector): number => Math.max(v.double ? 3 : 1, Math.min(6, Math.round((v.width * 4) / 3)))

const contiguous = (present: readonly number[], seq: readonly number[]): boolean => {
  const from = seq.indexOf(present[0] ?? -1)
  return from >= 0 && present.every((at, k) => seq[from + k] === at)
}

// Boxes wrap the parts they hold where the columns allow: inside one column, round a whole band (its class), or
// between bands; a box straddling columns is left out (the band already groups those sections).
export function wrapBoxes(
  parts: readonly Part[],
  bands: readonly { columns: number[][] }[],
  boxes: readonly PageBox[],
): { parts: Part[]; bandClass: Map<number, string> } {
  let out = [...parts]
  const bandClass = new Map<number, string>()
  const bandOf = new Map<number, number>()
  const columnOf = new Map<number, number[]>()
  bands.forEach((band, n) => {
    for (const column of band.columns)
      for (const at of column) {
        bandOf.set(at, n)
        columnOf.set(at, column)
      }
  })
  for (const box of boxes) {
    const has = (at: number): boolean => out.some((p) => p.at === at)
    const present = box.blocks.filter(has)
    const head = present[0]
    if (head === undefined) continue
    const cls = `box ${vectorClass(box.vector, box.ink)}${box.notched ? ' notched' : ''}${box.centred ? ' centred' : ''}`
    const band = bandOf.get(head)
    if (band !== undefined) {
      const all = (bands[band]?.columns ?? []).flat().filter(has)
      if (present.length === all.length && present.every((at) => bandOf.get(at) === band)) {
        bandClass.set(band, cls)
        continue
      }
      const column = (columnOf.get(head) ?? []).filter(has)
      if (!contiguous(present, column)) continue
    } else if (
      present.some((at) => bandOf.has(at)) ||
      !contiguous(
        present,
        out.map((p) => p.at).filter((at) => !bandOf.has(at)),
      )
    )
      continue
    const html = present.map((at) => out.find((p) => p.at === at)?.html ?? '').join('\n')
    out = out
      .filter((p) => p.at === head || !present.includes(p.at))
      .map((p) => (p.at === head ? { at: head, html: `<div class="${cls}">\n${html}\n</div>` } : p))
  }
  return { parts: out, bandClass }
}

// The look of every box on the document: printed colour and rule (decorative borders keep the brand's colour),
// fills with their words readable on them (a transparent rule on a panel, which forced colours turn into a line).
export function boxesCss(boxes: readonly { vector: Vector; ink: string | null }[], drawn: Drawn): string {
  const seen = new Map<string, { vector: Vector; ink: string | null }>()
  for (const b of boxes) seen.set(vectorClass(b.vector, b.ink), b)
  if (!seen.size) return ''
  const looks = [...seen].flatMap(([cls, { vector: v, ink }]) => {
    const ground = groundOf(v)
    const rule =
      v.kind === 'frame'
        ? `border: ${String(borderPx(v))}px ${v.double ? 'double' : 'solid'} ${v.color};${v.rounded ? ' border-radius: .75rem;' : ''}`
        : 'border: 1px solid transparent;'
    if (ground === null) return [`.${cls} { ${rule} }`]
    // A fill whose words cannot be made readable stays a frame in its colour.
    if (!ink && contrast(fromHex(ground), PAGE_TEXT) < AA) return [`.${cls} { border: 2px solid ${ground}; }`]
    // Words on a dark fill take its ink over every role colour (the doubled class outranks the role selectors).
    if (ink) return [`.${cls} { background: ${ground}; ${rule} }`, `section .box.${cls}.${cls} * { color: ${ink}; }`]
    return [
      `.${cls} { background: ${ground}; ${rule}${onFill(drawn, fromHex(ground))} }`,
      ...movedOn(drawn, ground, cls),
    ]
  })
  return [
    '.box { padding: .75rem clamp(.5rem, 3vw, 1.25rem); margin: 0 0 1.25rem; } .box > :first-child { margin-top: 0; }',
    'section.box { padding-block: 1rem; } .box > p { max-width: 65ch; }',
    '.box.notched > :first-child { width: fit-content; max-width: 100%; margin: calc(-.75rem - .7em) 0 .5rem; padding: 0 .5em; background: var(--bg); }',
    '.box.notched.centred > :first-child { margin-inline: auto; }',
    ...looks,
  ].join('\n')
}

// A painted colour on a light fill: as shown where it reads, else moved by lightness from its printed colour.
function onLight(p: Painted, fill: Rgb): string {
  if (contrast(fromHex(p.shown), fill) >= AA) return p.shown
  const moved = readableOn(fromHex(p.printed), fill, AA) ?? readableOn(fromHex(p.shown), fill, AA)
  return moved ? hex(moved) : 'var(--fg)'
}
// The page's own text, grey and accent on a light fill, moved where they do not read on it (the grey falls back to the
// text colour: Kenny & Ziggy's salmon, #555 at 4.17:1); the accent is set here, `:root`'s `var(--fg)` resolving there.
function onFill(drawn: Drawn, fill: Rgb): string {
  const text = fromHex(drawn.text)
  const fg = contrast(text, fill) >= AA ? null : readableOn(text, fill, AA)
  const muted = readableOn(fromHex(drawn.muted), fill, AA)
  const accent = drawn.accent ? onLight(drawn.accent, fill) : 'var(--fg)'
  return `${fg ? ` --fg: ${hex(fg)}; color: ${hex(fg)};` : ''} --muted: ${muted ? hex(muted) : 'var(--fg)'}; --accent: ${accent};`
}
// The page's painted colours on a light fill, never swapped (Howies' gold prices on cream). Once one moves, all are
// written again in the page's order: `:where()` keeps each rule's specificity, so ties fall as on the page.
function movedOn(drawn: Drawn, ground: string, cls: string): string[] {
  const fill = fromHex(ground)
  if (drawn.painted.every((p) => contrast(fromHex(p.shown), fill) >= AA)) return []
  return drawn.painted.map((p) => {
    const within = topLevel(p.selector).map((s) => `${s}:where(.${cls} *)`)
    return `${within.join(', ')} { color: ${onLight(p, fill)}; }`
  })
}
// A selector list split at its own commas, not those inside :not() or :is().
export function topLevel(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(list.slice(from).trim())
  return out
}
