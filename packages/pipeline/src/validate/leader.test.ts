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

test('a condition printed before its price and read after it is held; one printed after it is not (Bernie\'s "7 for")', () => {
  const offer = (unit: [number, number], price: [number, number]) =>
    parsePage(
      JSON.stringify({
        lang: 'en',
        blocks: [
          { kind: 'products', items: [{ name: { src: [[0, 0]] }, prices: [{ src: [price] }], unit: { src: [unit] } }] },
        ],
        dropped: [],
      }),
    )
  const before = validatePage(offer([1, 2], [3, 3]), page(['Clams', '7', 'for', '$19.95']))
  assert.deepEqual(
    before.review.map((f) => [f.path, f.problem]),
    [['blocks[0].items[0].unit', '"7 for" is printed before its price, read after it']],
  )
  assert.deepEqual(validatePage(offer([2, 2], [1, 1]), page(['Lager', '$6', '/pint'])).review, [])
  // A size reads the same either side of its price (Howies' "(3 x 25ml serves) 28.95").
  assert.deepEqual(
    validatePage(offer([1, 4], [5, 5]), page(['Flight', '(3', 'x', '25ml', 'serves)', '28.95'])).review,
    [],
  )
})
