import { execFile } from 'node:child_process'
import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { parseExtraction } from '@make-it-accessible/pipeline/pdf/types'
import { loadSources, REBUILT_DIR, sourcePdf } from './sources.ts'

// pnpm review:open [--all | <slug>…] [--with <page.html> <file.pdf>]: out/rebuilt/review.html, each document's PDF
// pages beside our printed sheets at one scale, opened in Safari for Andrei's review after each rendering change.
const run = promisify(execFile)
const RENDER_DPI = 100
// The width our page is captured at: a desktop window, where every page shows its printed view (small body text
// reflows below ~1050 px: Frankie & Johnnie's 7 pt).
const CAPTURE_PX = 1440
// A printed page of ours (html/print.ts).
const SHEET = 'section[data-page][style*="--ar:"]'
const OUT = join(REBUILT_DIR, 'review.html')

type Doc = { title: string; page: string; pdf: string; dir: string }
const args = process.argv.slice(2)
const at = args.indexOf('--with')
const [withPage, withPdf] = at >= 0 ? [args[at + 1], args[at + 2]] : []
const extra: Doc[] =
  withPage && withPdf
    ? [{ title: basename(dirname(withPage)), page: withPage, pdf: withPdf, dir: dirname(withPage) }]
    : []
const picked = args.filter((a, i) => !a.startsWith('--') && (at < 0 || (i !== at + 1 && i !== at + 2)))
const all = await loadSources()
const unknown = picked.filter((slug) => !all.some((s) => s.slug === slug))
if (unknown.length) throw new Error(`not in the sources: ${unknown.join(', ')}`)
const sources = all.filter((s) => args.includes('--all') || picked.includes(s.slug))
const docs: Doc[] = [
  ...sources.map((s) => ({
    title: s.title,
    page: join(REBUILT_DIR, s.slug, 'page.html'),
    pdf: sourcePdf(s),
    dir: join(REBUILT_DIR, s.slug),
  })),
  ...extra,
]
if (!docs.length) throw new Error('usage: pnpm review:open --all | <slug>… [--with <page.html> <file.pdf>]')

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false,
  )
// A page of the PDF rendered once, kept beside the page's folder.
async function render(doc: Doc, n: number, pdfPage: number): Promise<string> {
  const out = join(doc.dir, `pdf-p${String(n).padStart(2, '0')}`)
  if (!(await exists(`${out}.jpg`)))
    await run('pdftocairo', [
      '-jpeg',
      '-r',
      String(RENDER_DPI),
      '-f',
      String(pdfPage),
      '-l',
      String(pdfPage),
      '-singlefile',
      doc.pdf,
      out,
    ])
  return `${out}.jpg`
}
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const browser = await chromium.launch()
const rows: string[] = []
try {
  for (const [i, doc] of docs.entries()) {
    const pages = (await readdir(doc.dir)).filter((d) => /^p\d+$/.test(d)).sort()
    const renders: string[] = []
    for (const [n, d] of pages.entries()) {
      const e = parseExtraction(await readFile(join(doc.dir, d, 'extraction.json'), 'utf8'))
      renders.push(relative(REBUILT_DIR, await render(doc, n + 1, e.pdfPage)))
    }
    const tab = await (await browser.newContext({ viewport: { width: CAPTURE_PX, height: 900 } })).newPage()
    await tab.goto(pathToFileURL(doc.page).href)
    await tab.waitForLoadState('networkidle')
    // The capture is the printed sheet alone: the view switch and the contents box stay out of the comparison.
    await tab.addStyleTag({ content: '.view, nav.toc { display: none }' })
    // Each printed sheet alone, so it stands beside its PDF page at the same scale; the whole page when none prints.
    const sheets = tab.locator(SHEET)
    const count = await sheets.count()
    const shots: string[] = []
    for (let n = 0; n < Math.max(1, count); n++) {
      const shot = join(doc.dir, `review-p${String(n + 1).padStart(2, '0')}.jpg`)
      if (count) await sheets.nth(n).screenshot({ path: shot, type: 'jpeg', quality: 85 })
      else await tab.screenshot({ path: shot, type: 'jpeg', quality: 85, fullPage: true })
      shots.push(`${relative(REBUILT_DIR, shot)}?v=${String(Date.now())}`)
    }
    await tab.context().close()
    const img = (src: string): string => `<img src="${src}" alt="">`
    rows.push(
      `<section id="d${String(i)}"><h2>${esc(doc.title)}</h2><div class="row"><figure><figcaption>PDF</figcaption>${renders.map(img).join('')}</figure><figure><figcaption>As printed (HTML)</figcaption>${shots.map(img).join('')}</figure></div></section>`,
    )
  }
} finally {
  await browser.close()
}
const nav = docs.map((d, i) => `<a href="#d${String(i)}">${esc(d.title)}</a>`).join('')
await writeFile(
  OUT,
  `<!doctype html><meta charset="utf-8"><title>PDF beside page</title><style>
body{margin:0 16px 16px;font:14px system-ui}nav{display:flex;flex-wrap:wrap;gap:.25rem 1rem;padding:.5rem 0}
h2{margin:28px 0 6px}.row{display:flex;gap:10px;align-items:flex-start}figure{margin:0;width:50%}
figcaption{color:#555;margin-bottom:4px}figure img{display:block;width:100%;border:1px solid #ccc;margin-bottom:8px}
</style><nav>${nav}</nav>${rows.join('')}`,
)
await run('open', ['-a', 'Safari', OUT])
console.info(`${String(docs.length)} documents in ${OUT}`)
