import { z } from 'zod'
import type { KeyDoc, KeyPage } from '../keys.ts'
import { CURRENCY_HEADER, isAmount, readMoney } from './money.ts'

// The part of a saved page score the summary reads; score.json files are parsed against it.
export const RunScore = z.object({
  keyPage: z.number(),
  pass: z.record(z.string(), z.boolean().nullable()),
  c2: z.object({ silent: z.number(), unverified: z.number().default(0) }),
  c5: z.object({ silentRows: z.number() }),
  decisions: z.number().nullable(),
})
export type RunScore = z.infer<typeof RunScore>

export type PageRuns = {
  doc: string
  type: string
  keyPage: number
  items: number
  // Priced items read from the render (image-only or unreadable glyphs), reported apart: nothing mechanical checks their key.
  seenItems: number
  // Printed pages that carry products.
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
  seenItems: number
  // Worst run per page, summed: prices whose role was not checked.
  unverified: number
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
  // Runs of one page are not independent, so the bound counts each page once, at its worst run.
  const worstDecisions = grid.reduce((n, p) => n + Math.max(0, ...p.runs.map((r) => r.decisions ?? 0)), 0)
  const gridPages = grid.reduce((n, p) => n + p.printedPages, 0)
  const items = priced.reduce((n, p) => n + p.items, 0)
  return {
    pages: summaries,
    items,
    seenItems: priced.reduce((n, p) => n + p.seenItems, 0),
    unverified: pages.reduce((n, p) => n + Math.max(0, ...p.runs.map((r) => r.c2.unverified)), 0),
    pricedPages: priced.length,
    silentPriceErrors: silent,
    itemBound: silent === 0 ? zeroFailureBound(items) : null,
    pageBound: silent === 0 ? zeroFailureBound(priced.length) : null,
    gridDecisionsPerPage: gridUnits ? gridDecisions / gridUnits : null,
    gridDecisionsBound: poissonBound(worstDecisions, gridPages),
  }
}

// Paired comparison of two arms: a page regresses when it drops from passing every run to passing at most one.
export function regressions(before: readonly PageSummary[], after: readonly PageSummary[]): string[] {
  return after.flatMap((a) => {
    const b = before.find((x) => x.doc === a.doc && x.keyPage === a.keyPage)
    return b && b.passed === b.runs && a.passed <= 1 ? [`${a.doc} p${String(a.keyPage)}`] : []
  })
}

// Distinct priced items on a key page: keyed prices, plus price cells of table rows that are not a keyed product.
export function pricedItems(page: KeyPage): number {
  const products = page.products.reduce(
    (n, p) => n + (p.prices ? p.prices.length : (p.money ?? []).length),
    page.textPrices.length,
  )
  if (page.pricedCells !== undefined) return products + page.pricedCells
  const articles = page.products.flatMap((p) => (p.articleNo ? [p.articleNo] : []))
  // A cell is a price when it prints a currency or sits under a currency header ("€"); spec values are not.
  const cells = page.tables.flatMap((t) =>
    t.rows
      .filter((r) => !r.some((c) => c !== null && articles.includes(c)))
      .flatMap((r) =>
        r.filter(
          (c, i): c is string =>
            c !== null && isAmount(c) && (readMoney(c)?.currency != null || CURRENCY_HEADER.test(t.header[i] ?? '')),
        ),
      ),
  ).length
  return products + cells
}

// Printed pages that carry products: a spread's photo-only half does not dilute decisions per page.
export function productPages(key: KeyDoc, page: KeyPage): number {
  const anchors = page.products.map((p) => p.anchor)
  const own = key.sections?.filter((s) => s.keyPage === page.keyPage) ?? []
  return own.filter((s) => s.anchors.some((a) => anchors.includes(a))).length || 1
}
