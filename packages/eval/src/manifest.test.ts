import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pageCount } from '@make-it-accessible/pipeline/pdf/poppler'
import { loadLayoutLabels, loadSplit } from './manifest.ts'
import { DOCS_DIR } from './paths.ts'

// The split is decided before any page is keyed, so it is checked against the corpus; keys.test.ts checks keys.
test('every split document is a labelled corpus PDF', async () => {
  const pdfs = Object.keys(await loadLayoutLabels())
  for (const doc of Object.keys(await loadSplit()))
    assert.equal(pdfs.filter((pdf) => pdf.startsWith(doc.slice(0, 3))).length, 1, doc)
})

test('layout labels cover every page of every labelled PDF', async () => {
  for (const [pdf, labels] of Object.entries(await loadLayoutLabels())) {
    const path = join(DOCS_DIR, pdf)
    if (existsSync(path)) assert.equal(labels.length, await pageCount(path), pdf)
  }
})
