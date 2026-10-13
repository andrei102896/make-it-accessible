import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { loadKey, type KeyPage } from './keys.ts'
import { regressions, RunScore, summarize, type PageRuns, type Summary } from './score/aggregate.ts'
import { isAmount, readMoney } from './score/money.ts'

const ScoreFile = z.object({ pages: z.array(RunScore) })
const CURRENCY_HEADER = /[€£$]|\bCHF\b|\bEUR\b|\bGBP\b/

// Distinct priced items on a key page: keyed prices, plus price cells in table rows that are not a keyed product.
function pricedItems(page: KeyPage): number {
  const products = page.products.reduce(
    (n, p) => n + (p.prices ? p.prices.filter((k) => !k.optional).length : (p.money ?? []).length),
    0,
  )
  const articles = page.products.flatMap((p) => (p.articleNo ? [p.articleNo] : []))
  // A cell is a price when it prints a currency or sits under a currency header ("€"); spec values are not.
  const cells = page.tables.flatMap((t) =>
    t.rows
      .filter((r) => !r.some((c) => articles.includes(c)))
      .flatMap((r) =>
        r.filter((c, i) => isAmount(c) && (readMoney(c)?.currency != null || CURRENCY_HEADER.test(t.header[i] ?? ''))),
      ),
  ).length
  return products + cells
}

async function collect(runs: readonly string[]): Promise<PageRuns[]> {
  const pages = new Map<string, PageRuns>()
  for (const run of runs) {
    const docs = (await readdir(run, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
    for (const doc of docs) {
      const key = await loadKey(doc)
      const raw = await readFile(join(run, doc, 'score.json'), 'utf8').catch(() => null)
      if (raw === null) continue
      for (const score of ScoreFile.parse(JSON.parse(raw)).pages) {
        const page = key.pages.find((p) => p.keyPage === score.keyPage)
        if (!page) continue
        const id = `${doc} ${String(score.keyPage)}`
        const entry = pages.get(id) ?? {
          doc,
          type: page.type,
          keyPage: page.keyPage,
          items: pricedItems(page),
          printedPages: key.sections?.filter((s) => s.keyPage === page.keyPage).length || 1,
          runs: [],
        }
        entry.runs.push(score)
        pages.set(id, entry)
      }
    }
  }
  return [...pages.values()]
}

function print(label: string, s: Summary): void {
  console.info(`== ${label}`)
  for (const p of s.pages)
    console.info(
      `${p.doc} p${String(p.keyPage)} [${p.type}]: passed ${String(p.passed)}/${String(p.runs)}` +
        ` silent price errors ${String(p.silentPriceErrors)} decisions ${String(p.decisions)}` +
        (p.failing.length ? ` failing ${p.failing.join(',')}` : ''),
    )
  const pct = (v: number | null): string => (v === null ? '-' : `${(v * 100).toFixed(1)} %`)
  console.info(
    `silent price errors ${String(s.silentPriceErrors)} in ${String(s.items)} distinct priced items on ${String(s.pricedPages)} pages;` +
      ` 95 % upper bound per item ${pct(s.itemBound)}, per page ${pct(s.pageBound)}`,
  )
  console.info(
    `grid decisions per printed page ${s.gridDecisionsPerPage?.toFixed(2) ?? '-'} (95 % upper bound ${s.gridDecisionsBound?.toFixed(2) ?? '-'})`,
  )
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { before: { type: 'string', multiple: true } },
})
const after = summarize(await collect(positionals))
print('runs', after)
if (values.before?.length) {
  const before = summarize(await collect(values.before))
  print('before', before)
  const regressed = regressions(before.pages, after.pages)
  console.info(`regressions (3/3 before, ≤ 1/3 after): ${regressed.join(', ') || 'none'}`)
}
