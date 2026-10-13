import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { wordsDir } from './keys.ts'
import { ledger } from './ledger.ts'
import { loadSplit } from './manifest.ts'
import { DOCS_DIR } from './paths.ts'
import { snapshotWords } from './snapshot.ts'

// What a key writer starts from: the frozen snapshot's SHA-256 and the page's money occurrences, as JSON.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { pdf: { type: 'string' }, details: { type: 'boolean', default: false } },
})
const [doc, page] = positionals
if (!doc || !page) throw new Error('usage: pnpm ledger <doc> <pdfPage> [--pdf <file.pdf>] [--details]')
const pdf = values.pdf
  ? resolve(values.pdf)
  : join(DOCS_DIR, (await readdir(DOCS_DIR)).find((f) => f.startsWith(doc.slice(0, 3)) && f.endsWith('.pdf')) ?? '')
const { words, sha256 } = await snapshotWords(pdf, Number(page), { dir: await wordsDir(doc), doc })
const occurrences = ledger(words)
const sealed = (await loadSplit())[doc] === 'test'
console.info(
  JSON.stringify(
    sealed && !values.details
      ? { wordsSha256: sha256, occurrences: occurrences.length }
      : { wordsSha256: sha256, occurrences },
    null,
    2,
  ),
)
