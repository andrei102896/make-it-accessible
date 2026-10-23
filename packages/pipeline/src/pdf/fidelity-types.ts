import { z } from 'zod'
import type { Box } from './types.ts'

// What the whole-page check (fidelity-outside.ts) takes and gives, apart so the check itself stays self-contained.

export type Image = { width: number; height: number; data: Uint8ClampedArray | readonly number[] }
// `p`: the PDF drawn by pdf.js; `s`: our sheet as shown (the backdrop, our text transparent); `kept`: the boxes of
// words set at an angle, left out.
export type ScoreInput = { p: Image; s: Image; kept: Box[]; cellPx: number }

const Ink = z.object({ pdf: z.number(), ours: z.number() })
export const PageScore = z.object({
  size: z.object({ w: z.number(), h: z.number() }),
  // Each render's ink over the page and per eighth of its height, top first (fidelity-outside.ts inkOf).
  ink: Ink,
  bands: z.array(Ink),
})
export type PageScore = z.infer<typeof PageScore>
