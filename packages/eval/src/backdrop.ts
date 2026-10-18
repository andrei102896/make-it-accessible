import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { placedRuns } from '@make-it-accessible/pipeline/html/source'
import {
  BACKDROP_VERSION,
  backdropSvg,
  tiltedOf,
  CELL,
  luminanceGrid,
  printedOf,
} from '@make-it-accessible/pipeline/pdf/backdrop'
import { pageSvg } from '@make-it-accessible/pipeline/pdf/poppler'
import { flaggedPaths } from '@make-it-accessible/pipeline/validate/validate'
import type { PageResult } from './process.ts'
import { keptAsPrinted, PRINT_FONTS_DIR } from '@make-it-accessible/pipeline/html/printface'
import { bodySize, faceKey } from '@make-it-accessible/pipeline/pdf/face'
import { caseFilled } from '@make-it-accessible/pipeline/pdf/ownfont'
import { turned } from '@make-it-accessible/pipeline/pdf/runs'
import { fontLibrary } from './brand.ts'
import { faceMetrics, type Cache } from './facemetrics.ts'
import { pdfFacts } from './pdfjs.ts'

// Sharp at twice the CSS pixels of the printed size (1 pt = 4/3 px), which covers a retina screen at 100 %; once
// at the CSS pixels when that runs out of time. Soft masks and filters can stall Chromium (a leaflet with 35
// filters and 63 masks: over a minute at either scale, under a second at one pixel per point).
const SCALES = [(2 * 96) / 72, 96 / 72]
const TIMEOUT_MS = 60_000
const QUALITY = 0.8

// Each page's backdrop for the printed view: pNN/backdrop.jpg, and pNN/backdrop.json with its light range per cell.
// A page that renders at no scale in time gets none, and its document keeps the text view only.
export async function writeBackdrops(pdf: string, results: readonly PageResult[]): Promise<void> {
  const facts = await pdfFacts(pdf)
  const library = await fontLibrary()
  const browser = await chromium.launch()
  const faces: Cache = new Map()
  try {
    for (const r of results) {
      const { width, height } = r.extraction
      const page = await pageSvg(pdf, r.pdfPage)
      const { tracking, own, printed } = await facts.of(r.extraction)
      const { metrics, capsFaces } = await faceMetrics(browser, printed, library, faces)
      // An own face drawing capitals for lowercase answers to both cases of each letter.
      const capsIds = new Set<string>()
      for (const w of r.extraction.runs) {
        const id = own.faces[w.id]
        if (id !== undefined && w.font && capsFaces.includes(faceKey(w.font))) capsIds.add(id)
      }
      for (const id of capsIds) {
        const data = own.files.get(id)
        const filled = data && caseFilled(data)
        const font = own.fonts[id]
        if (!filled || !font) continue
        own.files.set(id, filled.data)
        own.fonts[id] = { ...font, range: filled.range }
      }
      // Words left as printed: set at an angle, in a hand we cannot draw, or a heading in a face we cannot match
      // (pdf/backdrop.ts, html/printface.ts).
      const tilted = tiltedOf(page, r.extraction.runs)
      const body = bodySize(r.extraction.runs)
      const kept = new Set(
        r.extraction.runs
          .filter((w) => tilted.has(w.id) || (w.font && keptAsPrinted(w.font, w.id in own.faces, library, body)))
          .map((w) => w.id),
      )
      // An icon's words (pdf/icons.ts) have no glyphs to take out: the drawing stays in the backdrop.
      const words = placedRuns(
        r.structure,
        r.extraction,
        flaggedPaths(r.validation),
        (w) => turned(w) || kept.has(w.id),
      ).filter((w) => !w.icon)
      const placed = new Set(words.map((w) => w.id))
      const svg = backdropSvg(
        page,
        words.map((w) => w.box),
        r.extraction.runs.filter((w) => !placed.has(w.id)).map((w) => w.box),
      )
      let drawn: Drawn | null = null
      for (const scale of SCALES) {
        drawn = await rasterise(browser, svg, width, height, scale)
        if (drawn) break
      }
      if (!drawn) {
        console.error(`${r.dir}: the backdrop did not render in ${String(TIMEOUT_MS / 1000)} s; text view only`)
        // A backdrop left from an earlier build would stand behind words placed for this one.
        await rm(join(r.dir, 'backdrop.json'), { force: true })
        await rm(join(r.dir, 'backdrop.jpg'), { force: true })
        continue
      }
      const data = Buffer.from(drawn.rgba, 'base64')
      const cols = Math.round(width)
      const grid = luminanceGrid({
        width: cols,
        height: Math.round(height),
        at: (x, y) => {
          const i = 4 * (y * cols + x)
          return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
        },
      })
      await writeFile(join(r.dir, 'backdrop.jpg'), Buffer.from(drawn.jpeg.slice(drawn.jpeg.indexOf(',') + 1), 'base64'))
      // The document's folder holds the faces, one file per program, whichever page uses it.
      const fonts = join(dirname(r.dir), PRINT_FONTS_DIR)
      if (own.files.size) await mkdir(fonts, { recursive: true })
      for (const [id, data] of own.files) await writeFile(join(fonts, `${id}.otf`), data)
      await writeFile(
        join(r.dir, 'backdrop.json'),
        JSON.stringify({
          version: BACKDROP_VERSION,
          cell: CELL,
          ...grid,
          ...printedOf(page, words),
          kept: [...kept],
          tracking,
          faces: own.faces,
          fonts: own.fonts,
          metrics,
          capsFaces,
        }),
      )
    }
  } finally {
    await facts.close()
    await browser.close()
  }
}

type Drawn = { jpeg: string; rgba: string }

// The SVG drawn on white at `scale` as a JPEG data URL, and at one pixel per point as RGBA (base64); null when it
// takes longer than TIMEOUT_MS (its tab is closed, which stops the renderer).
async function rasterise(
  browser: Browser,
  svg: string,
  width: number,
  height: number,
  scale: number,
): Promise<Drawn | null> {
  const tab = await browser.newPage()
  let timer: NodeJS.Timeout | undefined
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        resolve(null)
      }, TIMEOUT_MS)
    })
    const drawn = tab.evaluate(
      async ({ svg, width, height, scale, quality }) => {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        const img = new Image()
        img.src = url
        await img.decode()
        const draw = (k: number): CanvasRenderingContext2D => {
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(width * k)
          canvas.height = Math.round(height * k)
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('no canvas')
          // Paper: the SVG leaves it transparent.
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          return ctx
        }
        const jpeg = draw(scale).canvas.toDataURL('image/jpeg', quality)
        const small = draw(1)
        const bytes = small.getImageData(0, 0, small.canvas.width, small.canvas.height).data
        URL.revokeObjectURL(url)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return { jpeg, rgba: btoa(binary) }
      },
      { svg, width, height, scale, quality: QUALITY },
    )
    return await Promise.race([drawn, late])
  } finally {
    clearTimeout(timer)
    await tab.close()
  }
}
