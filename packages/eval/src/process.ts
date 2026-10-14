import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { imageBoxes, renderDocument, type HtmlPage } from '@make-it-accessible/pipeline/html/document'
import type { ModelOptions, Usage } from '@make-it-accessible/pipeline/model/client'
import type { PageStructure } from '@make-it-accessible/pipeline/model/schema'
import { structurePage, type StructureResult } from '@make-it-accessible/pipeline/model/structure'
import { extractPage } from '@make-it-accessible/pipeline/pdf/poppler'
import { fitScale, renderCrop, renderPage } from '@make-it-accessible/pipeline/pdf/raster'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { validatePage, type Validation } from '@make-it-accessible/pipeline/validate/validate'

// USD per million tokens, API list prices; cache writes and reads count as plain input (see docs/STAGE0.md).
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}
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

export const pageDir = (docDir: string, keyPage: number): string => join(docDir, `p${String(keyPage).padStart(2, '0')}`)

function costUsd(model: string, usage: Usage): number {
  const price = PRICES[model]
  if (!price) throw new Error(`no price for ${model}`)
  return ((usage.input + usage.cacheWrite + usage.cacheRead) * price.input + usage.output * price.output) / 1e6
}

const json = (value: unknown): string => JSON.stringify(value, null, 2)

// Extracts, structures and validates one page, keeping every artefact; null when the model call fails twice.
export async function processPage(
  pdfPath: string,
  pdfPage: number,
  keyPage: number,
  docDir: string,
  options: ModelOptions,
  label: string,
): Promise<PageResult | null> {
  const dir = pageDir(docDir, keyPage)
  await mkdir(dir, { recursive: true })
  const extraction = await extractPage(pdfPath, pdfPage)
  const size = fitScale(extraction.width, extraction.height)
  const image = await renderPage(pdfPath, pdfPage, size, join(dir, 'model'))
  await writeFile(join(dir, 'extraction.json'), JSON.stringify(extraction))
  let result: StructureResult
  try {
    result = await structurePage(extraction, size, image, options, (draft) => {
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
  const validation = validatePage(result.page, extraction)
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
  return { keyPage, pdfPage, dir, structure: result.page, extraction, validation, usd }
}

// Renders one accessible HTML document from processed pages, with image crops; returns its path.
export async function buildHtml(
  pdfPath: string,
  docDir: string,
  results: PageResult[],
  fallbackTitle: string,
  title?: string,
): Promise<string> {
  const pages: HtmlPage[] = []
  for (const r of results) {
    const size = fitScale(r.extraction.width, r.extraction.height)
    const sources = new Map<string, string>()
    for (const [i, { path, box }] of imageBoxes(r.structure).entries()) {
      const file = await renderCrop(pdfPath, r.pdfPage, size, box, join(r.dir, `img-${String(i)}`))
      sources.set(path, file.slice(docDir.length + 1))
    }
    const flagged = [...r.validation.errors, ...r.validation.review].map((f) => f.path)
    pages.push({
      keyPage: r.keyPage,
      structure: r.structure,
      extraction: r.extraction,
      flagged,
      imageSrc: (p) => sources.get(p),
    })
  }
  const heading = results.flatMap((r) => r.structure.blocks).find((b) => b.kind === 'heading' && b.level === 1)
  const titleText =
    title ??
    (heading?.kind === 'heading' && 'src' in heading.text ? (heading.text.text ?? fallbackTitle) : fallbackTitle)
  const htmlPath = join(docDir, 'index.html')
  await writeFile(htmlPath, renderDocument({ lang: results[0]?.structure.lang ?? 'en', title: titleText, pages }))
  return htmlPath
}
