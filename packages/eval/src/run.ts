import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { SYSTEM_PROMPT } from '@make-it-accessible/pipeline/model/prompt'
import { popplerVersion } from '@make-it-accessible/pipeline/pdf/poppler'
import { keyPath, loadKey, validateKey, type KeySection } from './keys.ts'
import { loadSplit, type KeySet } from './manifest.ts'
import { OUT_DIR, ROOT } from './paths.ts'
import { PRICES, processPage, type PageResult } from './process.ts'
import { rescore } from './rescore.ts'
import { buildAndScore, printScore } from './scoring.ts'

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

async function assertKeysValid(docs: readonly string[], split: Record<string, KeySet>): Promise<void> {
  for (const doc of docs) {
    const problems = await validateKey(await loadKey(doc), split[doc])
    // A sealed key's problems would show its content; the count is enough to stop the run.
    const shown = split[doc] === 'test' ? `${String(problems.length)} problems` : problems.join('\n')
    if (problems.length) throw new Error(`answer key ${doc} is invalid:\n${shown}`)
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
    'sealed-test': { type: 'boolean', default: false },
  },
})

if (values.rescore) {
  console.info(`rescored copy ${await rescore(values.rescore)}`)
} else {
  const set = z.enum(['tuning', 'dev', 'test', 'all']).parse(values.pages)
  const split = await loadSplit()
  const inSet = Object.keys(split).filter((d) => set === 'all' || split[d] === set)
  const docs = positionals.length ? positionals.filter((d) => inSet.includes(d)) : inSet
  // The sealed half is opened once, at the end (docs/HARDENING.md phase C); this flag makes that deliberate.
  if (docs.some((d) => split[d] === 'test') && !values['sealed-test'])
    throw new Error('these pages include the sealed test half; add --sealed-test')
  if (!docs.length) throw new Error(`no ${set} documents among ${positionals.join(', ') || 'the split'}`)
  const options = { model: values.model, effort: values.effort }
  if (!PRICES[options.model]) throw new Error(`unknown model ${options.model}`)
  await assertKeysValid(docs, split)

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = join(OUT_DIR, runId)
  await mkdir(runDir, { recursive: true })
  const keysSha256 = Object.fromEntries(
    await Promise.all(
      docs.map(async (d): Promise<[string, string]> => [d, sha256(await readFile(keyPath(d), 'utf8'))]),
    ),
  )
  const layouts: Record<string, { sections: KeySection[] | null; detected: null }> = {}
  for (const d of docs) layouts[d] = { sections: (await loadKey(d)).sections ?? null, detected: null }
  const splitSha256 = sha256(await readFile(join(ROOT, 'validation', 'split.json'), 'utf8'))
  const meta = { runId, ...options, set, promptSha256: sha256(SYSTEM_PROMPT), keysSha256, splitSha256, layouts }
  await writeFile(join(runDir, 'run.json'), JSON.stringify({ ...meta, poppler: await popplerVersion() }, null, 2))

  for (const doc of docs) {
    const key = await loadKey(doc)
    const docDir = join(runDir, doc)
    const pages = key.pages.filter((p) => !values.only || String(p.keyPage) === values.only)
    const results: PageResult[] = []
    for (const page of pages) {
      const label = `${doc} p${String(page.keyPage)}`
      const result = await processPage(key.pdfPath, page.pdfPage, page.keyPage, docDir, options, label)
      if (result) results.push(result)
    }
    if (results.length) printScore(doc, await buildAndScore(key, docDir, results), split[doc])
  }
  console.info(`run ${runDir}`)
}
