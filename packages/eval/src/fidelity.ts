import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { PageScore } from '@make-it-accessible/pipeline/pdf/fidelity-types'
import { judgePage, weighable } from '@make-it-accessible/pipeline/pdf/fidelity-verdict'
import { measureDocument, MUTATIONS, type Mutation, type PageFidelity } from './fidelity-measure.ts'
import { pageDir } from './process.ts'
import { OUT_DIR } from './paths.ts'
import { report, summary, verdicts } from './fidelity-report.ts'
import { loadSources, REBUILT_DIR, sourcePdf, VERIFY_FILE } from './sources.ts'

// pnpm fidelity [--verify [--sealed]] [--inject] [<slug>…]: every rebuilt document's pages measured against their
// PDF (fidelity-measure.ts) and judged (fidelity-verdict.ts); `--inject`: the share of injected defects caught.
const args = process.argv.slice(2)
const verify = args.includes('--verify')
const sealed = args.includes('--sealed')
const inject = args.includes('--inject')
const slugs = args.filter((a) => !a.startsWith('--'))
// `--out=<file>`: where the set's numbers go (pnpm measure gives each document its own); default under out/.
const outFile = args.find((a) => a.startsWith('--out='))?.slice('--out='.length)

const all = await loadSources(verify ? VERIFY_FILE : undefined)
const sources = all.filter((s) => (!sealed || s.group === 'verify-sealed') && (!slugs.length || slugs.includes(s.slug)))
const browser = await chromium.launch()
const documents: { slug: string; pages: PageFidelity[] }[] = []
type Injected = {
  caught: number
  missed: number
  unmeasurable: number
  lines: (PageScore['lines'][number] & { caught: boolean })[]
}
const injected = new Map<Mutation, Injected>()
try {
  for (const s of sources) {
    const dir = join(REBUILT_DIR, s.slug)
    if (!existsSync(join(dir, 'index.html'))) {
      console.error(`${s.slug}: not rebuilt (pnpm rerender ${s.slug}${verify ? ' --verify' : ''})`)
      continue
    }
    const label = sealed ? '•' : s.slug
    if (inject) {
      // Lines the clean page already sends to the text view say nothing about an injected defect.
      const clean = await measureDocument(browser, dir, sourcePdf(s))
      const flagged = new Map(
        clean.flatMap((p) =>
          'skipped' in p ? [] : [[p.keyPage, new Set(judgePage(p).misinforming.flatMap((f) => f.lines))] as const],
        ),
      )
      for (const m of MUTATIONS) tally(m, await measureDocument(browser, dir, sourcePdf(s), m), flagged)
      console.info(`${label}: injected`)
      continue
    }
    const started = Date.now()
    const pages = await measureDocument(browser, dir, sourcePdf(s))
    for (const p of pages) await writeFile(join(pageDir(dir, p.keyPage), 'fidelity.json'), JSON.stringify(p, null, 2))
    documents.push({ slug: s.slug, pages })
    for (const p of pages)
      console.info(
        'skipped' in p
          ? `${label} p${String(p.keyPage)}: skipped (${p.skipped}), ${p.detail}`
          : `${label} p${String(p.keyPage)}: ${summary(p)}`,
      )
    console.info(`${label}: ${String(pages.length)} pages in ${((Date.now() - started) / 1000).toFixed(0)} s`)
  }
} finally {
  await browser.close()
}
if (inject) {
  for (const [m, t] of injected)
    console.info(
      `${m}: caught ${String(t.caught)} of ${String(t.caught + t.missed)} measurable lines (${(t.caught + t.missed ? (100 * t.caught) / (t.caught + t.missed) : 0).toFixed(1)} %), ${String(t.unmeasurable)} unmeasurable`,
    )
  const set = verify ? (sealed ? '-sealed' : '-verify') : ''
  await writeFile(
    outFile ?? join(OUT_DIR, `fidelity-inject${set}.json`),
    JSON.stringify(Object.fromEntries(injected), null, 2),
  )
} else {
  await writeFile(
    outFile ?? join(OUT_DIR, 'fidelity.json'),
    JSON.stringify({ set: verify ? (sealed ? 'verify-sealed' : 'verify') : 'working', documents }, null, 2),
  )
  console.info(['', ...report(documents.flatMap((d) => d.pages)), ...verdicts(documents, sealed)].join('\n'))
}

// Each mutated line counts once: caught when the verdict names it under any misinforming kind (the page goes to Text
// only either way); a line too faint to weigh or on a ground the backdrop lacks is counted apart as unmeasurable.
function tally(m: Mutation, pages: PageFidelity[], flagged: ReadonlyMap<number, ReadonlySet<number>>): void {
  const t = injected.get(m) ?? { caught: 0, missed: 0, unmeasurable: 0, lines: [] }
  for (const p of pages) {
    if ('skipped' in p) continue
    const v = judgePage(p)
    const named = new Set(v.misinforming.flatMap((f) => f.lines))
    for (const i of p.mutated) {
      const l = p.lines[i]
      if (flagged.get(p.keyPage)?.has(i)) continue
      if (!l || !weighable(l)) {
        t.unmeasurable++
        continue
      }
      if (named.has(i)) t.caught++
      else t.missed++
      // The sealed half is reported in aggregate only: no line of it is kept.
      if (!sealed) t.lines.push({ ...l, caught: named.has(i) })
    }
  }
  injected.set(m, t)
}
