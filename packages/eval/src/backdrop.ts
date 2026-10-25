import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { placedRuns } from '@make-it-accessible/pipeline/html/source'
import { backdropScale, printWidth } from '@make-it-accessible/pipeline/html/print'
import {
  BACKDROP_VERSION,
  tiltedOf,
  CELL,
  luminanceGrid,
  printedOf,
  type Grid,
} from '@make-it-accessible/pipeline/pdf/backdrop'
import { MAX_BUFFER, pageSvg, popplerBytes } from '@make-it-accessible/pipeline/pdf/poppler'
import { flaggedPaths } from '@make-it-accessible/pipeline/validate/validate'
import type { PageResult } from './process.ts'
import { turned } from '@make-it-accessible/pipeline/pdf/runs'
import { capsFacesOf, type Cache } from './facemetrics.ts'
import { pdfFacts, SAME_FRAME } from './pdfjs.ts'
import { CAPTURE_PX, openPdf, type PdfTab } from './pdfshot.ts'
import { degraded } from '@make-it-accessible/pipeline/degraded'
import { hex, paper, type Rgb } from '@make-it-accessible/pipeline/html/color'
import { pageGround, pagePixels } from '@make-it-accessible/pipeline/html/theme'
import { fillsOf } from '@make-it-accessible/pipeline/html/seen'
import { visible } from './look.ts'

// WebP at this quality draws Ferrara's 8 pt red italic as the lossless render does, at a seventh of its size.
const QUALITY = 0.85
// Encoding a page in the browser; past it pdf.js' page goes to Poppler, and Poppler's to the text view.
const TIMEOUT_MS = 60_000
// The two files a page's <img srcset> offers: the retina one and half of it (html/page.ts).
export const BACKDROP_FILES = { x1: 'backdrop-1x.webp', x2: 'backdrop-2x.webp' } as const

// A backdrop left from an earlier build would stand behind words placed for this one (scans' pages too).
export async function clearBackdrop(dir: string): Promise<void> {
  for (const f of ['backdrop.json', 'backdrop.jpg', ...Object.values(BACKDROP_FILES)])
    await rm(join(dir, f), { force: true })
}

// Each page's backdrop: the page as pdf.js draws it, its words included, and pNN/backdrop.json with its light range per
// cell (DESIGN, The printed view: Poppler only where pdf.js cannot); a page neither draws gets none, and keeps the text view.
export async function writeBackdrops(pdf: string, results: readonly PageResult[]): Promise<void> {
  const facts = await pdfFacts(pdf)
  const browser = await chromium.launch()
  const faces: Cache = new Map()
  const width = printWidth(results.map((r) => ({ extraction: r.extraction, backdrop: true })))
  // pdf.js' tab: undefined until opened, null when the document would not open (Poppler draws every page then).
  let pdfjs: PdfTab | null | undefined
  const why = (error: unknown): string => (error instanceof Error ? error.message : String(error))
  try {
    for (const r of results) {
      const e = r.extraction
      if (width === null) continue
      const page = await pageSvg(pdf, r.pdfPage)
      const { printed } = await facts.of(e)
      const capsFaces = await capsFacesOf(browser, printed, faces)
      // Words set at an angle stay unplaced: a level box over them would select across the print (pdf/backdrop.ts).
      const tilted = tiltedOf(page, e.runs)
      const words = placedRuns(r.structure, e, flaggedPaths(r.validation), (w) => turned(w) || tilted.has(w.id)).filter(
        (w) => !w.icon,
      )
      const px = Math.round(backdropScale(width, e) * e.width)
      let drawn: Encoded | null = null
      if (pdfjs === undefined)
        pdfjs = await openPdf(browser, pdf, CAPTURE_PX).catch((error: unknown) => {
          degraded(`${pdf}: pdf.js did not open it (${why(error)}); Poppler draws every backdrop`)
          return null
        })
      if (pdfjs)
        try {
          const size = await pdfjs.draw(r.pdfPage, px)
          // pdf.js draws the crop box; our words and frame are the media box's: where they differ, Poppler draws.
          if (Math.abs(size.width - e.width) > SAME_FRAME || Math.abs(size.height - e.height) > SAME_FRAME)
            throw new Error(
              `its frame is ${size.width.toFixed(1)} x ${size.height.toFixed(1)} pt, ours ${String(e.width)} x ${String(e.height)}`,
            )
          drawn = await encoded(pdfjs.tab, null, e)
          if (!drawn) throw new Error(`not encoded in ${String(TIMEOUT_MS / 1000)} s`)
        } catch (error) {
          degraded(`${r.dir}: pdf.js did not draw the backdrop (${why(error)}); Poppler draws it`)
          await pdfjs.close()
          pdfjs = undefined
        }
      drawn ??= await poppler(browser, pdf, r.pdfPage, px / e.width, e).catch((error: unknown) => {
        degraded(`${r.dir}: Poppler did not draw the backdrop (${why(error)})`)
        return null
      })
      if (!drawn) {
        degraded(`${r.dir}: no backdrop; text view only`)
        continue
      }
      await writeFile(join(r.dir, BACKDROP_FILES.x2), drawn.x2)
      await writeFile(join(r.dir, BACKDROP_FILES.x1), drawn.x1)
      const cols = Math.round(e.width)
      const grid = luminanceGrid({
        width: cols,
        height: Math.round(e.height),
        at: (x, y) => {
          const i = 4 * (y * cols + x)
          return [drawn.rgba[i] ?? 0, drawn.rgba[i + 1] ?? 0, drawn.rgba[i + 2] ?? 0]
        },
      })
      await writeFile(
        join(r.dir, 'backdrop.json'),
        JSON.stringify({
          version: BACKDROP_VERSION,
          cell: CELL,
          ...grid,
          ...printedOf(page, words),
          kept: [...tilted],
          capsFaces,
          ...(await seenOf(pdf, r)),
        }),
      )
    }
  } finally {
    await pdfjs?.close()
    await facts.close()
    await browser.close()
  }
}

// A page's own ground: the colour behind at least PAGE_GROUND of the ring round its words, measured as the document's
// background is (theme.ts, Poppler). Shares cluster at .45–.55 and the next is .76: the bar sits in that gap. Its fills
// as printed from the same render (html/seen.ts); none measured when Poppler fails.
const PAGE_GROUND = 2 / 3
async function seenOf(pdf: string, r: PageResult): Promise<Pick<Grid, 'ground' | 'fills'>> {
  const vectors = r.extraction.vectors ?? []
  try {
    const { img, boxes } = await pagePixels(pdf, r.pdfPage, visible(r))
    return {
      ground: boxes.length ? groundHex(pageGround(img, boxes)) : null,
      fills: { vectors: vectors.length, looks: fillsOf(img, vectors, boxes) },
    }
  } catch (error) {
    degraded(`${r.dir}: no ground or fills measured (${error instanceof Error ? error.message : String(error)})`)
    return { ground: null, fills: null }
  }
}
export const groundHex = (g: { c: Rgb; share: number } | null): string | null =>
  g && g.share >= PAGE_GROUND && !paper(g.c) ? hex(g.c) : null

// The two WebP files, and the page at one pixel per point as RGBA (its light per cell, pdf/backdrop.ts).
type Encoded = { x1: Buffer; x2: Buffer; rgba: Buffer }
type Size = { width: number; height: number }

// The page drawn by Poppler at `scale` px/pt, encoded in a tab of its own.
async function poppler(
  browser: Browser,
  pdf: string,
  pdfPage: number,
  scale: number,
  size: Size,
): Promise<Encoded | null> {
  const page = String(pdfPage)
  const { stdout } = await popplerBytes(
    'pdftoppm',
    ['-q', '-png', '-f', page, '-l', page, '-r', (scale * 72).toFixed(2), pdf],
    { maxBuffer: MAX_BUFFER },
  )
  const tab = await browser.newPage()
  try {
    return await encoded(tab, stdout.toString('base64'), size)
  } finally {
    await tab.close()
  }
}

// The tab's canvas (pdf.js'), or a PNG given as base64, encoded; null past TIMEOUT_MS.
async function encoded(tab: Page, png: string | null, size: Size): Promise<Encoded | null> {
  let timer: NodeJS.Timeout | undefined
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        resolve(null)
      }, TIMEOUT_MS)
    })
    const done = tab.evaluate(
      async ({ png, quality, cols, rows }) => {
        let source: HTMLCanvasElement | HTMLImageElement | null = document.querySelector('canvas')
        if (png !== null) {
          const img = new Image()
          img.src = `data:image/png;base64,${png}`
          await img.decode()
          source = img
        }
        if (!source) throw new Error('nothing drawn')
        const from = source
        const [w, h] =
          from instanceof HTMLImageElement ? [from.naturalWidth, from.naturalHeight] : [from.width, from.height]
        const draw = (cw: number, ch: number): CanvasRenderingContext2D => {
          const canvas = document.createElement('canvas')
          canvas.width = cw
          canvas.height = ch
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error(`no canvas of ${String(cw)} x ${String(ch)} px`)
          // Paper: a page drawn with transparency shows white, as in a PDF viewer.
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, cw, ch)
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(from, 0, 0, cw, ch)
          return ctx
        }
        const webp = (k: number): string => {
          const url = draw(Math.round(w * k), Math.round(h * k)).canvas.toDataURL('image/webp', quality)
          // Past WebP's 16383 px a side the canvas gives PNG: no backdrop rather than a heavy one.
          if (!url.startsWith('data:image/webp')) throw new Error(`no WebP of ${String(w)} x ${String(h)} px`)
          return url.slice(url.indexOf(',') + 1)
        }
        const bytes = draw(cols, rows).getImageData(0, 0, cols, rows).data
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return { x2: webp(1), x1: webp(0.5), rgba: btoa(binary) }
      },
      { png, quality: QUALITY, cols: Math.round(size.width), rows: Math.round(size.height) },
    )
    const out = await Promise.race([done, late])
    return (
      out && {
        x1: Buffer.from(out.x1, 'base64'),
        x2: Buffer.from(out.x2, 'base64'),
        rgba: Buffer.from(out.rgba, 'base64'),
      }
    )
  } finally {
    clearTimeout(timer)
  }
}
