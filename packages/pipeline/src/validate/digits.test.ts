import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

// Words on one line, 10 pt high, `small` ones 6 pt; each price is the item's whole cited range.
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
const priced = (price: [number, number]) =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [{ kind: 'products', items: [{ name: { src: [[0, 0]] }, prices: [{ src: [price] }] }] }],
      dropped: [],
    }),
  )
const problems = (words: [string, number, number?][]): string[] =>
  validatePage(priced([1, words.length - 1]), page(words)).errors.map((f) => f.problem)

test('an amount that leaves out printed digits is an error; whole, one-decimal, pence and paired cents pass', () => {
  // Cents printed apart from their digits are dropped by the amount: "$24 .95" would read as 24.
  assert.deepEqual(
    problems([
      ['Toast', 10],
      ['$24', 300],
      ['.95', 330, 6],
    ]),
    ['the amount leaves out digits its words print: "$24 .95"'],
  )
  // Other digits cited with a price are held: a footnote mark ("1.99" + small "2") or a size.
  assert.equal(
    problems([
      ['Toast', 10],
      ['£1.99', 300],
      ['2', 326, 6],
    ]).length,
    1,
  )
  // A leaflet's euros and small cents are one amount, every digit used (its currency is another check).
  assert.ok(
    !problems([
      ['Toast', 10],
      ['2', 300],
      ['69', 306, 6],
    ]).some((p) => p.includes('leaves out digits')),
  )
  for (const words of [
    [
      ['Toast', 10],
      ['£7,500', 300],
    ],
    [
      ['Toast', 10],
      ['£12.5', 300],
    ],
    [
      ['Toast', 10],
      ['99p', 300],
    ],
    [
      ['Toast', 10],
      ['$13', 300],
      ['.95', 315, 6],
    ],
  ] satisfies [string, number, number?][][])
    assert.deepEqual(problems(words), [], words.map((w) => w[0]).join(' '))
})
