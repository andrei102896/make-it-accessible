import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

// Words on one line, 10 pt high, each at the x given; the page is 600 x 800.
const page = (words: [string, number, number?][]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, h = 10], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y: 100, w: str.length * 5, h },
    flow: 0,
    line: 0,
  })),
  images: [],
  duplicates: [],
  hidden: [],
})
const menu = (items: { name: number; prices: number[][] }[]): ReturnType<typeof parsePage> =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: items.map((it) => ({
            name: { src: [[it.name, it.name]] },
            prices: it.prices.map((src) => ({ src: [src] })),
          })),
        },
      ],
      dropped: [],
    }),
  )

test('on a page with raised cents bare digits of a hundred or more go to review; a whole price under 100 shows as printed', () => {
  // "2" with small "69" beside it is a euro/cent pair: the page prints fused cents.
  const e = page([
    ['Milch', 0],
    ['2', 100, 30],
    ['69', 110, 18],
    ['Brot', 0],
    ['399', 100, 30],
  ])
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 2]] },
      { name: 3, prices: [[4, 4]] },
    ]),
    e,
  )
  assert.deepEqual(v.errors, [])
  assert.deepEqual(
    v.review.map((f) => f.problem),
    ['price read from bare digits "399"'],
  )
  const withEuro = page([
    ['Milch', 0],
    ['2', 100, 30],
    ['69', 110, 18],
    ['€', 0],
    ['Brot', 0],
    ['€', 50],
    ['399', 100, 30],
  ])
  const w = validatePage(
    menu([
      { name: 0, prices: [[1, 2]] },
      { name: 4, prices: [[6, 6]] },
    ]),
    withEuro,
  )
  assert.deepEqual(w.errors, [])
  assert.equal(w.review.filter((f) => f.problem.startsWith('price read from bare digits')).length, 1)
})

test("a US menu with a few raised cents shows its whole prices as printed (Millie's 17 beside 13⁵⁰)", () => {
  const e = page([
    ['Burger', 0],
    ['13', 100, 30],
    ['50', 110, 18],
    ['Salad', 0],
    ['17', 100, 30],
  ])
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 2]] },
      { name: 3, prices: [[4, 4]] },
    ]),
    e,
  )
  assert.deepEqual([...v.errors, ...v.review], [])
})
