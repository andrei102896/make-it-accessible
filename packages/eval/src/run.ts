import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { imageBoxes, renderDocument, type HtmlPage } from '@make-it-accessible/pipeline/html/document'
import { type Usage } from '@make-it-accessible/pipeline/model/client'
import { SYSTEM_PROMPT } from '@make-it-accessible/pipeline/model/prompt'
import { parsePage, type PageStructure } from '@make-it-accessible/pipeline/model/schema'
import { structurePage, type StructureResult } from '@make-it-accessible/pipeline/model/structure'
import { extractPage, popplerVersion } from '@make-it-accessible/pipeline/pdf/poppler'
import { fitScale, renderCrop, renderPage } from '@make-it-accessible/pipeline/pdf/raster'
import { parseExtraction, type Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { validatePage, type Validation } from '@make-it-accessible/pipeline/validate/validate'
import { loadKey, validateKey, type KeyDoc } from './keys.ts'
import { KEYS_DIR, OUT_DIR } from './paths.ts'
import { scoreDocument } from './score/score.ts'
import type { DocScore } from './score/metrics.ts'

async function assertKeysValid(docs: readonly string[]): Promise<void> {
  for (const doc of docs) {
    const problems = await validateKey(await loadKey(doc))
    if (problems.length) throw new Error(`answer key ${doc} is invalid:\n${problems.join('\n')}`)
  }
}

// USD per million tokens, API list prices; cache writes and reads count as plain input (see STAGE0.md).
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

const MAX_UNCOVERED = 0.1

type PageResult = {
  keyPage: number
  dir: string
  pdfPage: number
  structure: PageStructure
  extraction: Extraction
  validation: Validation
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')
const pageDir = (docDir: string, keyPage: number): string => join(docDir, `p${String(keyPage).padStart(2, '0')}`)

function costUsd(model: string, usage: Usage): number {
  const price = PRICES[model]
  if (!price) throw new Error(`no price for ${model}`)
  return ((usage.input + usage.cacheWrite + usage.cacheRead) * price.input + usage.output * price.output) / 1e6
}

async function buildAndScore(key: KeyDoc, docDir: string, results: PageResult[]): Promise<DocScore> {
  const pages: HtmlPage[] = []
  for (const r of results) {
    const size = fitScale(r.extraction.width, r.extraction.height)
    const sources = new Map<string, string>()
    for (const [i, { path, box }] of imageBoxes(r.structure).entries()) {
      const file = await renderCrop(key.pdfPath, r.pdfPage, size, box, join(r.dir, `img-${i}`))
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
  const title = results.flatMap((r) => r.structure.blocks).find((b) => b.kind === 'heading' && b.level === 1)
  const titleText = title?.kind === 'heading' && 'src' in title.text ? (title.text.text ?? key.doc) : key.doc
  const html = renderDocument({ lang: results[0]?.structure.lang ?? key.lang, title: titleText, pages })
  const htmlPath = join(docDir, 'index.html')
  await writeFile(htmlPath, html)
  const score = await scoreDocument(
    htmlPath,
    key,
    results.map((r) => r.keyPage),
  )
  await writeFile(join(docDir, 'score.json'), JSON.stringify(score, null, 2))
  return score
}

function printScore(doc: string, score: DocScore): void {
  for (const p of score.pages) {
    const c3 = p.c3.missing.length + p.c3.altered.length + p.c3.invented.length
    const mark = (ok: boolean): string => (ok ? 'ok' : 'FAIL')
    console.info(
      `${doc} p${p.keyPage}${p.heldOut ? ' [held-out]' : ''}: ` +
        `C1 ${(p.c1.textOnly * 100).toFixed(0)}% ${mark(p.pass.c1)} | ` +
        `C2 ${p.c2.errorProducts}/${p.c2.products} (silent ${p.c2.silent}) ${mark(p.pass.c2)} | ` +
        `C3 ${c3} ${mark(p.pass.c3)} | C4 ${p.c4.ok}/${p.c4.total} ${mark(p.pass.c4)} | ` +
        `C5 headings ${p.c5.headingsOk}/${p.c5.headings} rows ${p.c5.rowsOk}/${p.c5.rows}`,
    )
  }
  console.info(`${doc} axe: critical ${score.axe.critical}, serious ${score.axe.serious} ${score.axe.rules.join(' ')}`)
}

async function rescore(runDir: string): Promise<void> {
  for (const doc of (await readdir(runDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    const key = await loadKey(doc)
    const docDir = join(runDir, doc)
    const results: PageResult[] = []
    for (const page of key.pages) {
      const dir = pageDir(docDir, page.keyPage)
      const structureFile = await readFile(join(dir, 'structure.json'), 'utf8').catch(() => null)
      if (structureFile === null) continue
      const structure = parsePage(structureFile)
      const extraction = parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8'))
      const validation = validatePage(structure, extraction)
      await writeFile(join(dir, 'validation.json'), JSON.stringify(validation, null, 2))
      results.push({ keyPage: page.keyPage, pdfPage: page.pdfPage, dir, structure, extraction, validation })
    }
    printScore(doc, await buildAndScore(key, docDir, results))
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pages: { type: 'string', default: 'tuning' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    effort: { type: 'string', default: 'medium' },
    only: { type: 'string' },
    rescore: { type: 'string' },
  },
})

if (values.rescore) {
  await rescore(values.rescore)
} else {
  const docs = positionals.length ? positionals : ['01_billa', '02_pollin']
  const options = { model: values.model, effort: values.effort }
  if (!PRICES[options.model]) throw new Error(`unknown model ${options.model}`)
  await assertKeysValid(docs)

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = join(OUT_DIR, runId)
  await mkdir(runDir, { recursive: true })
  await writeFile(
    join(runDir, 'run.json'),
    JSON.stringify(
      {
        runId,
        ...options,
        pages: values.pages,
        promptSha256: sha256(SYSTEM_PROMPT),
        keysSha256: Object.fromEntries(
          await Promise.all(
            docs.map(async (d): Promise<[string, string]> => [
              d,
              sha256(await readFile(join(KEYS_DIR, `${d}.json`), 'utf8')),
            ]),
          ),
        ),
        poppler: await popplerVersion(),
      },
      null,
      2,
    ),
  )

  for (const doc of docs) {
    const key = await loadKey(doc)
    const docDir = join(runDir, doc)
    const pages = key.pages.filter((p) =>
      values.only
        ? String(p.keyPage) === values.only
        : values.pages === 'all' || (values.pages === 'heldout') === Boolean(p.heldOut),
    )
    const results: PageResult[] = []
    for (const page of pages) {
      const dir = pageDir(docDir, page.keyPage)
      await mkdir(dir, { recursive: true })
      const extraction = await extractPage(key.pdfPath, page.pdfPage)
      const size = fitScale(extraction.width, extraction.height)
      const image = await renderPage(key.pdfPath, page.pdfPage, size, join(dir, 'model'))
      await writeFile(join(dir, 'extraction.json'), JSON.stringify(extraction))
      let result: StructureResult
      try {
        result = await structurePage(extraction, size, image, options, (draft) => {
          const { uncovered } = validatePage(draft, extraction)
          if (uncovered.length <= extraction.runs.length * MAX_UNCOVERED) return null
          return `${uncovered.length} of ${extraction.runs.length} inventory words are neither used nor dropped, e.g. ids ${uncovered
            .slice(0, 40)
            .map((id) => id.split(':')[1])
            .join(', ')}. Cover the whole page.`
        })
      } catch (error) {
        await writeFile(join(dir, 'failure.txt'), String(error instanceof Error ? error.stack : error))
        console.info(
          `${doc} p${page.keyPage}: FAILED ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`,
        )
        continue
      }
      const validation = validatePage(result.page, extraction)
      const usd = result.calls.reduce((sum, c) => sum + costUsd(options.model, c.usage), 0)
      const ms = result.calls.reduce((sum, c) => sum + c.ms, 0)
      await writeFile(
        join(dir, 'response.json'),
        JSON.stringify(
          result.calls.map((c) => c.raw),
          null,
          2,
        ),
      )
      await writeFile(join(dir, 'structure.json'), JSON.stringify(result.page, null, 2))
      await writeFile(join(dir, 'validation.json'), JSON.stringify(validation, null, 2))
      await writeFile(
        join(dir, 'cost.json'),
        JSON.stringify(
          { ...options, size, calls: result.calls.map((c) => ({ usage: c.usage, ms: c.ms })), usd, ms },
          null,
          2,
        ),
      )
      console.info(
        `${doc} p${page.keyPage}: errors=${validation.errors.length} review=${validation.review.length} generated=${validation.generated.length} uncovered=${validation.uncovered.length} retries=${result.calls.length - 1} $${usd.toFixed(4)} ${(ms / 1000).toFixed(1)}s`,
      )
      results.push({
        keyPage: page.keyPage,
        pdfPage: page.pdfPage,
        dir,
        structure: result.page,
        extraction,
        validation,
      })
    }
    if (results.length) printScore(doc, await buildAndScore(key, docDir, results))
  }
  console.info(`run ${runDir}`)
}
