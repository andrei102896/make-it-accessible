import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { alignmentsOf } from './align.ts'

// Lines of different lengths set on a common centre (x = 300), on a common right edge (x = 560), and left (x = 40).
const centred = ['CHEESE', 'Gorgonzola Piccante $10', 'Caciocavallo $11', 'Canestrato $11']
const right = ['TASTES', 'Roasted Garlic Clove', 'Duck Liver Mousse', 'House Olives']
const left = ['SIDES', 'Fries', 'Creamed Spinach', 'Mashed Potatoes']
const runs: Run[] = []
const add = (str: string, x: number, y: number): number => {
  runs.push({
    id: `1:${String(runs.length)}`,
    str,
    box: { x, y, w: str.length * 6, h: 12 },
    flow: 0,
    line: runs.length,
  })
  return runs.length - 1
}
const block = (lines: string[], at: (w: number) => number, y0: number) => {
  const ids = lines.map((s, i) => add(s, at(s.length * 6), y0 + i * 20))
  return [
    { kind: 'heading', level: 2, text: { src: [[ids[0], ids[0]]] } },
    { kind: 'products', items: ids.slice(1).map((n) => ({ name: { src: [[n, n]] }, prices: [] })) },
  ]
}
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      ...block(centred, (w) => 300 - w / 2, 100),
      ...block(right, (w) => 560 - w, 300),
      ...block(left, () => 40, 500),
    ],
    dropped: [],
  }),
)
const extraction: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }

test('a list set on a common centre is centred, its heading too; a right-set list is right; a left one is neither', () => {
  assert.deepEqual(
    [...alignmentsOf({ structure, extraction })].sort((a, b) => a[0] - b[0]),
    [
      [0, 'center'],
      [1, 'center'],
      [3, 'right'],
    ],
  )
})
