import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { SHEET } from '@make-it-accessible/pipeline/html/print'
import { CELL, parseGrid } from '@make-it-accessible/pipeline/pdf/backdrop'
import { scorePage, type LineInput, type PageScore, type ScoreInput } from '@make-it-accessible/pipeline/pdf/fidelity'
import { parseExtraction, type Box } from '@make-it-accessible/pipeline/pdf/types'
import { PDFJS_TIMEOUT_MS, withDeadline } from './deadline.ts'
import { CAPTURE_PX, openPdf, type PdfTab } from './pdfshot.ts'
import { pageDir } from './process.ts'

// Each page of a built document measured against its PDF (pipeline/pdf/fidelity.ts): sheet, ground (the sheet
// with its placed text hidden) and the PDF drawn in one Chromium at one scale; pixels stay in the browser.

// The sheet's own scale (2.4 px/pt on A4): the backdrop is drawn at 2.7, a 2× capture would blur it against pdf.js.
const SCALE = 1
const INK = 0.15
const PAD = 0.25
// Two renders of one page at one width differ in height by rounding only.
const SAME_HEIGHT = 2

export type PageFidelity =
  ({ keyPage: number; pdfPage: number; sheetPx: number } & PageScore) | { keyPage: number; skipped: string }
type Sheet = { keyPage: number; sheetPx: number; lines: LineInput[] }

export async function measureDocument(browser: Browser, docDir: string, pdf: string): Promise<PageFidelity[]> {
  const context = await browser.newContext({ viewport: { width: CAPTURE_PX, height: 900 }, deviceScaleFactor: SCALE })
  let pdfTab: PdfTab | null = null
  try {
    const tab = await context.newPage()
    await tab.goto(`file://${encodeURI(join(docDir, 'index.html'))}`)
    await tab.waitForLoadState('networkidle')
    await tab.addStyleTag({ content: '.view, nav.toc { display: none }' })
    await tab.evaluate(() => document.fonts.ready)
    const sheets = await tab.evaluate(inventory, SHEET)
    const out: PageFidelity[] = []
    for (const [i, sheet] of sheets.entries()) {
      const dir = pageDir(docDir, sheet.keyPage)
      const e = parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8'))
      const gridJson = await readFile(join(dir, 'backdrop.json'), 'utf8').catch(() => null)
      if (gridJson === null || e.runs.some((r) => r.ocr)) {
        out.push({ keyPage: sheet.keyPage, skipped: 'no backdrop (a scan)' })
        continue
      }
      const k = (sheet.sheetPx / e.width) * SCALE
      const keptIds = new Set(parseGrid(gridJson).kept)
      // Words left printed and the page's pictures are the backdrop's own: two rasterisers differ on a photo or
      // a drawing (Kenny & Ziggy's wood, 2026-10-19), so the outside measure keeps to rules, frames and dots.
      const kept = [
        ...e.runs.filter((r) => keptIds.has(r.id)).map((r) => r.box),
        ...(e.pictures ?? []).filter((q) => q.kind !== 'fill').map((q) => q.box),
      ].map((b) => scaleBox(b, k))
      const locator = tab.locator(SHEET).nth(i)
      const sheetPng = await locator.screenshot({ type: 'png' })
      const hide = await tab.addStyleTag({ content: '[style*="--x:"] { visibility: hidden }' })
      const groundPng = await locator.screenshot({ type: 'png' })
      await hide.evaluate((el) => {
        el.parentNode?.removeChild(el)
      })
      pdfTab ??= await openPdf(browser, pdf, CAPTURE_PX * SCALE)
      // Two names, replaced each page; the query keeps the tab from showing a cached picture of the page before.
      const name = `${String(sheet.keyPage)}-${String(Date.now())}`
      pdfTab.serve('sheet.png', sheetPng)
      pdfTab.serve('ground.png', groundPng)
      try {
        await pdfTab.draw(e.pdfPage, Math.round(sheet.sheetPx) * SCALE)
        const input = await withDeadline(
          pdfTab.tab.evaluateHandle(loadInput, {
            name,
            lines: sheet.lines.map((l) => ({ ...l, box: scaleBox(l.box, SCALE) })),
            kept,
            cellPx: CELL * k,
            ink: INK,
            pad: PAD,
          }),
          PDFJS_TIMEOUT_MS,
          `${docDir} p${String(sheet.keyPage)}: the renders did not load`,
        )
        const score = await withDeadline(
          pdfTab.tab.evaluate(scorePage, input),
          PDFJS_TIMEOUT_MS,
          `${docDir} p${String(sheet.keyPage)}: the page did not score`,
        )
        await input.dispose()
        const sizes = await pdfTab.tab.evaluate(() => {
          const c = document.querySelector('canvas')
          return c ? [c.width, c.height] : [0, 0]
        })
        const pdfHeight = sizes[1] ?? 0
        if (Math.abs(pdfHeight - score.size.h) > SAME_HEIGHT * SCALE)
          out.push({
            keyPage: sheet.keyPage,
            skipped: `renders differ in height (${String(pdfHeight)} vs ${String(score.size.h)})`,
          })
        else out.push({ keyPage: sheet.keyPage, pdfPage: e.pdfPage, sheetPx: sheet.sheetPx, ...score })
      } catch (error) {
        // A page that stalls is skipped and the PDF tab is opened afresh for the next one.
        out.push({ keyPage: sheet.keyPage, skipped: error instanceof Error ? error.message : String(error) })
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

// In the sheet's tab: every placed line of each sheet, its printed box in the sheet's CSS pixels (fit.ts' units).
function inventory(sheetSelector: string): Sheet[] {
  const sheets = [...document.querySelectorAll<HTMLElement>(sheetSelector)]
  const firstPage = sheets[0]?.getAttribute('data-page') ?? ''
  const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')].filter(
    (el) => el.tagName !== 'IMG' && !el.hasAttribute('data-free'),
  )
  const lumOf = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16)
    return Number.isNaN(n) ? 0 : (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  }
  return sheets.map((sheet) => {
    const keyPage = Number(sheet.getAttribute('data-page'))
    const rect = sheet.getBoundingClientRect()
    const lines = placed.flatMap((el): LineInput[] => {
      // Words a reader hears but the print draws as icons (sr-only) are in the backdrop: nothing of ours to measure.
      const shown = [...el.childNodes]
        .map((n) =>
          n instanceof HTMLElement ? (n.matches('.sr-only, .icon') ? '' : n.textContent) : (n.textContent ?? ''),
        )
        .join('')
        .trim()
      if (!shown) return []
      const container = el.closest<HTMLElement>('section, header')
      const page = container?.getAttribute('data-page') ?? (container?.tagName === 'HEADER' ? firstPage : '')
      if (!container || page !== String(keyPage)) return []
      const c = container.getBoundingClientRect()
      const u = (name: string): number => (Number(el.style.getPropertyValue(name)) * c.width) / 100
      const ts = el.style.getPropertyValue('--ts').trim()
      return [
        {
          text: shown.slice(0, 40),
          box: { x: c.left - rect.left + u('--x'), y: c.top - rect.top + u('--y'), w: u('--w'), h: u('--h') },
          wrapped: el.style.getPropertyValue('--ws').trim() === 'normal',
          dark: lumOf(el.style.getPropertyValue('--c').trim() || '#000000') < 0.5,
          // A printed shadow is an offset copy (`calc(...)`); a halo starts at `0 0`.
          shadowed: ts !== '' && ts !== 'none' && !ts.startsWith('0 0'),
          fit: { k: Number(el.style.getPropertyValue('--k') || 1), lx: Number(el.style.getPropertyValue('--lx') || 0) },
        },
      ]
    })
    return { keyPage, sheetPx: rect.width, lines }
  })
}

// In the PDF's tab: the PDF's canvas and our two PNGs as pixel arrays, with the page's lines and settings.
async function loadInput({ name, ...args }: Omit<ScoreInput, 'p' | 's' | 'g'> & { name: string }): Promise<ScoreInput> {
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
  return {
    ...args,
    p: await read(null),
    s: await read(`/files/sheet.png?${name}`),
    g: await read(`/files/ground.png?${name}`),
  }
}
