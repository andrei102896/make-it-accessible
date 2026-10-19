import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { consistencyFindings } from './consistency.ts'

// Three dishes, one per row, each price at the row's right end (any convention would do: the check is relative).
const words: [string, number, number][] = [
  ['Soup', 50, 100],
  ['9', 300, 100],
  ['Salad', 50, 140],
  ['12', 300, 140],
  ['Fish', 50, 180],
  ['20', 300, 180],
]
const runs: Run[] = words.map(([str, x, y], i) => ({
  id: `1:${String(i)}`,
  str,
  box: { x, y, w: 30, h: 12 },
  flow: 0,
  line: i >> 1,
}))
const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
const page = (prices: number[]) =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [0, 2, 4].map((name, k) => ({
            name: { src: [[name, name]] },
            prices: [{ src: [[prices[k], prices[k]]] }],
          })),
        },
      ],
    }),
  )

test('prices placed as the page places every other dish pass; two dishes with each other’s prices do not', () => {
  assert.deepEqual(consistencyFindings(page([1, 3, 5]), e), [])
  const swapped = consistencyFindings(page([5, 3, 1]), e)
  const [first] = swapped
  assert.equal(first?.path, 'blocks[0].items[0]')
  assert.match(first.problem, /price printed beside blocks\[0\]\.items\[2\]/)
  // Known limit: neighbouring rows with the price far right differ too little to be clear (price shift 88 %).
  assert.deepEqual(consistencyFindings(page([3, 1, 5]), e), [])
})
