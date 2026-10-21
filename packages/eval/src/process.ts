import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HELD_FILE, heldOf } from './preview.ts'
import { renderDocument, type HtmlPage } from '@make-it-accessible/pipeline/html/document'
import { imageBoxes } from '@make-it-accessible/pipeline/html/source'
import { area, intersection } from '@make-it-accessible/pipeline/pdf/geometry'
import type { ModelOptions } from '@make-it-accessible/pipeline/model/client'
import type { PageStructure } from '@make-it-accessible/pipeline/model/schema'
import { structurePage, type StructureResult } from '@make-it-accessible/pipeline/model/structure'
import { structureScan } from '@make-it-accessible/pipeline/model/scan'
import { ocrRuns, readPrinted, readsAsScan } from '@make-it-accessible/pipeline/pdf/ocr'
import { fromHex } from '@make-it-accessible/pipeline/html/color'
import { pictureIn } from '@make-it-accessible/pipeline/pdf/art'
import { parseGrid } from '@make-it-accessible/pipeline/pdf/backdrop'
import { cropPicture, fillToImage, growToPicture, inkBox } from '@make-it-accessible/pipeline/pdf/crop'
import { renderPixels } from '@make-it-accessible/pipeline/pdf/poppler'
import { fitScale, renderCrop, renderPage } from '@make-it-accessible/pipeline/pdf/raster'
import type { Box, Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { reconciled } from '@make-it-accessible/pipeline/model/reconcile'
import { flaggedPaths, validatePage, type Validation } from '@make-it-accessible/pipeline/validate/validate'
import { writeBackdrops } from './backdrop.ts'
import { costUsd } from './cost.ts'
import { checkPrinted } from './printcheck.ts'
import { REPORT_FILE, reportOf } from './report.ts'
import { documentBrand } from './brand.ts'
import { documentLook } from './look.ts'
import { FONTS_DIR } from './paths.ts'
import { withIcons, type LegendEntry } from '@make-it-accessible/pipeline/pdf/icons'
import { extractWhole } from './wholewords.ts'
import { folderStore } from './readings.ts'
import { PRINT_FONTS_DIR } from '@make-it-accessible/pipeline/html/printface'

const MAX_UNCOVERED = 0.1

export type PageResult = {
  keyPage: number
  pdfPage: number
  dir: string
  structure: PageStructure
  extraction: Extraction
  validation: Validation
  usd: number
}

const IMAGE_FIT = 0.95
const IMAGE_MAX = 2
const FIGURE_SCALE = 2
// A masthead logo's centre lies within this share of its page's height from the top.
const LOGO_BAND = 0.35
const BACKGROUND_WORDS = 3

export const pageDir = (docDir: string, keyPage: number): string => join(docDir, `p${String(keyPage).padStart(2, '0')}`)

const json = (value: unknown): string => JSON.stringify(value, null, 2)

// Extracts, structures and validates one page, keeping every artefact; null when the model call fails twice.
export async function processPage(
  pdfPath: string,
  pdfPage: number,
  keyPage: number,
  docDir: string,
  options: ModelOptions,
  label: string,
  legend: readonly LegendEntry[] = [],
): Promise<PageResult | null> {
  const dir = pageDir(docDir, keyPage)
  await mkdir(dir, { recursive: true })
  let extraction = withIcons(await extractWhole(pdfPath, pdfPage), legend)
  // A page whose text the layer mostly lacks is read by OCR and by the model apart (model/scan.ts).
  const read = await readPrinted(pdfPath, pdfPage, extraction, folderStore()).catch((error: unknown) => {
    // A failed reading leaves the page as its layer reads it: a scan then stays held, never the document stopped.
    console.error(`${label}: OCR failed: ${error instanceof Error ? error.message : ''}`)
    return null
  })
  if (read && readsAsScan(extraction, read))
    extraction = { ...extraction, runs: ocrRuns(read, pdfPage), duplicates: [], hidden: [] }
  const scan = extraction.runs.some((r) => r.ocr)
  const size = fitScale(extraction.width, extraction.height)
  const image = await renderPage(pdfPath, pdfPage, size, join(dir, 'model'))
  await writeFile(join(dir, 'extraction.json'), JSON.stringify(extraction))
  let result: StructureResult
  try {
    result = scan
      ? await structureScan(extraction, size, image, options)
      : await structurePage(extraction, size, image, options, (draft) => {
          const { uncovered } = validatePage(draft, extraction)
          if (uncovered.length <= extraction.runs.length * MAX_UNCOVERED) return null
          const ids = uncovered.slice(0, 40).map((id) => id.split(':')[1])
          return `${String(uncovered.length)} of ${String(extraction.runs.length)} inventory words are neither used nor dropped, e.g. ids ${ids.join(', ')}. Cover the whole page.`
        })
  } catch (error) {
    await writeFile(join(dir, 'failure.txt'), error instanceof Error ? (error.stack ?? error.message) : String(error))
    console.info(`${label}: FAILED ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`)
    return null
  }
  // Judged and drawn as squared with the layer (reconcile.ts); the structure is saved as the model gave it.
  const structure = reconciled(result.page, extraction)
  const validation = validatePage(structure, extraction, read ?? [])
  const usd = result.calls.reduce((sum, c) => sum + costUsd(options.model, c.usage), 0)
  const ms = result.calls.reduce((sum, c) => sum + c.ms, 0)
  await writeFile(join(dir, 'response.json'), json(result.calls.map((c) => c.raw)))
  await writeFile(join(dir, 'structure.json'), json(result.page))
  await writeFile(join(dir, 'validation.json'), json(validation))
  const calls = result.calls.map((c) => ({ usage: c.usage, ms: c.ms }))
  await writeFile(join(dir, 'cost.json'), json({ ...options, size, calls, usd, ms }))
  console.info(
    `${label}: errors=${String(validation.errors.length)} review=${String(validation.review.length)} generated=${String(validation.generated.length)} uncovered=${String(validation.uncovered.length)} retries=${String(result.calls.length - 1)} $${usd.toFixed(4)} ${(ms / 1000).toFixed(1)}s`,
  )
  return { keyPage, pdfPage, dir, structure, extraction, validation, usd }
}

// Renders one accessible HTML document from processed pages, with image crops; returns its path. `printed` adds
// the printed view (menus); stage 0's scored pages stay without it, so a rescore does not change.
// `expected`: the PDF pages the document must hold; one without a result (it failed) holds the document.
export async function buildHtml(
  pdfPath: string,
  docDir: string,
  results: PageResult[],
  expected: readonly number[],
  fallbackTitle: string,
  title?: string,
  briefModel?: ModelOptions,
  printed = false,
): Promise<string> {
  const pages: HtmlPage[] = []
  // A content error holds the document from publication (Andrei, 2026-10-18: a fidelity failure falls back to the
  // text view, a content one is never shown as true); preview:add and preview:refresh refuse a held document.
  for (const r of results) {
    await writeFile(join(r.dir, 'validation.json'), json(r.validation))
    // A rerender refreshes the extraction in memory; the printed view's fidelity measure reads it from the folder.
    if (printed) await writeFile(join(r.dir, 'extraction.json'), JSON.stringify(r.extraction))
  }
  const held = heldOf(expected, results)
  await writeFile(join(docDir, HELD_FILE), json(held))
  // A scan's words are in its pixels: it has no backdrop to print over yet, so its document keeps the text view.
  if (printed)
    await writeBackdrops(
      pdfPath,
      results.filter((r) => !r.extraction.runs.some((w) => w.ocr)),
    )
  const look = await documentLook(pdfPath, docDir, results, briefModel)
  const named = logoAt(look.brief?.logo ?? null, results)
  let logo: { src: string; share: number } | null = null
  for (const r of results) {
    const size = fitScale(r.extraction.width, r.extraction.height)
    const k = size.width / r.extraction.width
    const drawn = r.extraction.pictures ?? []
    const toPts = (b: Box): Box => ({ x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k })
    const toPx = (b: Box): Box => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k })
    const boxes = imageBoxes(r.structure)
    // The brief's logo must head its page: artwork lower down is a partner's badge, not the place's (Howies' Belhaven
    // lobster beside its lobster dish, 2026-10-18).
    const heads = named !== null && named.box.y + named.box.h / 2 <= r.extraction.height * LOGO_BAND
    const mark =
      named?.pdfPage === r.pdfPage && heads
        ? pictureIn(named.box, drawn, r.extraction.width, r.extraction.height)
        : null
    // Crops are judged on the page as the model saw it, words by their painted extent in their own colour.
    const img = boxes.length || mark ? await renderPixels(pdfPath, r.pdfPage, 72 * k) : null
    const hidden = new Set(r.extraction.hidden)
    const painted = img
      ? r.extraction.runs.flatMap((run, i) => {
          const b = { x: run.box.x * k, y: run.box.y * k, w: run.box.w * k, h: run.box.h * k }
          const ink = hidden.has(run.id) ? null : inkBox(img, b, run.color ? fromHex(run.color) : null)
          return ink ? [{ i, box: ink }] : []
        })
      : []
    const pictures = boxes.map(({ box: [x = 0, y = 0, w = 0, h = 0] }) => ({ x, y, w, h }))
    const sources = new Map<string, string>()
    for (const [i, { path, own }] of boxes.entries()) {
      const mine = new Set(own)
      // Other products' pictures are foreign to this one, like their words.
      const words = [
        ...painted.map((p) => ({ box: p.box, own: mine.has(p.i) })),
        ...pictures.filter((_, j) => j !== i).map((box) => ({ box, own: false })),
      ]
      const model = pictures[i] ?? { x: 0, y: 0, w: 0, h: 0 }
      // A figure with other words printed over it is a background illustration (Noah's octopus): not a picture to
      // show; its words are the page's.
      const overprinted = painted.filter((p) => !mine.has(p.i) && intersection(p.box, model) > area(p.box) / 2)
      if (boxes[i]?.figure && overprinted.length >= BACKGROUND_WORDS) continue
      // The PDF's own image box bounds a figure when the model's box lies inside it and it is not a page-wide
      // background (Carmine's logo arc was cut; Mezzaluna's backdrop is 17x its logo).
      const placed = r.extraction.images.find((im) => im.id === boxes[i]?.ref)
      const limit = placed
        ? { x: placed.box.x * k, y: placed.box.y * k, w: placed.box.w * k, h: placed.box.h * k }
        : null
      const bounded =
        limit && intersection(model, limit) >= area(model) * IMAGE_FIT && area(limit) <= area(model) * IMAGE_MAX
      // A figure takes the exact box of the pictures it names in the vector layer (pdf/art.ts); the model's is loose.
      const exact = boxes[i]?.figure ? pictureIn(toPts(model), drawn, r.extraction.width, r.extraction.height) : null
      const start = exact ? toPx(exact) : bounded && img ? fillToImage(model, limit, words, img) : model
      const crop = cropPicture(img && !exact ? growToPicture(start, words, img) : start, words)
      // A figure (a logo, a photo on its own) is shown large: rendered at twice the model's scale.
      const scale = boxes[i]?.figure ? FIGURE_SCALE : 1
      const file = await renderCrop(
        pdfPath,
        r.pdfPage,
        { width: size.width * scale, height: size.height * scale },
        [crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale],
        join(r.dir, `img-${String(i)}`),
      )
      sources.set(path, file.slice(docDir.length + 1))
    }
    // The name printed as artwork the model gave no figure for leads the masthead, cropped at the figure scale,
    // unless a model figure already shows it (Sarge's photo).
    const shown =
      mark && !pictures.some((p) => intersection(toPts(p), mark) >= Math.min(area(toPts(p)), area(mark)) / 2)
    if (mark && shown) {
      // The whole artwork, never cut to clear a neighbour's word (Michael's oval lost its edge). ponytail: a word
      // reaching into the box shows a sliver; crop from the text-free backdrop (printed view) to drop it.
      const cut = toPx(mark)
      const file = await renderCrop(
        pdfPath,
        r.pdfPage,
        { width: size.width * FIGURE_SCALE, height: size.height * FIGURE_SCALE },
        [cut.x, cut.y, cut.w, cut.h].map((v) => v * FIGURE_SCALE),
        join(r.dir, 'img-logo'),
      )
      logo = { src: file.slice(docDir.length + 1), share: cut.w / k / r.extraction.width }
    }
    const flagged = flaggedPaths(r.validation)
    pages.push({
      keyPage: r.keyPage,
      structure: r.structure,
      extraction: r.extraction,
      flagged,
      imageSrc: (p) => sources.get(p),
      backdrop: printed ? await backdropOf(r.dir, docDir) : null,
    })
  }
  const brand = await documentBrand(pdfPath, docDir, pages, look.background, look.theme?.band?.bg ?? null)
  const htmlPath = join(docDir, 'index.html')
  const write = async (): Promise<void> => {
    const html = renderDocument({
      lang: results[0]?.structure.lang ?? 'en',
      title: title ?? look.title ?? fallbackTitle,
      pages,
      theme: look.theme,
      kind: look.brief?.type ?? null,
      headings: look.headings,
      validity: look.brief?.validity ?? null,
      brand,
      logo,
    })
    await writeFile(htmlPath, html)
    await copyPrintFonts(html, docDir)
  }
  await write()
  if (!printed) return htmlPath
  // A page whose placed text misfits, or whose print misinforms against its PDF, shows the text view (printcheck.ts).
  const check = await checkPrinted(pdfPath, htmlPath, docDir, pages, write)
  const shown = new Set(pages.flatMap((p) => (p.backdrop ? [p.keyPage] : [])))
  // Every page the document must hold, the ones that failed to convert included.
  const rows = expected.map((pdfPage) => {
    const r = results.find((x) => x.pdfPage === pdfPage)
    return {
      keyPage: r?.keyPage ?? pdfPage,
      pdfPage,
      printed: r !== undefined && shown.has(r.keyPage),
      scan: r?.extraction.runs.some((w) => w.ocr) ?? false,
      converted: r !== undefined,
    }
  })
  await writeFile(join(docDir, REPORT_FILE), json(reportOf(rows, check, held)))
  return htmlPath
}

// The vendored files the printed view's faces name (html/printface.ts), copied beside the page; a file's name starts
// with its family's key, its folder in the library.
async function copyPrintFonts(html: string, docDir: string): Promise<void> {
  const files = new Set(
    [...html.matchAll(new RegExp(`url\\(${PRINT_FONTS_DIR}/([a-z0-9]+)(-[\\w.-]+\\.woff2)\\)`, 'g'))].map(
      ([, key, rest]) => `${key ?? ''}${rest ?? ''}`,
    ),
  )
  if (files.size) await mkdir(join(docDir, PRINT_FONTS_DIR), { recursive: true })
  for (const f of files) await copyFile(join(FONTS_DIR, f.split('-')[0] ?? '', f), join(docDir, PRINT_FONTS_DIR, f))
}

// The page's backdrop when it rendered (backdrop.ts); a page without one keeps its document in the text view.
async function backdropOf(dir: string, docDir: string): Promise<NonNullable<HtmlPage['backdrop']> | null> {
  const json = await readFile(join(dir, 'backdrop.json'), 'utf8').catch(() => null)
  return json === null ? null : { src: join(dir, 'backdrop.jpg').slice(docDir.length + 1), grid: parseGrid(json) }
}

// The brief's logo (a page among those it saw, a box as fractions of it) on the page and in the points it names.
function logoAt(
  logo: { page: number; box: readonly [number, number, number, number] } | null,
  results: readonly PageResult[],
): { pdfPage: number; box: Box } | null {
  const page = [...results].sort((a, b) => a.keyPage - b.keyPage)[(logo?.page ?? 0) - 1]
  if (!logo || !page) return null
  const [x, y, w, h] = logo.box
  const { width, height } = page.extraction
  return { pdfPage: page.pdfPage, box: { x: x * width, y: y * height, w: w * width, h: h * height } }
}
