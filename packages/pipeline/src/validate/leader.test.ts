import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

// Bernie's: pdftotext fuses the dot leader into the name's last word ("Dip . . . . .").
const page = (words: string[]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map((str, i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x: 80 + i * 40, y: 100, w: 30, h: 10 },
    flow: 0,
    line: 0,
  })),
  images: [],
  duplicates: [],
  hidden: [],
})
const named = (text: string) =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [{ kind: 'products', items: [{ name: { src: [[0, 2]], text }, prices: [{ src: [[3, 4]] }] }] }],
      dropped: [],
    }),
  )
const mismatch = (e: Extraction, text: string): string[] =>
  validatePage(named(text), e)
    .errors.filter((f) => f.problem.includes('does not match'))
    .map((f) => f.problem)

test('a leader fused into the last word of a name is no letters; a description\'s own "..." is', () => {
  assert.deepEqual(mismatch(page(['Chips', '&', 'Dip . . . . . . . . . .', '$', '13']), 'Chips & Dip'), [])
  assert.deepEqual(mismatch(page(['Chips', '&', 'Dip..........', '$', '13']), 'Chips & Dip'), [])
  assert.equal(mismatch(page(['and', 'much', 'more...', '$', '13']), 'and much more').length, 1)
})
