import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Refused } from '@make-it-accessible/pipeline/pdf/refused'
import { validatePage } from '@make-it-accessible/pipeline/validate/validate'
import { buildHtml, type PageResult } from './process.ts'
import { loadSources, REBUILT_DIR, sourcePdf, VERIFY_FILE, type Source } from './sources.ts'
import { documentLegend } from './legend.ts'
import { refreshedPage, savedPdfPage } from './refresh.ts'

// pnpm rerender <slug>... | --all: renders a saved run again, no model call, in out/rebuilt/<slug>; fonts, colours,
// hidden words and drawn shapes are read afresh from the PDF, lines.json again when its version is behind.
const args = process.argv.slice(2)
if (!args.length) throw new Error('usage: pnpm rerender <slug>... | --all [--verify [--sealed]]')
// `--verify` rebuilds the verification set (`--sealed`: its sealed half, aggregates only in any report).
const all = await loadSources(args.includes('--verify') ? VERIFY_FILE : undefined)
const sources = args.includes('--sealed') ? all.filter((s) => s.group === 'verify-sealed') : all
const slugs = args.filter((a) => !a.startsWith('--'))
const chosen = args.includes('--all') ? sources : slugs.map((slug) => byslug(sources, slug))

function byslug(all: readonly Source[], slug: string): Source {
  const s = all.find((x) => x.slug === slug)
  if (!s) throw new Error(`${slug}: not in ${String(all.length)} sources`)
  return s
}

async function rebuild(s: Source): Promise<string> {
  const out = join(REBUILT_DIR, s.slug)
  await rm(out, { recursive: true, force: true })
  await cp(s.run, out, { recursive: true })
  const pdf = sourcePdf(s)
  const legend = await documentLegend(pdf)
  const results: PageResult[] = []
  const expected: number[] = []
  for (const d of (await readdir(out)).filter((x) => /^p\d+$/.test(x)).sort()) {
    const dir = join(out, d)
    expected.push(await savedPdfPage(dir))
    // A page whose model call failed has no structure: it stays missing and holds the document.
    const page = await refreshedPage(pdf, dir, legend)
    if (!page) continue
    const { extraction, structure } = page
    results.push({
      keyPage: extraction.pdfPage,
      pdfPage: extraction.pdfPage,
      dir,
      structure,
      extraction,
      validation: validatePage(structure, extraction),
      usd: 0,
    })
  }
  const html = await readFile(await buildHtml(pdf, out, results, expected, 'doc', s.title, undefined, true), 'utf8')
  // Crops ride inline; the printed view's backdrops stay files beside the page (preview.ts withAssets).
  const parts = html.split(/src="(p\d+\/img-\w+\.jpg)"/)
  for (let i = 1; i < parts.length; i += 2)
    parts[i] = `src="data:image/jpeg;base64,${(await readFile(join(out, parts[i] ?? ''))).toString('base64')}"`
  const file = join(out, 'page.html')
  await writeFile(file, parts.join(''))
  console.info(
    `${s.slug}: ${String(results.length)} page(s), hidden ${results.map((r) => String(r.extraction.hidden.length)).join(',')}`,
  )
  return file
}

for (const s of chosen)
  await rebuild(s).catch((e: unknown) => {
    // A document the engine now refuses (pdf/preflight.ts) is reported, the rest of the set rebuilt.
    if (!(e instanceof Refused)) throw e
    console.error(`${s.slug}: refused, ${e.message}`)
  })
