import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { keyPath, loadKey, validateKey, visibleProblems } from './keys.ts'
import { loadSplit } from './manifest.ts'
import { DOCS_DIR, WORDS_DIR } from './paths.ts'
import { snapshotDrift } from './snapshot.ts'

const local = existsSync(join(DOCS_DIR, '01_billa_plus_kw41_wien.pdf'))
const split = await loadSplit()

for (const [doc, set] of Object.entries(split)) {
  const missing = !local ? 'test PDFs are local-only' : !existsSync(keyPath(doc)) && 'no key written yet'
  test(`answer key ${doc} (${set}) matches the PDF text layer`, { skip: missing }, async () => {
    const problems = await validateKey(await loadKey(doc), set)
    // A sealed key's problems would show its content to whoever runs the tests.
    if (set === 'test') assert.equal(problems.length, 0, `${String(problems.length)} problems in a sealed key`)
    else assert.deepEqual(problems, [])
  })
}

test('a sealed key prints only its problem count unless details are asked for', () => {
  assert.deepEqual(visibleProblems(['p1: price "£9" wrong'], true, false), ['1 problems'])
  assert.deepEqual(visibleProblems(['p1: price "£9" wrong'], true, true), ['p1: price "£9" wrong', '1 problems'])
  assert.deepEqual(visibleProblems([], false, false), ['key valid'])
})

test('the word snapshot of a keyed page matches what Poppler reads now', { skip: !local && 'local only' }, async () => {
  assert.equal(
    await snapshotDrift(join(DOCS_DIR, '04_stonehouse_hotel_christmas_brochure_2026.pdf'), 4, {
      dir: WORDS_DIR,
      doc: '04_stonehouse',
    }),
    false,
  )
})
