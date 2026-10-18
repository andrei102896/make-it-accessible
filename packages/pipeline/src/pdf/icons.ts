import type { Box, Extraction, Picture, Run } from './types.ts'

// Dietary icons printed inside text lines ("( [wheat] available)") have no word in the text layer; the document's
// legend of icon-and-label pairs names them, and a named icon becomes the label's words at its printed spot.

// An icon stands on a printed line: between these shares of the line's height, no wider than WIDE × its height.
const LINE_TALL = 1.6
const MIN_TALL = 0.4
const WIDE = 3
// Words of one printed line overlap this share of the shorter one's height (pdftotext splits a line per column).
const SAME_LINE = 0.5
// A legend label starts within this × the icon's width to its right: one to three words, capitalised, no digits,
// ending before the next icon or a gap wider than the line is tall.
const LABEL_REACH = 1.5
const MAX_LABEL = 3
const MIN_PAIRS = 2
// A legend icon and its inline copies measure the same within this (pt); two legend icons this close are told
// apart by nothing, so neither names anything.
const SAME_SIZE = 1
// A drawing a word's box covers this much of is no icon between words.
const UNDER_WORD = 0.2
// Pieces this close (pt) are one icon (a drop inside its circle, a nut in two strokes); neighbouring icons sit
// further apart. Only pieces up to ICON_MAX pt are considered.
const TOUCH = 1
const ICON_MAX = 40

export type IconPiece = Pick<Picture, 'box' | 'kind'>
export type LegendEntry = IconPiece & { label: string }
type Line = { runs: Run[]; box: Box }

const overlap = (a: Box, b: Box): number => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
const across = (a: Box, b: Box): number => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

// The page's printed lines: words whose boxes share most of their height, left to right.
function linesOf(runs: readonly Run[]): Line[] {
  const lines: Line[] = []
  for (const r of [...runs].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const line = lines.find((l) => overlap(l.box, r.box) >= Math.min(l.box.h, r.box.h) * SAME_LINE)
    if (line) {
      line.runs.push(r)
      line.box = union(line.box, r.box)
    } else lines.push({ runs: [r], box: r.box })
  }
  for (const l of lines) l.runs.sort((a, b) => a.box.x - b.box.x)
  return lines
}
const lineOf = (b: Box, lines: readonly Line[]): Line | undefined => {
  const cy = b.y + b.h / 2
  return lines.find(
    (l) =>
      cy >= l.box.y &&
      cy <= l.box.y + l.box.h &&
      b.h <= l.box.h * LINE_TALL &&
      b.h >= l.box.h * MIN_TALL &&
      !l.runs.some((r) => across(r.box, b) > b.w * UNDER_WORD),
  )
}

// Touching small pieces of one kind as one drawing each (ponytail: a pass per piece over the rest; a page holds
// at most a few hundred small pieces).
function drawings(pieces: readonly IconPiece[]): IconPiece[] {
  const small = pieces.filter((p) => p.box.w <= ICON_MAX && p.box.h <= ICON_MAX)
  const out: IconPiece[] = []
  for (const p of small) {
    const near = out.find((o) => o.kind === p.kind && across(o.box, p.box) >= -TOUCH && overlap(o.box, p.box) >= -TOUCH)
    if (near) near.box = union(near.box, p.box)
    else out.push({ box: p.box, kind: p.kind })
  }
  return out
}

// The small drawings standing on a printed line among the page's visible pieces.
export const iconsOn = (pieces: readonly IconPiece[], runs: readonly Run[]): IconPiece[] => {
  const lines = linesOf(runs)
  return drawings(pieces).filter((p) => p.box.w <= p.box.h * WIDE && lineOf(p.box, lines) !== undefined)
}

const sameSize = (a: IconPiece, b: IconPiece): boolean =>
  a.kind === b.kind && Math.abs(a.box.w - b.box.w) <= SAME_SIZE && Math.abs(a.box.h - b.box.h) <= SAME_SIZE

// The icon-and-label pairs of a line, when it holds at least MIN_PAIRS of them.
function pairsOf(icons: readonly IconPiece[], line: Line): LegendEntry[] {
  const own = icons.filter((i) => lineOf(i.box, [line])).sort((a, b) => a.box.x - b.box.x)
  const pairs = own.flatMap((icon, k): LegendEntry[] => {
    const right = icon.box.x + icon.box.w
    const until = own[k + 1]?.box.x ?? Infinity
    const after = line.runs.filter((r) => r.box.x >= right - 1 && r.box.x < until)
    const label: Run[] = []
    for (const r of after) {
      const prev = label.at(-1)
      const gap = r.box.x - (prev ? prev.box.x + prev.box.w : right)
      if (gap > (prev ? line.box.h : icon.box.w * LABEL_REACH)) break
      label.push(r)
    }
    const first = label[0]
    if (!first || label.length > MAX_LABEL || !/^\p{Lu}/u.test(first.str) || label.some((r) => /\d/.test(r.str)))
      return []
    return [
      {
        box: icon.box,
        kind: icon.kind,
        label: label
          .map((r) => r.str)
          .join(' ')
          .toLowerCase(),
      },
    ]
  })
  return pairs.length >= MIN_PAIRS ? pairs : []
}

// The document's legend: the pairs of its legend lines, less icons another entry matches in size.
export function legendOf(pages: readonly Pick<Extraction, 'runs' | 'icons'>[]): LegendEntry[] {
  const pairs = pages.flatMap((p) => linesOf(p.runs).flatMap((l) => pairsOf(p.icons ?? [], l)))
  return pairs.filter((a) => !pairs.some((b) => b !== a && b.label !== a.label && sameSize(a, b)))
}

// The page with each inline icon the legend names appended to its runs as the label's words, at the icon's box, on
// the line of the word beside it (the model's inventory sorts such a line by x). Ids continue the page's.
export function withIcons(e: Extraction, legend: readonly LegendEntry[]): Extraction {
  if (!legend.length || !e.icons?.length) return e
  const lines = linesOf(e.runs)
  const own = new Set(legend.map((l) => JSON.stringify(l.box)))
  const added = e.icons.flatMap((icon): Run[] => {
    const line = lineOf(icon.box, lines)
    const named = legend.filter((l) => sameSize(l, icon))
    const [entry] = named
    // A legend printed on several pages lists each label more than once: one label is one name.
    const labels = new Set(named.map((l) => l.label))
    if (!line || !entry || labels.size !== 1 || own.has(JSON.stringify(icon.box))) return []
    const beside = line.runs.find((r) => r.box.x >= icon.box.x + icon.box.w - 1) ?? line.runs.at(-1)
    if (!beside) return []
    return entry.label.split(' ').map((str) => ({
      id: '',
      str,
      box: icon.box,
      flow: beside.flow,
      line: beside.line,
      icon: true,
    }))
  })
  const runs = [...e.runs, ...added].map((r, i) => (r.id ? r : { ...r, id: `${String(e.pdfPage)}:${String(i)}` }))
  return { ...e, runs }
}
