import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { SYSTEM_PROMPT } from '@make-it-accessible/pipeline/model/prompt'
import { parsePage } from '@make-it-accessible/pipeline/model/schema'
import { popplerVersion } from '@make-it-accessible/pipeline/pdf/poppler'
import { parseExtraction } from '@make-it-accessible/pipeline/pdf/types'
import { validatePage } from '@make-it-accessible/pipeline/validate/validate'
import { loadKey, validateKey, type KeyDoc } from './keys.ts'
import { KEYS_DIR, OUT_DIR } from './paths.ts'
import { buildHtml, pageDir, PRICES, processPage, type PageResult } from './process.ts'
import type { DocScore } from './score/metrics.ts'
import { scoreDocument } from './score/score.ts'

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

async function assertKeysValid(docs: readonly string[]): Promise<void> {
  for (const doc of docs) {
    const problems = await validateKey(await loadKey(doc))
    if (problems.length) throw new Error(`answer key ${doc} is invalid:\n${problems.join('\n')}`)
  }
}

async function buildAndScore(key: KeyDoc, docDir: string, results: PageResult[]): Promise<DocScore> {
  const htmlPath = await buildHtml(key.pdfPath, docDir, results, key.doc)
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
      `${doc} p${String(p.keyPage)}${p.heldOut ? ' [held-out]' : ''}: ` +
        `C1 ${(p.c1.textOnly * 100).toFixed(0)}% ${mark(p.pass.c1)} | ` +
        `C2 ${String(p.c2.errorProducts)}/${String(p.c2.products)} (silent ${String(p.c2.silent)}) ${mark(p.pass.c2)} | ` +
        `C3 ${String(c3)} ${mark(p.pass.c3)} | C4 ${String(p.c4.ok)}/${String(p.c4.total)} ${mark(p.pass.c4)} | ` +
        `C5 headings ${String(p.c5.headingsOk)}/${String(p.c5.headings)} rows ${String(p.c5.rowsOk)}/${String(p.c5.rows)}`,
    )
  }
  console.info(
    `${doc} axe: critical ${String(score.axe.critical)}, serious ${String(score.axe.serious)} ${score.axe.rules.join(' ')}`,
  )
}

async function rescore(runDir: string): Promise<void> {
  const docs = (await readdir(runDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  for (const doc of docs) {
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
      results.push({ keyPage: page.keyPage, pdfPage: page.pdfPage, dir, structure, extraction, validation, usd: 0 })
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
  const keysSha256 = Object.fromEntries(
    await Promise.all(
      docs.map(async (d): Promise<[string, string]> => [
        d,
        sha256(await readFile(join(KEYS_DIR, `${d}.json`), 'utf8')),
      ]),
    ),
  )
  const meta = { runId, ...options, pages: values.pages, promptSha256: sha256(SYSTEM_PROMPT), keysSha256 }
  await writeFile(join(runDir, 'run.json'), JSON.stringify({ ...meta, poppler: await popplerVersion() }, null, 2))

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
      const label = `${doc} p${String(page.keyPage)}`
      const result = await processPage(key.pdfPath, page.pdfPage, page.keyPage, docDir, options, label)
      if (result) results.push(result)
    }
    if (results.length) printScore(doc, await buildAndScore(key, docDir, results))
  }
  console.info(`run ${runDir}`)
}
