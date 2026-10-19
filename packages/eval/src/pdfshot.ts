import { readFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as PdfJs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Browser, BrowserContext } from 'playwright'
import { withDeadline } from './deadline.ts'

// PDF pages drawn by pdf.js in the browser that captures our sheets: embedded faces load as browser fonts and their
// text goes through the same rasteriser as ours (Poppler's thin strokes read lighter: Bannatyne p2, 2026-10-18).

const PDFJS = dirname(dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/build/pdf.mjs'))))
// Same origin for the page and pdf.js' worker; every request is answered from disk (context.route).
const ORIGIN = 'http://pdf.review'
// One document's parse or one page's render; past it the tab is closed (a stuck evaluate keeps the CPU busy).
const TIMEOUT_MS = 60_000

export type Shot = { pdfPage: number; width: number; out: string }

// Renders each page at its CSS width into its `out` JPEG; returns the pages drawn (others keep their fallback).
export async function pdfShots(browser: Browser, pdf: string, shots: readonly Shot[]): Promise<Set<number>> {
  const done = new Set<number>()
  if (!shots.length) return done
  const width = Math.max(...shots.map((s) => s.width))
  let context: BrowserContext | null = null
  try {
    context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname
      const file =
        path === '/doc.pdf'
          ? pdf
          : path.startsWith('/build/') || path.startsWith('/standard_fonts/') || path.startsWith('/cmaps/')
            ? join(PDFJS, normalize(path))
            : null
      if (path === '/index.html')
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><script type="module" src="/build/pdf.mjs"></script><body style="margin:0">',
        })
      else if (!file) await route.fulfill({ status: 404 })
      else
        await route.fulfill({
          contentType: path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream',
          body: await readFile(file),
        })
    })
    const tab = await context.newPage()
    await tab.goto(`${ORIGIN}/index.html`)
    await withDeadline(tab.evaluate(openDocument), TIMEOUT_MS, `${pdf}: pdf.js did not open the document`)
    for (const s of shots) {
      await withDeadline(
        tab.evaluate(drawPage, { n: s.pdfPage, width: s.width }),
        TIMEOUT_MS,
        `${pdf} p${String(s.pdfPage)}: pdf.js did not draw`,
      )
      await tab.locator('canvas').screenshot({ path: s.out, type: 'jpeg', quality: 85 })
      done.add(s.pdfPage)
    }
  } catch (e) {
    console.error(`${pdf}: pdf.js render stopped (${e instanceof Error ? e.message : String(e)}); Poppler raster kept`)
  } finally {
    await context?.close()
  }
  return done
}

// pdf.mjs sets `pdfjsLib` on the page's global (loaded by index.html as a module).
declare global {
  var pdfjsLib: typeof PdfJs | undefined
  var reviewDoc: PDFDocumentProxy | undefined
}

// In the page: the document parsed once; cmaps and standard fonts fetched by the page, not the worker.
async function openDocument(): Promise<void> {
  const pdfjs = globalThis.pdfjsLib
  if (!pdfjs) throw new Error('pdf.js did not load')
  pdfjs.GlobalWorkerOptions.workerSrc = '/build/pdf.worker.mjs'
  const data = new Uint8Array(await (await fetch('/doc.pdf')).arrayBuffer())
  globalThis.reviewDoc = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
  }).promise
}

async function drawPage({ n, width }: { n: number; width: number }): Promise<void> {
  const doc = globalThis.reviewDoc
  if (!doc) throw new Error('no document')
  const page = await doc.getPage(n)
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  document.body.replaceChildren(canvas)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no canvas')
  await page.render({ canvasContext: context, viewport }).promise
}
