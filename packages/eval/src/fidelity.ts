import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { measureDocument, type PageFidelity } from './fidelity-measure.ts'
import { pageDir } from './process.ts'
import { OUT_DIR } from './paths.ts'
import { report, summary, verdicts } from './fidelity-report.ts'
import { loadSources, REBUILT_DIR, sourcePdf, VERIFY_FILE } from './sources.ts'

// pnpm fidelity [--verify [--sealed]] [<slug>…]: every rebuilt document's pages as shown against their PDF drawn by
// pdf.js (fidelity-measure.ts), and what the whole-page check finds (fidelity-verdict.ts).
const args = process.argv.slice(2)
const verify = args.includes('--verify')
const sealed = args.includes('--sealed')
const slugs = args.filter((a) => !a.startsWith('--'))
// `--out=<file>`: where the set's numbers go (pnpm measure gives each document its own); default under out/.
const outFile = args.find((a) => a.startsWith('--out='))?.slice('--out='.length)

const all = await loadSources(verify ? VERIFY_FILE : undefined)
const sources = all.filter((s) => (!sealed || s.group === 'verify-sealed') && (!slugs.length || slugs.includes(s.slug)))
const browser = await chromium.launch()
const documents: { slug: string; pages: PageFidelity[] }[] = []
try {
  for (const s of sources) {
    const dir = join(REBUILT_DIR, s.slug)
    if (!existsSync(join(dir, 'index.html'))) {
      console.error(`${s.slug}: not rebuilt (pnpm rerender ${s.slug}${verify ? ' --verify' : ''})`)
      continue
    }
    const label = sealed ? '•' : s.slug
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
await writeFile(
  outFile ?? join(OUT_DIR, 'fidelity.json'),
  JSON.stringify({ set: verify ? (sealed ? 'verify-sealed' : 'verify') : 'working', documents }, null, 2),
)
console.info(['', ...report(documents.flatMap((d) => d.pages)), ...verdicts(documents, sealed)].join('\n'))
