import type { PageScore } from './fidelity-types.ts'

// What a page's whole-page check (fidelity-outside.ts) means for a reader: reported, never a reason for the text view.
export type Kind = 'lighter'
export type Finding = { kind: Kind }

export const LIMITS = {
  // Our ink under this share of the PDF's, over the page or a band: faded letters or a strip left blank (Poppler's
  // Brawn 0.81; pdf.js' own pages 0.97–1.04 on the set, their bands from 0.89).
  lighter: 0.85,
  // A band weighs only with this share of the page's ink: a near-empty margin's ratio is noise.
  band: 0.05,
}

export function judgePage(score: PageScore, limits = LIMITS): Finding[] {
  const low = (b: { pdf: number; ours: number }): boolean => b.ours < b.pdf * limits.lighter
  const page = score.ink.pdf > 0 && low(score.ink)
  const band = score.bands.some((b) => b.pdf >= score.ink.pdf * limits.band && b.pdf > 0 && low(b))
  return page || band ? [{ kind: 'lighter' }] : []
}
