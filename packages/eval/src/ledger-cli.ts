import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { ledgerSha256 } from './key-v3.ts'
import { fileSha256, wordsDir } from './keys.ts'
import { ledger } from './ledger.ts'
import { loadSplit } from './manifest.ts'
import { DOCS_DIR } from './paths.ts'
import { snapshotWords } from './snapshot.ts'

// What a key writer starts from: the hashes that fix the evidence, the page's money occurrences and its words, as JSON.
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
// Everything that fixes the evidence's identity, copied into the key as printed: pdfSha256 on the document, the rest per page.
const hashes = {
  pdfSha256: await fileSha256(pdf),
  wordsSha256: sha256,
  ledgerSha256: ledgerSha256(occurrences),
}
console.info(
  JSON.stringify(
    sealed && !values.details
      ? { ...hashes, occurrences: occurrences.length }
      : // Writers cite snapshot words by index (manual amounts, offers), with the line and box that place them.
        { ...hashes, occurrences, words: words.map((w, i) => ({ i, ...w })) },
    null,
    2,
  ),
)
