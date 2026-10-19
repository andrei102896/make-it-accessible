import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '@make-it-accessible/pipeline/model/schema'
import type { Extraction, Run } from '@make-it-accessible/pipeline/pdf/types'
import { validatePage } from '@make-it-accessible/pipeline/validate/validate'
import { mutants, type Defect } from './inject.ts'

const strs = [
  'STARTERS',
  'Soup',
  '$9',
  'leek',
  'Salad',
  '$12',
  'MAINS',
  'Fish',
  '$20',
  'Steak',
  '$30',
  'Note',
  'vegan',
  'gluten free',
]
const runs: Run[] = strs.map((str, i) => ({
  id: `1:${String(i)}`,
  str,
  box: { x: 10 + (i % 4) * 60, y: 10 + Math.floor(i / 4) * 20, w: 40, h: 10 },
  flow: 0,
  line: Math.floor(i / 4),
  ...(i >= 12 ? { icon: true as const } : {}),
}))
const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
const item = (name: number, price: number, details: number[] = []) => ({
  name: { src: [[name, name]] },
  prices: [{ src: [[price, price]] }],
  details: details.map((d) => ({ kind: 'paragraph', text: { src: [[d, d]] } })),
})
const page = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 2, text: { src: [[0, 0]] } },
      { kind: 'products', items: [item(1, 2, [3, 12]), item(4, 5)] },
      { kind: 'heading', level: 2, text: { src: [[6, 6]] } },
      { kind: 'products', items: [item(7, 8, [13]), item(9, 10)] },
      { kind: 'paragraph', text: { src: [[11, 11]] } },
    ],
  }),
)
const all = <T>(xs: T[]): T[] => xs

test('every defect type is injected and keeps every word covered, so only a check of the defect can catch it', () => {
  assert.deepEqual(validatePage(page, e).uncovered, [])
  const made = mutants(page, e, 1, all)
  const types = new Set(made.map((m) => m.type))
  const expected: Defect[] = [
    'price-swap',
    'price-role',
    'name-swap',
    'heading-swap',
    'detail-move',
    'item-move',
    'drop-detail',
    'drop-item',
    'drop-paragraph',
    'icon-swap',
  ]
  for (const t of expected) assert.ok(types.has(t), t)
  for (const m of made) assert.deepEqual(validatePage(m.structure, e).uncovered, [], m.type)
  const swap = made.find((m) => m.type === 'price-swap')
  const prices = swap?.structure.blocks.flatMap((b) =>
    b.kind === 'products' ? b.items.map((i) => i.prices[0]?.src) : [],
  )
  assert.deepEqual(prices?.slice(0, 2), [[[5, 5]], [[2, 2]]])
})
