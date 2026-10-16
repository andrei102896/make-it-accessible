import type { Block, PageStructure } from '../model/schema.ts'
import { fitScale } from '../pdf/raster.ts'
import type { Box, Extraction, Run, Vector } from '../pdf/types.ts'
import { contrast, fromHex, hex, readableOn } from './color.ts'
import { unionOf } from './profile.ts'
import { citedRuns } from './source.ts'
import { MUTED } from './style.ts'

// The PDF's frames and panels (pdf/vectors.ts) as boxes round the blocks printed inside them. A frame holding most
// of the page's content is the page's own frame (Almond, Rucola, Noah's drinks): a border round the page section.
// `ink`: on a panel where the page's text does not read, the colour its words are printed in, made readable;
// `vector.color` is then the fill as shown (moved a little when the printed ink cannot move: Sarge's white on red).
export type PageBox = { vector: Vector; blocks: number[]; notched: boolean; centred: boolean; ink: string | null }
export type Boxes = { pageFrame: Vector | null; boxes: PageBox[] }
export const NO_BOXES: Boxes = { pageFrame: null, boxes: [] }

const PAGE_HOLDS = 0.8
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
      (x) => x !== pageFrame && (holds(x.box, c.box) || (c.b.kind === 'heading' && onTopEdge(x.box, c.box))),
    )
    if (v) members.set(v, [...(members.get(v) ?? []), c.i])
  }
  const boxes = [...members].map(([vector, blocks]): PageBox => {
    const first = content.find((c) => c.i === blocks[0])
    const notched = first?.b.kind === 'heading' && onTopEdge(vector.box, first.box)
    const offset = first ? Math.abs(centre(first.box)[0] - centre(vector.box)[0]) / vector.box.w : 1
    const runs = content.filter((c) => blocks.includes(c.i)).flatMap((c) => blockRuns(c.b, e))
    const paint = paintOf(vector, runs)
    return {
      vector: paint ? { ...vector, color: paint.fill } : vector,
      blocks: blocks.sort((a, b) => a - b),
      notched,
      centred: offset < CENTRED,
      ink: paint?.ink ?? null,
    }
  })
  return { pageFrame, boxes }
}

// A panel where the page's dark text does not reach 4.5:1 (Osteria's red, Sarge's black and red) shows its words in
// their printed colour (the commonest), moved to 4.5:1; when that colour cannot move far enough (white), the fill
// darkens instead. Null when neither reads: the panel stays a frame.
const AA = 4.5
const PAGE_TEXT: readonly [number, number, number] = [26, 26, 26]
function paintOf(v: Vector, runs: readonly Run[]): { fill: string; ink: string | null } | null {
  const fill = fromHex(v.color)
  if (v.kind !== 'panel') return { fill: v.color, ink: null }
  // On a light panel the words keep the page's colours unless one would fall below 4.5:1 on the fill (BILLA's grey
  // text on its grey panel): then they all take their printed colour made readable there.
  const tally = new Map<string, number>()
  for (const r of runs) if (r.color) tally.set(r.color, (tally.get(r.color) ?? 0) + r.str.length)
  const light = contrast(fill, PAGE_TEXT) >= AA
  const printed = fromHex([...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (light ? '#1a1a1a' : '#ffffff'))
  if (light && [...tally.keys()].every((c) => contrast(fromHex(c), fill) >= AA)) return { fill: v.color, ink: null }
  const ink = readableOn(printed, fill, AA)
  if (ink) return { fill: v.color, ink: hex(ink) }
  const moved = readableOn(fill, printed, AA)
  return moved ? { fill: hex(moved), ink: hex(printed) } : null
}

// The class naming a box's look, shared by every box drawn alike.
export function vectorClass(v: Vector, ink: string | null = null): string {
  if (v.kind === 'panel') return `panel-${v.color.slice(1)}${ink ? `-${ink.slice(1)}` : ''}`
  return `frame-${v.color.slice(1)}-${String(borderPx(v))}${v.double ? 'd' : ''}${v.rounded ? 'r' : ''}`
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
// panels in their fill with a transparent rule that forced colours and print turn into a line.
export function boxesCss(boxes: readonly { vector: Vector; ink: string | null }[]): string {
  const seen = new Map<string, { vector: Vector; ink: string | null }>()
  for (const b of boxes) seen.set(vectorClass(b.vector, b.ink), b)
  if (!seen.size) return ''
  const looks = [...seen].flatMap(([cls, { vector: v, ink }]) => {
    if (v.kind === 'frame')
      return [
        `.${cls} { border: ${String(borderPx(v))}px ${v.double ? 'double' : 'solid'} ${v.color};${v.rounded ? ' border-radius: .75rem;' : ''} }`,
      ]
    // A fill whose words cannot be made readable stays a frame in its colour.
    if (!ink && contrast(fromHex(v.color), PAGE_TEXT) < AA) return [`.${cls} { border: 2px solid ${v.color}; }`]
    // Words on a dark panel take its ink over every role colour (the doubled class outranks the role selectors).
    // On a light panel the page's secondary grey must read too (Kenny & Ziggy's salmon: #555 is 4.17:1); where no
    // grey does, the text colour stands in. ponytail: role and link colours are checked as printed, not as rendered.
    const muted = ink ? null : readableOn(fromHex(MUTED), fromHex(v.color), AA)
    const secondary = ink ? '' : ` --muted: ${muted ? hex(muted) : 'var(--fg)'};`
    return [
      `.${cls} { background: ${v.color}; border: 1px solid transparent;${secondary} }`,
      ...(ink ? [`section .box.${cls}.${cls} * { color: ${ink}; }`] : []),
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
