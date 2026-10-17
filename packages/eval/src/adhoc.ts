import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { pageCount } from '@make-it-accessible/pipeline/pdf/poppler'
import { OUT_DIR } from './paths.ts'
import { PRICES } from './cost.ts'
import { missingDetails } from './details.ts'
import { BriefFile } from './look.ts'
import { buildHtml, processPage, type PageResult } from './process.ts'
import { axeReport } from './score/axe.ts'
import { keyboardReport } from './score/keyboard.ts'

// Runs any PDF through the pipeline without an answer key: validator findings, axe and cost only, no C1–C5 score.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pages: { type: 'string' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    effort: { type: 'string', default: 'medium' },
    title: { type: 'string' },
    'brief-model': { type: 'string', default: 'claude-sonnet-5-5' },
  },
})
const [pdfPath] = positionals
if (!pdfPath) throw new Error('usage: pnpm adhoc <file.pdf> [--pages 1-5] [--title "Evening menu"]')
const options = { model: values.model, effort: values.effort }
if (!PRICES[options.model]) throw new Error(`unknown model ${options.model}`)

const total = await pageCount(pdfPath)
const [from = 1, to = total] = (values.pages ?? `1-${String(total)}`).split('-').map(Number)
const name = basename(pdfPath, '.pdf').replace(/[^\p{L}\p{N}]+/gu, '_')
const docDir = join(OUT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-adhoc`, name)
await mkdir(docDir, { recursive: true })

const results: PageResult[] = []
for (let page = from; page <= Math.min(to, total); page++) {
  const result = await processPage(pdfPath, page, page, docDir, options, `p${String(page)}`)
  if (result) results.push(result)
}
if (results.length) {
  const briefModel = { model: values['brief-model'], effort: 'low' }
  if (!PRICES[briefModel.model]) throw new Error(`unknown model ${briefModel.model}`)
  const htmlPath = await buildHtml(pdfPath, docDir, results, name, values.title, briefModel)
  const axe = await axeReport(htmlPath)
  const keyboard = await keyboardReport(htmlPath)
  const usd = results.reduce((sum, r) => sum + r.usd, 0)
  // Words in the PDF's text layer that the page does not show (covered or drawn invisibly): never published.
  const hidden = results.flatMap((r) => {
    const ids = new Set(r.extraction.hidden)
    const words = r.extraction.runs.filter((run) => ids.has(run.id) && run.str.trim())
    return words.length ? [{ page: r.pdfPage, text: words.map((w) => w.str).join(' ') }] : []
  })
  // Andrei's checklist before sending: what the brief saw on the PDF that the page does not draw.
  const html = await readFile(htmlPath, 'utf8')
  const { brief } = BriefFile.parse(JSON.parse(await readFile(join(docDir, 'brief.json'), 'utf8')))
  const missing = brief.details ? missingDetails(html, brief.details) : null
  const summary = { pages: results.length, failed: to - from + 1 - results.length, usd, axe, keyboard, hidden, missing }
  await writeFile(join(docDir, 'summary.json'), JSON.stringify(summary, null, 2))
  console.info(
    `pages ${String(results.length)}, failed ${String(summary.failed)}, $${usd.toFixed(4)}, axe critical ${String(axe.critical)} serious ${String(axe.serious)}`,
  )
  const kb = [keyboard.unreachable.length, keyboard.noRing.length, keyboard.obscured.length].map(String)
  console.info(
    `keyboard ${String(keyboard.stops)} stops, unreachable ${kb[0] ?? ''}, no focus ring ${kb[1] ?? ''}, hidden ${kb[2] ?? ''}`,
  )
  for (const h of hidden) console.info(`p${String(h.page)} not visible in the PDF, not published: ${h.text}`)
  if (!missing) console.info('design details: not asked (brief saved before they were)')
  for (const d of missing ?? []) console.info(`not reproduced: ${d.kind} near "${d.near}"`)
  console.info(htmlPath)
  // One file to attach to an email: the page crops travel inside it.
  const parts = html.split(/src="(p\d+\/img-\d+\.jpg)"/)
  for (let i = 1; i < parts.length; i += 2)
    parts[i] = `src="data:image/jpeg;base64,${(await readFile(join(docDir, parts[i] ?? ''))).toString('base64')}"`
  const single = join(docDir, `${name}.html`)
  await writeFile(single, parts.join(''))
  console.info(single)
}
