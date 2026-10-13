import { z } from 'zod'

// The part of a saved page score the summary reads; score.json files are parsed against it.
export const RunScore = z.object({
  keyPage: z.number(),
  pass: z.record(z.string(), z.boolean().nullable()),
  c2: z.object({ silent: z.number() }),
  c5: z.object({ silentRows: z.number() }),
  decisions: z.number().nullable(),
})
export type RunScore = z.infer<typeof RunScore>

export type PageRuns = {
  doc: string
  type: string
  keyPage: number
  items: number
  printedPages: number
  runs: RunScore[]
}
export type PageSummary = {
  doc: string
  keyPage: number
  type: string
  passed: number
  runs: number
  silentPriceErrors: number
  decisions: number
  failing: string[]
}
export type Summary = {
  pages: PageSummary[]
  items: number
  pricedPages: number
  silentPriceErrors: number
  itemBound: number | null
  pageBound: number | null
  gridDecisionsPerPage: number | null
  gridDecisionsBound: number | null
}

const passes = (s: RunScore): boolean => Object.values(s.pass).every((ok) => ok !== false)
// One-sided 95 % upper bound for a rate from 0 failures in n independent units.
export const zeroFailureBound = (n: number): number | null => (n > 0 ? 1 - 0.05 ** (1 / n) : null)

// One-sided 95 % upper bound of a Poisson mean from `count` events over `units` units.
export function poissonBound(count: number, units: number): number | null {
  if (units <= 0) return null
  const below = (lambda: number): number => {
    let term = Math.exp(-lambda)
    let sum = term
    for (let i = 1; i <= count; i++) {
      term *= lambda / i
      sum += term
    }
    return sum
  }
  let lo = 0
  let hi = count + 10 * Math.sqrt(count + 1) + 10
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (below(mid) > 0.05) lo = mid
    else hi = mid
  }
  return hi / units
}

export function summarize(pages: readonly PageRuns[]): Summary {
  const summaries = pages.map((p): PageSummary => {
    const failing = [
      ...new Set(p.runs.flatMap((r) => Object.entries(r.pass).flatMap(([c, ok]) => (ok === false ? [c] : [])))),
    ]
    return {
      doc: p.doc,
      keyPage: p.keyPage,
      type: p.type,
      passed: p.runs.filter(passes).length,
      runs: p.runs.length,
      silentPriceErrors: p.runs.reduce((n, r) => n + r.c2.silent + r.c5.silentRows, 0),
      decisions: p.runs.reduce((n, r) => n + (r.decisions ?? 0), 0),
      failing,
    }
  })
  const priced = pages.filter((p) => p.items > 0)
  const silent = summaries.reduce((n, s) => n + s.silentPriceErrors, 0)
  const grid = pages.filter((p) => p.type === 'grid')
  const gridUnits = grid.reduce((n, p) => n + p.printedPages * p.runs.length, 0)
  const gridDecisions = grid.reduce((n, p) => n + p.runs.reduce((m, r) => m + (r.decisions ?? 0), 0), 0)
  const items = priced.reduce((n, p) => n + p.items, 0)
  return {
    pages: summaries,
    items,
    pricedPages: priced.length,
    silentPriceErrors: silent,
    itemBound: silent === 0 ? zeroFailureBound(items) : null,
    pageBound: silent === 0 ? zeroFailureBound(priced.length) : null,
    gridDecisionsPerPage: gridUnits ? gridDecisions / gridUnits : null,
    gridDecisionsBound: poissonBound(gridDecisions, gridUnits),
  }
}

// Paired comparison of two arms: a page regresses when it drops from passing every run to passing at most one.
export function regressions(before: readonly PageSummary[], after: readonly PageSummary[]): string[] {
  return after.flatMap((a) => {
    const b = before.find((x) => x.doc === a.doc && x.keyPage === a.keyPage)
    return b && b.passed === b.runs && a.passed <= 1 ? [`${a.doc} p${String(a.keyPage)}`] : []
  })
}
