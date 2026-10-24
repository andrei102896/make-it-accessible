import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import { amountOf, asPrinted, printedAmount } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

const runs = (words: string[]): Run[] =>
  words.map((str, i) => ({
    id: `1:${String(i)}`,
    str,
    box: { x: 80 + i * 40, y: 100, w: 30, h: 10 },
    flow: 0,
    line: 0,
  }))
const page = (words: string[]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: runs(words),
  images: [],
  duplicates: [],
  hidden: [],
})
const dish = (prices: [number, number][]) =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [{ kind: 'products', items: [{ name: { src: [[0, 0]] }, prices: prices.map((r) => ({ src: [r] })) }] }],
      dropped: [],
    }),
  )

test('an add-on or a per-person price in two words is shown as printed, its mark kept (Scotts "+ 4.50")', () => {
  assert.equal(amountOf(runs(['+', '4.50']), 'GBP'), null)
  assert.equal(asPrinted(runs(['+', '4.50'])), '+ 4.50')
  assert.equal(amountOf(runs(['£49', 'pp']), 'GBP'), null)
  assert.equal(asPrinted(runs(['£49', 'pp'])), '£49 pp')
})

test('a separator fused after a price is no part of it (Rucola "$39/", Ridgway "51~")', () => {
  assert.equal(amountOf(runs(['$39/']))?.cents, 3900)
  assert.equal(printedAmount(runs(['51~'])), '51')
  assert.equal(printedAmount(runs(['$30/', 'dz'])), '$30/ dz')
})

test("an add-on is a price alone; beside the dish's own price with no label it is held", () => {
  const alone = validatePage(dish([[1, 1]]), page(['Add Crudite', '+12']))
  assert.deepEqual([...alone.errors, ...alone.review], [])
  const beside = validatePage(
    dish([
      [1, 1],
      [2, 2],
    ]),
    page(['Burger', '12', '+3']),
  )
  assert.deepEqual(
    beside.review.map((f) => [f.path, f.problem]),
    [['blocks[0].items[0].prices[1]', 'an add-on beside the dish\'s own price: "+3"']],
  )
})
