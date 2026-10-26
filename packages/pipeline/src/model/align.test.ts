import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Run } from '../pdf/types.ts'
import { alignScan } from './align.ts'
import { parsePage } from './schema.ts'

// OCR's words: [str, x, y, block, line]
const ocr = (words: [string, number, number, number, number][]): Run[] =>
  words.map(([str, x, y, flow, line], i) => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y, w: 30, h: 10 },
    flow,
    line,
    ocr: true,
  }))
const dish = (name: string, price: string) => ({ name: { seen: name }, prices: [{ seen: price }] })
const runs = ocr([
  ['Tomato', 10, 10, 1, 0],
  ['Soup', 45, 10, 1, 0],
  ['$12', 200, 10, 1, 0],
  ['Green', 10, 30, 1, 1],
  ['Salad', 45, 30, 1, 1],
  ['12', 200, 30, 1, 1],
  ['Mozza-', 10, 50, 1, 2],
  ['rella', 10, 70, 1, 3],
  ['$12.50', 200, 70, 1, 3],
  ['=', 300, 90, 1, 4],
])

test('each dish cites the words both readers read, a repeated price the one beside its name', () => {
  const page = parsePage(
    JSON.stringify(
      alignScan(
        {
          lang: 'en',
          blocks: [
            {
              kind: 'products',
              items: [dish('Green Salad', '12'), dish('Tomato Soup', '$12'), dish('Mozzarella', '12.50')],
            },
          ],
        },
        runs,
      ),
    ),
  )
  const items = page.blocks[0]?.kind === 'products' ? page.blocks[0].items : []
  assert.deepEqual(
    items.map((i) => [i.name.src, i.name.text, i.prices[0]?.src, i.prices[0]?.text]),
    [
      [[[3, 4]], undefined, [[5, 5]], undefined],
      [[[0, 1]], undefined, [[2, 2]], undefined],
      [[[6, 7]], undefined, [[8, 8]], undefined],
    ],
  )
  assert.deepEqual(page.dropped, [[9, 9]])
})

test('a price the two readers read differently cites OCR with the model reading; an unread name stays seen', () => {
  const out = alignScan(
    { lang: 'en', blocks: [{ kind: 'products', items: [dish('Mozzarella', '12.80'), dish('Lobster', '40')] }] },
    runs,
  )
  const page = parsePage(JSON.stringify(out))
  const [first, second] = page.blocks
  const item = first?.kind === 'products' ? first.items : []
  assert.deepEqual(
    item.map((i) => [i.prices[0]?.src, i.prices[0]?.text]),
    [[[[8, 8]], '12.80']],
  )
  assert.deepEqual(second, {
    kind: 'paragraph',
    text: { seen: 'Lobster 40' },
    uncertain: 'the name is not in the OCR reading',
  })
})

// Durant's shape: "88" printed on the dish's line, "82" on the next; image pixels are twice page points.
const lines = ocr([
  ['Petite', 10, 10, 1, 0],
  ['Filet', 45, 10, 1, 0],
  ['88', 200, 10, 1, 0],
  ['Filet', 10, 30, 1, 1],
  ['Mignon', 45, 30, 1, 1],
  ['82', 200, 30, 1, 1],
])
const LINE_0 = [20, 20, 460, 20]
const LINE_1 = [20, 60, 460, 20]
const prices = (items: Record<string, unknown>[], runs = lines) => {
  const page = parsePage(JSON.stringify(alignScan({ lang: 'en', blocks: [{ kind: 'products', items }] }, runs, 0.5)))
  const b = page.blocks[0]
  return b?.kind === 'products' ? b.items.map((i) => [i.prices[0]?.src, i.prices[0]?.text, i.uncertain]) : []
}

test("in the dish's area a misread price cites its own line's reading and is held, never an exact one elsewhere", () => {
  assert.deepEqual(prices([{ ...dish('Petite Filet', '82'), at: LINE_0 }]), [[[[2, 2]], '82', undefined]])
  assert.deepEqual(prices([dish('Petite Filet', '82')]), [[[[5, 5]], undefined, undefined]])
})

test('an area that misses the name is ignored and doubted; a price outside its area is doubted; a bad area is none', () => {
  assert.deepEqual(prices([{ ...dish('Petite Filet', '82'), at: LINE_1 }]), [
    [[[5, 5]], undefined, 'the area given for this dish does not hold its name'],
  ])
  const other = lines.map((r) => (r.str === '88' ? { ...r, str: '15' } : r))
  assert.deepEqual(prices([{ ...dish('Petite Filet', '82'), at: LINE_0 }], other), [
    [[[5, 5]], undefined, 'price "82" is printed outside where the dish is'],
  ])
  assert.deepEqual(prices([{ ...dish('Petite Filet', '82'), at: [1, 2, 'x'] }]), prices([dish('Petite Filet', '82')]))
})
