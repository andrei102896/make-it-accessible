import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { reviewPage } from '@make-it-accessible/pipeline/model/review'
import { parseExtraction } from '@make-it-accessible/pipeline/pdf/types'
import { renderPage } from '@make-it-accessible/pipeline/pdf/raster'
import { chromium } from 'playwright'
import { costUsd, PRICES } from './cost.ts'

// pnpm review:page <run dir> <file.pdf> [--model]: the AI reviewer compares the PDF's first pages with our page
// (desktop and phone screenshots) and writes review.json beside the page; prints the verdict and differences.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { model: { type: 'string', default: 'claude-sonnet-5-5' }, effort: { type: 'string', default: 'medium' } },
})
const [dir, pdf] = positionals
if (!dir || !pdf) throw new Error('usage: pnpm review:page <run dir> <file.pdf> [--model <id>]')
const options = { model: values.model, effort: values.effort }
if (!PRICES[options.model]) throw new Error(`unknown model ${options.model}`)

// Enough pixels for the reviewer to read a menu, not more: the long edge of each image.
const PDF_EDGE = 1400
const MAX_PDF_PAGES = 2
const SHOTS = [
  { file: 'review-desktop.jpg', width: 1280, height: 1600 },
  { file: 'review-phone.jpg', width: 390, height: 1400 },
]

const pageDirs = (await readdir(dir)).filter((d) => /^p\d+$/.test(d)).sort()
const images: string[] = []
for (const d of pageDirs.slice(0, MAX_PDF_PAGES)) {
  const e = parseExtraction(await readFile(join(dir, d, 'extraction.json'), 'utf8'))
  const k = PDF_EDGE / Math.max(e.width, e.height)
  const size = { width: Math.round(e.width * k), height: Math.round(e.height * k) }
  images.push(await renderPage(pdf, e.pdfPage, size, join(dir, `review-${d}`)))
}
const html = (await readdir(dir)).includes('page.html') ? join(dir, 'page.html') : join(dir, 'index.html')
const browser = await chromium.launch()
try {
  for (const shot of SHOTS) {
    const tab = await (await browser.newContext({ viewport: { width: shot.width, height: shot.height } })).newPage()
    await tab.goto(pathToFileURL(html).href)
    const path = join(dir, shot.file)
    await tab.screenshot({
      path,
      type: 'jpeg',
      quality: 85,
      clip: { x: 0, y: 0, width: shot.width, height: shot.height },
    })
    images.push(path)
  }
} finally {
  await browser.close()
}
const { review, call } = await reviewPage(images, Math.min(pageDirs.length, MAX_PDF_PAGES), options)
const usd = costUsd(options.model, call.usage)
await writeFile(join(dir, 'review.json'), JSON.stringify({ ...review, model: options.model, usd }, null, 2))
console.info(`${review.verdict} · ${review.character} · $${usd.toFixed(3)}`)
for (const d of review.differences) console.info(`  ${d.severity} ${d.category}: ${d.note}`)
