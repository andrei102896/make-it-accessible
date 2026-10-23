import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { SHEET } from '@make-it-accessible/pipeline/html/print'
import { CELL, parseGrid } from '@make-it-accessible/pipeline/pdf/backdrop'
import { scoreOutside } from '@make-it-accessible/pipeline/pdf/fidelity-outside'
import type { PageScore, ScoreInput } from '@make-it-accessible/pipeline/pdf/fidelity-types'
import { parseExtraction, type Box } from '@make-it-accessible/pipeline/pdf/types'
import { PDFJS_TIMEOUT_MS, withDeadline } from './deadline.ts'
import { CAPTURE_PX, openPdf, wholePage, type PdfTab } from './pdfshot.ts'
import { pageDir } from './process.ts'
import { degraded } from '@make-it-accessible/pipeline/degraded'

// Each page of a built document as shown (its backdrop, our text transparent) against its PDF drawn by pdf.js, in
// one Chromium at one scale (pipeline/pdf/fidelity-outside.ts); pixels stay in the browser.

// A retina capture: the sheet then shows the 2× backdrop, pixel for pixel what pdf.js draws at twice the sheet's width.
const SCALE = 2
// Two renders of one page at one width differ in height by rounding only.
const SAME_HEIGHT = 2

// Why a page was not measured: a scan has no backdrop; two renders that differ in height do not compare; a stall.
export type Skip = 'scan' | 'height' | 'stall'
export type PageFidelity =
  | ({ keyPage: number; pdfPage: number; sheetPx: number } & PageScore)
  | { keyPage: number; skipped: Skip; detail: string }

export async function measureDocument(browser: Browser, docDir: string, pdf: string): Promise<PageFidelity[]> {
  const context = await browser.newContext({ viewport: { width: CAPTURE_PX, height: 900 }, deviceScaleFactor: SCALE })
  let pdfTab: PdfTab | null = null
  try {
    const tab = await context.newPage()
    await tab.goto(`file://${encodeURI(join(docDir, 'index.html'))}`)
    await tab.waitForLoadState('networkidle')
    await tab.addStyleTag({ content: '.view, nav.toc { display: none }' })
    await wholePage(tab)
    const sheets = await tab.evaluate(
      (selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)].map((el) => ({
          keyPage: Number(el.getAttribute('data-page')),
          sheetPx: el.getBoundingClientRect().width,
        })),
      SHEET,
    )
    const out: PageFidelity[] = []
    for (const [i, sheet] of sheets.entries()) {
      const dir = pageDir(docDir, sheet.keyPage)
      const e = parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8'))
      const gridJson = await readFile(join(dir, 'backdrop.json'), 'utf8').catch(() => null)
      if (gridJson === null || e.runs.some((r) => r.ocr)) {
        out.push({ keyPage: sheet.keyPage, skipped: 'scan', detail: 'no backdrop' })
        continue
      }
      const k = (sheet.sheetPx / e.width) * SCALE
      // Words set at an angle stay out; pictures stay in: both renders are pdf.js' (a page Poppler drew differs on
      // a photo, logged where it fell back).
      const keptIds = new Set(parseGrid(gridJson).kept)
      const kept = e.runs.filter((r) => keptIds.has(r.id)).map((r) => scaleBox(r.box, k))
      const sheetPng = await tab.locator(SHEET).nth(i).screenshot({ type: 'png' })
      pdfTab ??= await openPdf(browser, pdf, CAPTURE_PX * SCALE)
      // Names replaced each page; the query keeps the tab from showing a cached picture of the page before.
      const name = `${String(sheet.keyPage)}-${String(Date.now())}`
      pdfTab.serve('sheet.png', sheetPng)
      try {
        await pdfTab.draw(e.pdfPage, Math.round(sheet.sheetPx) * SCALE)
        const input = await withDeadline(
          pdfTab.tab.evaluateHandle(loadInput, { name, kept, cellPx: CELL * k }),
          PDFJS_TIMEOUT_MS,
          `${docDir} p${String(sheet.keyPage)}: the renders did not load`,
        )
        const score = await withDeadline(
          pdfTab.tab.evaluate(scoreOutside, input),
          PDFJS_TIMEOUT_MS,
          `${docDir} p${String(sheet.keyPage)}: the page did not score`,
        )
        await input.dispose()
        const pdfHeight = await pdfTab.tab.evaluate(() => document.querySelector('canvas')?.height ?? 0)
        if (Math.abs(pdfHeight - score.size.h) > SAME_HEIGHT * SCALE)
          out.push({
            keyPage: sheet.keyPage,
            skipped: 'height',
            detail: `renders differ in height (${String(pdfHeight)} vs ${String(score.size.h)})`,
          })
        else out.push({ keyPage: sheet.keyPage, pdfPage: e.pdfPage, sheetPx: sheet.sheetPx, ...score })
      } catch (error) {
        // A page that stalls is skipped and the PDF tab is opened afresh for the next one.
        const detail = error instanceof Error ? error.message : String(error)
        degraded(`${docDir} p${String(sheet.keyPage)}: measure stalled, ${detail}`)
        out.push({ keyPage: sheet.keyPage, skipped: 'stall', detail })
        await pdfTab.close()
        pdfTab = null
      }
    }
    return out
  } finally {
    await pdfTab?.close()
    await context.close()
  }
}

const scaleBox = (b: Box, k: number): Box => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k })

// In the PDF's tab: the PDF's canvas and our sheet as pixel arrays, with the page's settings.
async function loadInput({ name, ...args }: Omit<ScoreInput, 'p' | 's'> & { name: string }): Promise<ScoreInput> {
  const read = async (src: string | null): Promise<ScoreInput['p']> => {
    const canvas = src === null ? document.querySelector('canvas') : document.createElement('canvas')
    if (!canvas) throw new Error('no canvas')
    if (src !== null) {
      const img = new Image()
      img.src = src
      await img.decode()
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
    }
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height)
    if (!data) throw new Error('no pixels')
    return { width: data.width, height: data.height, data: data.data }
  }
  return { ...args, p: await read(null), s: await read(`/files/sheet.png?${name}`) }
}
