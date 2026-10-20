import { INK, type PageScore } from './fidelity-types.ts'

// What a page's fidelity numbers (fidelity.ts) mean for a reader (EXECUTION_PLAN 2.1): a misinforming finding sends
// the page to the text view, a cosmetic one is reported only.

// Most serious first: the owner reads a page's first (a price away from its dish costs a diner most).
export const MISINFORMING = ['price-moved', 'price-unshown', 'vanished', 'doubled'] as const
export const COSMETIC = ['ragged', 'narrower', 'drawing-missing', 'ground-differs'] as const
export type Misinforming = (typeof MISINFORMING)[number]
export type Kind = Misinforming | (typeof COSMETIC)[number]
// `lines`: indexes into the page's measured lines (texts repeat; an index does not).
export type Finding<K extends Kind = Kind> = { kind: K; lines: number[] }
export type Verdict = { misinforming: Finding<Misinforming>[]; cosmetic: Finding[] }

// Fixed on the working set by looking at every page each flags beside its PDF (EXECUTION_PLAN 2.1, 2026-10-19).
export const LIMITS = {
  // Our ink past this multiple of the PDF's: two copies placed at one spot.
  massHi: 1.6,
  // An effect of ours drawing what the print lacks, past the clean working lines' worst: ink past our letters and
  // the print (0.10; Howies' false shadow 0.32), the line's shape (0.006) or contrast (0.011) moved from the print's.
  excess: 0.1,
  effect: 0.01,
  darker: 0.02,
  // Our ink's contrast under this share of the print's: faint.
  contrast: 0.6,
  // Under this share of the PDF's ink on the line's own rows, the line does not show on its ground.
  massLo: 0.5,
  // Too little ink to weigh (a dot, a hyphen): pixels of the PDF's.
  minMass: 60,
  // A price's ink centre moved this many line heights: it reads beside another size or dish.
  shift: 0.5,
  // Lines sharing a left edge in the PDF (within `edge` px) keep one in ours (within `ragged` em).
  edge: 0.5,
  ragged: 0.5,
  narrower: 0.9,
  // Touching cells outside text the PDF draws and we lack (Scotts' dotted frame: 8; its siblings 0–1).
  cluster: 3,
}

type Line = PageScore['lines'][number]
// Enough ink to weigh, on a ground the backdrop shares: the line's every check applies (the inject tally's too).
export const weighable = (l: Line, limits = LIMITS): boolean => l.mass.pdf >= limits.minMass && l.rim <= INK

export function judgePage(score: PageScore, limits = LIMITS): Verdict {
  const found = new Map<Kind, number[]>()
  const add = (kind: Kind, i: number): void => {
    found.set(kind, [...(found.get(kind) ?? []), i])
  }
  score.lines.forEach((l, i) => {
    if (l.mass.pdf < limits.minMass) return
    const ratio = l.mass.ours / l.mass.pdf
    // On a ground the backdrop lacks, the PDF's ink is not the line's alone: only ours is weighed, against our own
    // ground (white words on a panel we lost show nothing at all).
    if (!weighable(l, limits)) {
      add('ground-differs', i)
      if (l.core.ours === 0) add(l.price ? 'price-unshown' : 'vanished', i)
      return
    }
    if (
      ratio > limits.massHi ||
      (l.excess ?? 0) > limits.excess ||
      (l.effect ?? 0) < -limits.effect ||
      (l.darker ?? 0) > limits.darker
    )
      add('doubled', i)
    const faint = (l.contrast !== null && l.contrast < limits.contrast) || l.core.ours < l.core.pdf * limits.massLo
    // A price with no ink of ours on its rows shows nowhere near its place: unshown, not merely faint.
    if (faint) add(l.price && l.core.ours === 0 ? 'price-unshown' : 'vanished', i)
    const o = l.extent?.ours
    const p = l.extent?.pdf
    const across = o && p ? Math.abs((o.start + o.end - p.start - p.end) / 2) : 0
    if (l.price && (across > limits.shift || Math.abs(l.dy ?? 0) > limits.shift)) add('price-moved', i)
    if (o && p && o.end - o.start < (p.end - p.start) * limits.narrower) add('narrower', i)
  })
  for (const i of raggedLines(score, limits)) add('ragged', i)
  if (score.outside.cluster >= limits.cluster) add('drawing-missing', -1)
  const pick = <K extends Kind>(kinds: readonly K[]): Finding<K>[] =>
    kinds.flatMap((kind) => (found.has(kind) ? [{ kind, lines: found.get(kind) ?? [] }] : []))
  return { misinforming: pick(MISINFORMING), cosmetic: pick(COSMETIC) }
}

// Lines whose PDF ink shares an edge (a column's left, a centred axis, a price column's right) while ours do not.
const EDGES: ((s: { start: number; end: number }) => number)[] = [
  (s) => s.start,
  (s) => (s.start + s.end) / 2,
  (s) => s.end,
]
function raggedLines(score: PageScore, limits: typeof LIMITS): number[] {
  const out = new Set<number>()
  for (const edge of EDGES) {
    const at = score.lines.flatMap((l, i) =>
      l.extent?.pdf && l.extent.ours
        ? [{ i, pdf: l.box.x + edge(l.extent.pdf) * l.box.h, ours: l.box.x + edge(l.extent.ours) * l.box.h, em: l.em }]
        : [],
    )
    for (const a of at)
      for (const b of at)
        if (
          a.i < b.i &&
          Math.abs(a.pdf - b.pdf) <= limits.edge &&
          Math.abs(a.ours - b.ours) > limits.ragged * Math.min(a.em, b.em)
        ) {
          out.add(a.i)
          out.add(b.i)
        }
  }
  return [...out]
}
