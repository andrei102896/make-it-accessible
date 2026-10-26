import { cp, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { reconciled } from '@make-it-accessible/pipeline/model/reconcile'
import { parsePage } from '@make-it-accessible/pipeline/model/schema'
import { parseExtraction } from '@make-it-accessible/pipeline/pdf/types'
import { validatePage } from '@make-it-accessible/pipeline/validate/validate'
import { loadKey } from './keys.ts'
import { loadSplit } from './manifest.ts'
import { pageDir, type PageResult } from './process.ts'
import { buildAndScore, printScore } from './scoring.ts'

// Rescoring rewrites validation, HTML and scores, so it works on a copy and the original run stays evidence.
export async function rescore(run: string): Promise<string> {
  const runDir = `${resolve(run)}-rescore-${new Date().toISOString().replace(/[:.]/g, '-')}`
  await cp(resolve(run), runDir, { recursive: true })
  await writeFile(
    join(runDir, 'rescore.json'),
    JSON.stringify({ source: resolve(run), at: new Date().toISOString() }, null, 2),
  )
  const split = await loadSplit()
  const docs = (await readdir(runDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  for (const doc of docs) {
    const key = await loadKey(doc)
    const docDir = join(runDir, doc)
    const results: PageResult[] = []
    for (const page of key.pages) {
      const dir = pageDir(docDir, page.keyPage)
      const structureFile = await readFile(join(dir, 'structure.json'), 'utf8').catch(() => null)
      if (structureFile === null) continue
      const extraction = parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8'))
      const structure = reconciled(parsePage(structureFile), extraction)
      const validation = validatePage(structure, extraction)
      await writeFile(join(dir, 'validation.json'), JSON.stringify(validation, null, 2))
      results.push({ keyPage: page.keyPage, pdfPage: page.pdfPage, dir, structure, extraction, validation, usd: 0 })
    }
    printScore(doc, await buildAndScore(key, docDir, results), split[doc])
  }
  return runDir
}
