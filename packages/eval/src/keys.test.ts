import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadKey, validateKey } from './keys.ts'
import { DOCS_DIR } from './paths.ts'

const local = existsSync(join(DOCS_DIR, '01_billa_plus_kw41_wien.pdf'))

for (const doc of ['01_billa', '02_pollin']) {
  test(`answer key ${doc} matches the PDF text layer`, { skip: !local && 'test PDFs are local-only' }, async () => {
    assert.deepEqual(await validateKey(await loadKey(doc)), [])
  })
}
