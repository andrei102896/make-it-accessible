import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

// Words given as [text, line]; x follows the order on each line.
const page = (words: [string, number][], hidden: number[] = []): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, line], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x: i * 40, y: 100 + line * 14, w: 30, h: 10 },
    flow: 0,
    line,
  })),
  images: [],
  duplicates: [],
  hidden: hidden.map((i) => `1:${String(i)}`),
})
const doubles = (e: Extraction, blocks: unknown[], dropped: number[][] = []): string[] =>
  validatePage(parsePage(JSON.stringify({ lang: 'en', blocks, dropped })), e)
    .errors.map((f) => f.problem)
    .filter((p) => p.includes('printed once and shown twice'))
const r = (from: number, to = from) => ({ src: [[from, to]] })

test("a word of one dish in another's description is an error naming both dishes (Prohibition's BONE-IN)", () => {
  const e = page([
    ['SHORTRIB', 0],
    ['smoked', 1],
    ['BONE-IN', 1],
    ['PORK', 1],
    ['CHOP', 1],
    ['35', 2],
  ])
  const blocks = [
    {
      kind: 'products',
      items: [
        { name: r(0), prices: [], details: [{ kind: 'paragraph', text: r(1, 2) }] },
        { name: r(2, 4), prices: [r(5)] },
      ],
    },
  ]
  assert.deepEqual(doubles(e, blocks), [
    '"BONE-IN" is printed once and shown twice: in the description of "SHORTRIB" and in the name "BONE-IN PORK CHOP"',
  ])
})

test('column heads, a group name over its variants, a fused name and price, a unit with its price pass', () => {
  const e = page([
    ['125ml', 0],
    ['Bottle', 0],
    ['Merlot', 1],
    ['7', 1],
    ['28', 1],
    ['Shiraz', 2],
    ['8', 2],
    ['30', 2],
    ['San', 3],
    ['Pellegrino', 3],
    ['Sparkling', 4],
    ['Panna', 5],
    ['Egg…12', 6],
    ['£5 each', 7],
  ])
  const wine = (name: number, a: number, b: number) => ({
    name: r(name),
    prices: [
      { ...r(a), qualifier: r(0) },
      { ...r(b), qualifier: r(1) },
    ],
  })
  const blocks = [
    { kind: 'products', items: [wine(2, 3, 4), wine(5, 6, 7)] },
    {
      kind: 'products',
      items: [
        { name: r(8, 10), prices: [] },
        {
          name: {
            src: [
              [8, 9],
              [11, 11],
            ],
          },
          prices: [],
        },
      ],
    },
    {
      kind: 'products',
      items: [
        { name: r(12), prices: [r(12)] },
        { name: r(13), prices: [r(13)], unit: r(13) },
      ],
    },
  ]
  assert.deepEqual(doubles(e, blocks), [])
})

test('one amount for several dishes passes on all their lines or none; on one of them, or across blocks, it does not', () => {
  const e = page([
    ['Houmous', 0],
    ['Tapenade', 0],
    ['each 2.95', 0],
    ['Salmon', 1],
    ['15.50', 1],
    ['Burger', 2],
    ['Fries', 3],
  ])
  const two = (a: unknown, b: unknown) => [{ kind: 'products', items: [a, b] }]
  assert.deepEqual(doubles(e, two({ name: r(0), prices: [r(2)] }, { name: r(1), prices: [r(2)] })), [])
  assert.equal(doubles(e, two({ name: r(3), prices: [r(4)] }, { name: r(5), prices: [r(4)] })).length, 1)
  const across = [
    { kind: 'products', items: [{ name: r(3), prices: [r(4)] }] },
    { kind: 'products', items: [{ name: r(6), prices: [r(4)] }] },
  ]
  assert.equal(doubles(e, across).length, 1)
})

test('a label shared with another dish, a dropped word and a hidden one: only the label is a finding', () => {
  const e = page([
    ['Toast', 0],
    ['with', 0],
    ['4', 0],
    ['Eggs', 1],
    ['jam', 1],
  ])
  const blocks = [
    {
      kind: 'products',
      items: [
        { name: r(0), prices: [{ ...r(2), qualifier: r(1) }] },
        { name: r(3), prices: [], details: [{ kind: 'paragraph', text: r(1) }] },
      ],
    },
  ]
  assert.equal(doubles(e, blocks).length, 1)
  const once = [
    {
      kind: 'products',
      items: [
        { name: r(0, 1), prices: [r(2)] },
        { name: r(3), prices: [] },
      ],
    },
  ]
  assert.deepEqual(
    doubles(e, once, [
      [1, 1],
      [4, 4],
    ]),
    [],
  )
  assert.deepEqual(
    doubles(
      page(
        [
          ['Toast', 0],
          ['4', 0],
          ['x', 0],
        ],
        [2],
      ),
      [
        { kind: 'products', items: [{ name: r(0, 2), prices: [r(1)] }] },
        { kind: 'paragraph', text: r(2) },
      ],
    ),
    [],
  )
})
