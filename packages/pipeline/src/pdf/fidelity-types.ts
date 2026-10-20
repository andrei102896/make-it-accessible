import { z } from 'zod'
import type { Box } from './types.ts'

// What the fidelity measure (fidelity.ts) takes and gives, apart so the measure itself stays self-contained.

// A pixel farther from its ground's luminance than this is ink (2026-10-19: resampling and JPEG noise stay under
// 0.12 at the 90th percentile); the measure's `ink`, and the verdict's line of a ground that differs.
export const INK = 0.15

export type Image = { width: number; height: number; data: Uint8ClampedArray | readonly number[] }
// `fit`: the width scale (`--k`) and spread (`--lx`, cqw a letter) the stand-in face needed to fill the printed box;
// `ink`: the line's colour (`--c`), dark or light against the ground under it; `em`: its font size in pixels.
export type LineInput = {
  text: string
  box: Box
  em: number
  ink: string | null
  wrapped: boolean
  shadowed: boolean
  // Drawn with an effect of ours (`--ts`: a printed shadow or a halo).
  effect: boolean
  // A price's amount or label: one moved reads beside another size or dish.
  price: boolean
  fit: { k: number; lx: number }
}
export type ScoreInput = {
  p: Image
  s: Image
  g: Image
  // Our sheet with every effect off: what an effect adds is the difference.
  n: Image | null
  lines: LineInput[]
  kept: Box[]
  cellPx: number
  // INK, passed in (the measure runs in a tab and names nothing); a line's box is padded by `pad` of its height.
  ink: number
  pad: number
}

const Span = z.object({ start: z.number(), end: z.number(), gap: z.number() })
// `rim`: the PDF's ground beside the line against ours (worst side's median; past `ink`, its own ground is used);
// `dy`: the ink centre's shift in line heights, down positive.
const Line = z.object({
  text: z.string(),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  em: z.number(),
  price: z.boolean(),
  mass: z.object({ ours: z.number(), pdf: z.number() }),
  // The ink on the line's own rows: a rule above or below, drawn darker by one rasteriser, stays out.
  core: z.object({ ours: z.number(), pdf: z.number() }),
  rim: z.number(),
  // How much our effect (shadow, halo) brings our ink's shape nearer the print's: negative, it draws what the print
  // lacks (null: no effect, or a ground the backdrop lacks).
  effect: z.number().nullable(),
  // How much our effect moves our ink's contrast away from the print's, over the print's (a dark glow round gold).
  darker: z.number().nullable(),
  // Our ink on the line's rows past both our bare letters and the print's, over the print's (null: no effect).
  excess: z.number().nullable(),
  // Our ink's distance from its ground over the PDF's (the far half of each): faint ink reads under one.
  contrast: z.number().nullable(),
  dy: z.number().nullable(),
  colour: z.number().nullable(),
  extent: z.object({ ours: Span.nullable(), pdf: Span.nullable() }).nullable(),
  shadowed: z.boolean(),
  fit: z.object({ k: z.number(), lx: z.number() }),
})
// `pdf`: the PDF's ink in the cell; `ours`: how much the two renders differ there.
const Cell = z.object({ x: z.number(), y: z.number(), pdf: z.number(), ours: z.number() })
export const PageScore = z.object({
  size: z.object({ w: z.number(), h: z.number() }),
  lines: z.array(Line),
  outside: z.object({
    cells: z.number(),
    busy: z.number(),
    pdfOnly: z.number(),
    oursOnly: z.number(),
    // The largest group of pdf-only cells that touch (a frame's dotted side, not scattered noise).
    cluster: z.number(),
    worst: z.array(Cell),
  }),
  groundOffset: z.number(),
})
export type PageScore = z.infer<typeof PageScore>
