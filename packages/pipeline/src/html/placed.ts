import type { TextValue } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import type { Box } from '../pdf/types.ts'
import { printedReads } from './printink.ts'
import { unionOf } from './profile.ts'
import { inkSegments, lineParts, type Segment } from './segments.ts'
import { flaggedAt } from './source.ts'
import { NOTHING_DRAWN, spotOf, spotsOf, trimmedRun, type Drawn, type Spot } from './spots.ts'
import type { Context, HtmlPage } from './types.ts'

// The printed view: each leaf of a page (a heading, a dish's name, a price, a picture) as an invisible box at its
// printed place over the backdrop, in custom properties that only the printed view reads (the text view ignores them).

// Readable text on its backdrop (WCAG 1.4.3), large text from 24 px or 18.66 px bold at the printed view's narrowest
// width (nothing shrinks below it).
const READABLE = 4.5
const READABLE_LARGE = 3
const LARGE_PX = 24
const LARGE_BOLD_PX = 18.66
// A run's box is about this much taller than its face's size (ascent and descent), when no size is reported.
const BOX_TO_SIZE = 0.8

// A leaf's (or a line's) placement as custom properties, in hundredths of the page width; every property written,
// so a placed line never inherits its leaf's. `pxPerPt`: the page's scale at the printed view's narrowest width;
// `ground`: the box whose backdrop weighs the ink for `--low` (a piece of a printed line reads its whole line's).
export function placement(
  spot: Spot,
  pageWidth: number,
  grid: Grid | null,
  pxPerPt: number,
  ground: Box = spot.box,
): string {
  const u = (v: number): string => String(Math.round((v / pageWidth) * 100_000) / 1000)
  const { box } = spot
  const props = [`--x:${u(box.x)}`, `--y:${u(box.y)}`, `--w:${u(box.w)}`, `--h:${u(box.h)}`]
  const size = spot.size ?? (box.h / spot.lines) * BOX_TO_SIZE
  props.push(`--fs:${u(size)}`, `--lh:${u(box.h / spot.lines)}`)
  props.push(`--ws:${spot.lines === 1 ? 'nowrap' : 'normal'}`, `--ta:${spot.align}`)
  if (spot.color) {
    const px = size * pxPerPt
    const target = px >= LARGE_PX || (spot.weight >= 700 && px >= LARGE_BOLD_PX) ? READABLE_LARGE : READABLE
    // Counted by the round (measure-rows.ts): the printed view shows this line under 4.5:1 (3:1 large) as printed.
    if (printedReads({ ...spot, box: ground }, grid, target) === false) props.push('--low:1')
  }
  return ` style="${props.join(';')}"`
}

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
    html: (s: readonly Segment[]) => string,
    tail?: string,
  ) => string | null
  // Whether a price's amount and label are placed each on its own (both have a printed spot); then the price is not.
  apart: (path: string) => boolean
  // ` data-free` on a page in the printed view (text inside a placed leaf that the print does not show there).
  free: string
}
export function placer(page: HtmlPage, ctx: Pick<Context, 'printPx' | 'inks'>): Placer {
  const { printPx, inks } = ctx
  const e = page.extraction
  const backdrop = page.backdrop ?? null
  const frames = new Map<string, Box>()
  const spots = backdrop ? spotsOf(page.structure.blocks, e, backdrop.grid, frames, inks) : null
  const drawn: Drawn = backdrop?.grid ?? NOTHING_DRAWN
  const pxPerPt = (printPx ?? e.width) / e.width
  const split = new Set<string>()
  return {
    free: spots ? ' data-free' : '',
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
      if (spot) return placement(spot, e.width, backdrop?.grid ?? null, pxPerPt)
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
      // Pieces of one printed line share its ground: cutting a line never changes how its ink is weighed.
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
          const style = spot ? placement(spot, e.width, backdrop?.grid ?? null, pxPerPt, ground) : ''
          return `<span class="pl"${style}>${html(p.segments)}${p === last ? tail : ''}</span>`
        })
        .join('')
    },
  }
}
