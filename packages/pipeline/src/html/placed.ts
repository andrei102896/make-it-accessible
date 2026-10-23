import type { TextValue } from '../model/schema.ts'
import type { FaceMetrics, Grid } from '../pdf/backdrop.ts'
import { faceKey } from '../pdf/face.ts'
import type { Box, RunFont } from '../pdf/types.ts'
import { inkOn, inlineInk, printedReads } from './printink.ts'
import { unionOf } from './profile.ts'
import { printFaceOf } from './printface.ts'
import { inkSegments, lineParts, type FaceOf, type Segment } from './segments.ts'
import { flaggedAt } from './source.ts'
import { NOTHING_DRAWN, spotOf, spotsOf, trimmedRun, type Drawn, type Spot } from './spots.ts'
import type { Context, HtmlPage } from './types.ts'
import type { FontManifest } from './webfonts.ts'

// The printed view: each leaf of a page (a heading, a dish's name, a price, a picture) placed where it is printed,
// over the page's backdrop, in custom properties that only the printed view reads (the text view ignores them).

// Readable text on its backdrop (WCAG 1.4.3), large text from 24 px or 18.66 px bold at the printed view's narrowest
// width (nothing shrinks below it).
const READABLE = 4.5
const READABLE_LARGE = 3
const LARGE_PX = 24
const LARGE_BOLD_PX = 18.66
// A run's box is about this much taller than its face's size (ascent and descent), when no size is reported.
const BOX_TO_SIZE = 0.8
// A matched lookalike weight never falls below this on text under LARGE_PX: thin stems vanish at reading sizes.
const MIN_SMALL_WEIGHT = 300

// A leaf's (or a line's) placement as custom properties, in hundredths of the page width; every property written,
// so a placed line never inherits its leaf's. `pxPerPt`: the page's scale at the printed view's narrowest width;
// `ground`: the box whose backdrop decides the ink (a piece of a printed line reads its whole line's).
export function placement(
  spot: Spot,
  pageWidth: number,
  grid: Grid | null,
  pxPerPt: number,
  library: readonly FontManifest[],
  ground: Box = spot.box,
): string {
  const u = (v: number): string => String(Math.round((v / pageWidth) * 100_000) / 1000)
  const { box } = spot
  const props = [`--x:${u(box.x)}`, `--y:${u(box.y)}`, `--w:${u(box.w)}`, `--h:${u(box.h)}`]
  const { size, scale, large } = sized(spot, grid, pxPerPt)
  props.push(`--fs:${u(size)}`, `--lh:${u(box.h / spot.lines)}`)
  props.push(`--ws:${spot.lines === 1 ? 'nowrap' : 'normal'}`, `--ta:${spot.align}`)
  const face = spot.font ? faceIn(spot.font, spot.own, grid, library, large) : null
  const weight = face?.weight ?? spot.weight
  props.push(`--fw:${String(weight)}`, `--fi:${spot.italic ? 'italic' : 'normal'}`)
  // The PDF's own face first, its stand-in after: fit.ts drops the own face where it lacks a letter of the line.
  if (face?.families.length) props.push(`--ff:${face.families.join(', ')}`)
  if (spot.baseline !== null) props.push(`--bl:${u(spot.baseline)}`)
  // Letters printed tighter than their face only where large: running text never closes up. Tracking is in ems
  // of the printed size; a scaled face keeps the printed spacing in points.
  const tracking = (spot.tracking < 0 && !large ? 0 : spot.tracking) / scale
  props.push(`--ls:${String(Math.round(tracking * 1000) / 1000)}`)
  if (spot.color) {
    const readLarge = large || (weight >= 700 && size * pxPerPt >= LARGE_BOLD_PX)
    const target = readLarge ? READABLE_LARGE : READABLE
    const { color, shadow } = inkOn({ ...spot, box: ground }, grid, target, u)
    props.push(`--c:${color}`, `--ts:${shadow}`)
    // Counted by the round (measure-rows.ts): the printed view shows this line under 4.5:1 (3:1 large) as printed.
    if (printedReads({ ...spot, box: ground }, grid, target) === false) props.push('--low:1')
    // The printed outline is centred on the letter's edge with its inner half under the fill, as `paint-order:
    // stroke fill` draws ours: the same width shows the same.
    if (spot.stroke) props.push(`--st:calc(${u(spot.stroke.width)} * 1cqw) ${spot.stroke.color}`)
    for (const w of spot.inline) {
      const ink = inlineInk({ ...spot, ...w }, grid, target)
      if (ink) props.push(`--ink-${w.cls.slice(1)}:${ink}`)
    }
  }
  return ` style="${props.join(';')}"`
}

// A lookalike is sized to the printed face's x-height and cap height (the backdrop's metrics); the PDF's own face is
// the printed glyphs and keeps the printed size.
function sized(spot: Spot, grid: Grid | null, pxPerPt: number): { size: number; scale: number; large: boolean } {
  const metrics = spot.font && !spot.own ? grid?.metrics[faceKey(spot.font)] : undefined
  const scale = metrics ? blend(metrics, spot.lowercase) : 1
  const size = (spot.size ?? (spot.box.h / spot.lines) * BOX_TO_SIZE) * scale
  return { size, scale, large: size * pxPerPt >= LARGE_PX }
}

// A printed face as drawn: its own program first, then its stand-in in the weight whose stem matches the print's.
function faceIn(
  font: RunFont,
  own: string | null,
  grid: Grid | null,
  library: readonly FontManifest[],
  large: boolean,
): { families: string[]; weight: number } {
  const metrics = own ? undefined : grid?.metrics[faceKey(font)]
  const matched = metrics && !large ? Math.max(metrics.weight, MIN_SMALL_WEIGHT) : metrics?.weight
  const face = printFaceOf(font, library, matched)
  const families = [own ? `'${own}'` : null, face?.family ?? null].filter((f) => f !== null)
  return { families, weight: face?.weight ?? font.weight }
}

// A word of the element's family printed in another weight, style or program keeps it (GAELIC bold before its
// regular note); another family's word keeps the element's face.
function wordFace(
  spot: Spot,
  drawn: Drawn,
  grid: Grid | null,
  pxPerPt: number,
  library: readonly FontManifest[],
): FaceOf | undefined {
  const line = spot.font
  if (!line) return undefined
  const { large } = sized(spot, grid, pxPerPt)
  const mine = faceIn(line, spot.own, grid, library, large)
  return (run) => {
    if (!run.font || run.font.key !== line.key) return null
    const own = drawn.faces[run.id] ?? null
    const word = faceIn(run.font, own, grid, library, large)
    if (own === spot.own && word.weight === mine.weight && run.font.italic === spot.italic) return null
    const ff = word.families.length ? `--ff:${word.families.join(', ')};` : ''
    return `${ff}--fw:${String(word.weight)};--fi:${run.font.italic ? 'italic' : 'normal'}`
  }
}

// A line's size scale: the x-height scale to the power of its lowercase share, the cap-height scale to the rest
// (running text takes the printed x-height, a price or a capitals heading the printed cap height).
const blend = ({ lower, caps }: FaceMetrics, lowercase: number): number =>
  lower !== null && caps !== null ? lower ** lowercase * caps ** (1 - lowercase) : (lower ?? caps ?? 1)

export type Placer = {
  // The attributes that place a leaf: its spot, ` data-pl` when its lines are placed instead, ` data-free` when it
  // has no printed spot (read, not shown), nothing inside a placed table or without a backdrop.
  place: (path: string) => string
  // A leaf's text as one placed span per printed line (the gaps between lines as shown), the tail (diet codes)
  // in the last; null when it stays whole: one printed line, a link across lines, or text not following its runs.
  lined: (
    path: string,
    t: TextValue,
    shown: string,
    html: (s: readonly Segment[], face?: FaceOf) => string,
    tail?: string,
  ) => string | null
  // The faces of a placed leaf's words where they differ from its own (segments.ts `.face`).
  faceOf: (path: string) => FaceOf | undefined
  // Whether a price's amount and label are placed each on its own (both have a printed spot); then the price is not.
  apart: (path: string) => boolean
  // ` data-free` on a page in the printed view (text inside a placed leaf that the print does not show there).
  free: string
}
export function placer(page: HtmlPage, ctx: Pick<Context, 'printPx' | 'library' | 'inks'>): Placer {
  const { printPx, library, inks } = ctx
  const e = page.extraction
  const backdrop = page.backdrop ?? null
  const frames = new Map<string, Box>()
  const spots = backdrop ? spotsOf(page.structure.blocks, e, backdrop.grid, frames, inks) : null
  const drawn: Drawn = backdrop?.grid ?? NOTHING_DRAWN
  const pxPerPt = (printPx ?? e.width) / e.width
  const split = new Set<string>()
  return {
    free: spots ? ' data-free' : '',
    faceOf: (path) => {
      const spot = spots?.get(path)
      return spot ? wordFace(spot, drawn, backdrop?.grid ?? null, pxPerPt, library) : undefined
    },
    place: (path) => {
      if (!spots) return ''
      if (split.has(path)) return ' data-pl'
      // Text in doubt (a validator finding) shows as printed: the backdrop keeps it, ours is read (source.ts).
      if (flaggedAt(path, page.flagged)) return ' data-free'
      const frame = frames.get(path)
      const u = (v: number): string => String(Math.round((v / e.width) * 100_000) / 1000)
      if (frame)
        return ` data-frame style="--tx:${u(frame.x)};--ty:${u(frame.y)};--tw:${u(frame.w)};--th:${u(frame.h)}"`
      const spot = spots.get(path)
      if (spot) return placement(spot, e.width, backdrop?.grid ?? null, pxPerPt, library)
      return [...spots.keys()].some((k) => path.startsWith(`${k}.`)) ? '' : ' data-free'
    },
    apart: (path) => {
      // Apart too when the price has no spot of its own (its label placed by another price): the amount alone.
      const both =
        spots?.has(`${path}.amount`) === true &&
        (spots.has(`${path}.qualifier`) || !spots.has(path)) &&
        !flaggedAt(path, page.flagged)
      if (both) split.add(path)
      return both
    },
    lined: (path, t, shown, html, tail = '') => {
      if (!spots?.has(path) || flaggedAt(path, page.flagged)) return null
      // Each piece's words end where their letters do (spots.ts), as a whole leaf's.
      const parts = lineParts(t, e, shown)?.map((p) =>
        'runs' in p ? { ...p, runs: p.runs.map((r) => trimmedRun(r, drawn)) } : p,
      )
      const lines = parts?.flatMap((p) => ('runs' in p ? [p] : [])) ?? []
      // Split only where every link stays whole on one line: the text view must keep the same links.
      const links = (h: string): string[] => h.match(/<a [^>]*>.*?<\/a>/g) ?? []
      const whole = links(html(inkSegments(t, e, shown))).join()
      if (!parts || lines.flatMap((l) => links(html(l.segments))).join() !== whole) return null
      split.add(path)
      const last = lines.at(-1)
      // Pieces of one printed line share its ground: cutting a line moves its words, never changes their ink.
      const row = (r: { flow: number; line: number }): string => `${String(r.flow)}:${String(r.line)}`
      const grounds = Map.groupBy(
        lines.flatMap((l) => l.runs),
        row,
      )
      return parts
        .map((p) => {
          if (!('runs' in p)) return p.gap
          const box = unionOf(p.runs)
          const spot = box ? spotOf(box, p.runs, drawn, inks) : null
          const first = p.runs[0]
          const ground = (first ? unionOf(grounds.get(row(first)) ?? []) : null) ?? box ?? undefined
          const style = spot ? placement(spot, e.width, backdrop?.grid ?? null, pxPerPt, library, ground) : ''
          const face = spot ? wordFace(spot, drawn, backdrop?.grid ?? null, pxPerPt, library) : undefined
          return `<span class="pl"${style}>${html(p.segments, face)}${p === last ? tail : ''}</span>`
        })
        .join('')
    },
  }
}
