import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { loadKey } from './keys.ts'
import {
  pricedItems,
  productPages,
  regressions,
  RunScore,
  summarize,
  type PageRuns,
  type Summary,
} from './score/aggregate.ts'

const ScoreFile = z.object({ pages: z.array(RunScore) })

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
          seenItems: [...page.products.flatMap((p) => p.prices ?? []), ...page.textPrices].filter((k) => k.seen).length,
          printedPages: productPages(key, page),
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
    `silent price errors ${String(s.silentPriceErrors)} in ${String(s.items)} distinct priced items` +
      ` (${String(s.seenItems)} read from the render) on ${String(s.pricedPages)} pages;` +
      ` 95 % upper bound per item ${pct(s.itemBound)}, per page ${pct(s.pageBound)}`,
  )
  console.info(`prices whose role the output does not show or the key leaves open: ${String(s.unverified)}`)
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
