import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pageCount } from '@make-it-accessible/pipeline/pdf/poppler'
import { loadLayoutLabels, loadSplit } from './manifest.ts'
import { DOCS_DIR, KEYS_DIR } from './paths.ts'

test('every split document has a key', async () => {
  for (const doc of Object.keys(await loadSplit())) assert.ok(existsSync(join(KEYS_DIR, `${doc}.json`)), doc)
})

test('layout labels cover every page of every labelled PDF', async () => {
  for (const [pdf, labels] of Object.entries(await loadLayoutLabels())) {
    const path = join(DOCS_DIR, pdf)
    if (existsSync(path)) assert.equal(labels.length, await pageCount(path), pdf)
  }
})
