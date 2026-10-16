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

test('a US menu with bare prices, a market price, a two-size price and one decimal has no price findings', () => {
  const e = page([
    ['Crudo', 0],
    ['19', 100],
    ['Oysters', 0],
    ['MP', 100],
    ['Penne', 0],
    ['22/32', 100],
    ['Soup', 0],
    ['18.9', 100],
  ])
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 1]] },
      { name: 2, prices: [[3, 3]] },
      { name: 4, prices: [[5, 5]] },
      { name: 6, prices: [[7, 7]] },
    ]),
    e,
  )
  assert.deepEqual(v.errors, [])
  assert.deepEqual(v.review, [])
})

test('a leaflet with fused cents still needs a currency and keeps bare digits in review', () => {
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
  assert.equal(v.errors.filter((f) => f.problem.startsWith('no currency')).length, 2)
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

test('words that are no price are still an error, and a price cited twice for one dish is an error', () => {
  const e = page([
    ['Steak', 0],
    ['-37%', 100],
    ['Risotto', 0],
    ['26', 100],
  ])
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 1]] },
      {
        name: 2,
        prices: [
          [3, 3],
          [3, 3],
        ],
      },
    ]),
    e,
  )
  assert.deepEqual(
    v.errors.map((f) => f.problem),
    ['price words "-37%" are not an amount', 'price cites the same words as another price of this item'],
  )
})
