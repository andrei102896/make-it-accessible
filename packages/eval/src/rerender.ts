import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parsePage } from '@make-it-accessible/pipeline/model/schema'
import { parseExtraction } from '@make-it-accessible/pipeline/pdf/types'
import { validatePage } from '@make-it-accessible/pipeline/validate/validate'
import { buildHtml, type PageResult } from './process.ts'
import { loadSources, REBUILT_DIR, sourcePdf, type Source } from './sources.ts'
import { withIcons } from '@make-it-accessible/pipeline/pdf/icons'
import { documentLegend } from './legend.ts'
import { extractWhole } from './wholewords.ts'

// pnpm rerender <slug>... | --all: renders a saved run again, no model call, in out/rebuilt/<slug>; fonts, colours,
// hidden words and drawn shapes are read afresh from the PDF, lines.json again when its version is behind.
const args = process.argv.slice(2)
if (!args.length) throw new Error('usage: pnpm rerender <slug>... | --all')
const sources = await loadSources()
const chosen = args.includes('--all') ? sources : args.map((slug) => byslug(sources, slug))

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
  for (const d of (await readdir(out)).filter((x) => /^p\d+$/.test(x)).sort()) {
    const dir = join(out, d)
    const extraction = parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8'))
    const fresh = withIcons(await extractWhole(pdf, extraction.pdfPage), legend)
    // The structure cites the text layer's runs by index; icon words come after them and are read afresh.
    const base = extraction.runs.filter((r) => !r.icon)
    const freshBase = fresh.runs.filter((r) => !r.icon)
    if (freshBase.length !== base.length)
      throw new Error(
        `${s.slug} ${d}: the PDF gives ${String(freshBase.length)} runs, the saved run has ${String(base.length)}`,
      )
    extraction.hidden = fresh.hidden
    extraction.lost = fresh.lost
    extraction.vectors = fresh.vectors
    extraction.rules = fresh.rules
    extraction.pictures = fresh.pictures
    extraction.icons = fresh.icons
    base.forEach((r, i) => {
      const f = freshBase[i]
      if (f?.color) r.color = f.color
      if (f?.font) r.font = f.font
      if (f) Object.assign(r, { str: f.str, box: f.box, restored: f.restored })
    })
    extraction.runs = [...base, ...fresh.runs.filter((r) => r.icon)]
    const structure = parsePage(await readFile(join(dir, 'structure.json'), 'utf8'))
    if (citesPast(structure, base.length))
      throw new Error(`${s.slug} ${d}: the saved structure cites icon words, which are read afresh; run adhoc again`)
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
  const html = await readFile(await buildHtml(pdf, out, results, 'doc', s.title, undefined, true), 'utf8')
  // Crops ride inline; the printed view's backdrops stay files beside the page (preview.ts withAssets).
  const parts = html.split(/src="(p\d+\/img-\w+\.jpg)"/)
  for (let i = 1; i < parts.length; i += 2)
    parts[i] = `src="data:image/jpeg;base64,${(await readFile(join(out, parts[i] ?? ''))).toString('base64')}"`
  const page = join(out, 'page.html')
  await writeFile(page, parts.join(''))
  console.info(
    `${s.slug}: ${String(results.length)} page(s), hidden ${results.map((r) => String(r.extraction.hidden.length)).join(',')}`,
  )
  return page
}

for (const s of chosen) await rebuild(s)

// Whether any citation reaches past the text layer's runs (into icon words appended to a saved run).
function citesPast(value: unknown, count: number): boolean {
  if (Array.isArray(value)) return value.some((v) => citesPast(v, count))
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(value).some(([key, v]) =>
    key === 'src' && Array.isArray(v)
      ? v.some((r: unknown) => Array.isArray(r) && Number(r[1]) >= count)
      : citesPast(v, count),
  )
}
