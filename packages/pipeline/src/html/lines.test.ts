import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Rule, Run } from '../pdf/types.ts'
import { NO_BOXES } from './boxes.ts'
import { linesCss, linesOf, splitBands } from './lines.ts'

// A 600 x 800 pt page: DINNER on a dotted line running behind it; PASTA beside the next column's rule; POISSONS over
// a short centred rule; four sections in two columns cut into two rows by a full-width rule, the lower row divided
// by a vertical rule; a list crossed by a rule; a heading on a frame's top edge.
const runs: Run[] = []
const word = (str: string, x: number, y: number, w = str.length * 6): number => {
  runs.push({ id: `1:${String(runs.length)}`, str, box: { x, y, w, h: 12 }, flow: 0, line: runs.length })
  return runs.length - 1
}
const heading = (str: string, x: number, y: number) => {
  const n = word(str, x, y)
  return { kind: 'heading', level: 2, text: { src: [[n, n]] } }
}
const list = (...rows: [string, number, number][]) => ({
  kind: 'products',
  items: rows.map(([str, x, y]) => {
    const n = word(str, x, y, 200)
    return { name: { src: [[n, n]] }, prices: [] }
  }),
})
const blocks = [
  heading('DINNER', 282, 100),
  heading('PASTA', 40, 200),
  heading('POISSONS', 270, 300),
  heading('APPETIZERS', 40, 400),
  list(['Melon', 40, 420]),
  heading('SALADS', 340, 400),
  list(['Arugula', 340, 420]),
  heading('PASTAS', 40, 500),
  list(['Orzotto', 40, 520]),
  heading('SIDES', 340, 500),
  list(['Squash', 340, 520]),
  list(['Chicken', 40, 600], ['Trout', 40, 630]),
  heading('DESSERTS', 40, 702),
]
const structure = parsePage(JSON.stringify({ lang: 'en', blocks, dropped: [] }))
const rule = (x: number, y: number, w: number, h = 0, dash: Rule['dash'] = 'solid'): Rule => ({
  box: { x, y, w, h },
  color: '#231f20',
  width: 0.7,
  dash,
  double: false,
})
const rules = [
  rule(50, 106, 500, 0, 'dotted'),
  rule(300, 206, 260),
  rule(249, 318, 90),
  rule(40, 490, 520),
  rule(300, 500, 0, 60),
  rule(40, 620, 220),
  rule(30, 708, 540),
]
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs,
  images: [],
  duplicates: [],
  hidden: [],
  rules,
  vectors: [
    { kind: 'frame', box: { x: 30, y: 708, w: 540, h: 60 }, color: '#231f20', width: 1, rounded: false, double: false },
  ],
}
const page = { structure, extraction }

test('a rule crossing two columns between their sections splits the band; the lower row takes it and the divider', () => {
  const bands = splitBands(page, [
    {
      columns: [
        [3, 4, 7, 8],
        [5, 6, 9, 10],
      ],
    },
  ])
  assert.deepEqual(
    bands.map((b) => b.columns),
    [
      [
        [3, 4],
        [5, 6],
      ],
      [
        [7, 8],
        [9, 10],
      ],
    ],
  )
  const lines = linesOf(page, bands, NO_BOXES)
  assert.equal(lines.bands.get(1), 'rule-top ln-solid-231f20-1')
  assert.deepEqual([...lines.columns], [['1:1', 'rule-left ln-solid-231f20-1']])
})

test('through a heading, under it, never a neighbour column’s rule, a list it crosses or a frame’s edge', () => {
  const lines = linesOf(
    page,
    splitBands(page, [
      {
        columns: [
          [3, 4, 7, 8],
          [5, 6, 9, 10],
        ],
      },
    ]),
    NO_BOXES,
  )
  assert.equal(lines.blocks.get(0), 'ruled rule-through rule-left rule-right ln-dotted-231f20-1')
  assert.equal(lines.blocks.has(1), false)
  // 90 pt of the 500 pt the page's content spans, centred under its heading.
  assert.equal(lines.blocks.get(2), 'ruled rule-under rule-centred rw-20 ln-solid-231f20-1')
  assert.equal(lines.blocks.has(11), false)
  assert.equal(lines.blocks.has(12), false)
  const css = linesCss(lines.looks)
  assert.match(css, /\.ln-dotted-231f20-1 \{ --rule: 1px dotted #231f20; \}/)
  assert.match(css, /\.rw-20 \{ --rule-w: 20%; \}/)
  // The heading's own rule outranks a signature rule or an ornament on the same pseudo-element.
  assert.match(css, /:is\(h1, h2, h3, h4, h5, h6\)\.rule-through\.rule-left::before/)
})

test('a rule above a row rules the first block of each column; one with nothing below rules the block above', () => {
  const at: Run[] = [
    { id: '1:0', str: 'SEASONAL DESSERT', box: { x: 40, y: 300, w: 120, h: 12 }, flow: 0, line: 0 },
    { id: '1:1', str: '10', box: { x: 300, y: 302, w: 12, h: 12 }, flow: 0, line: 1 },
    { id: '1:2', str: 'All prices include a surcharge', box: { x: 40, y: 400, w: 300, h: 10 }, flow: 0, line: 2 },
  ]
  const own = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'heading', level: 2, text: { src: [[0, 0]] } },
        { kind: 'paragraph', text: { src: [[1, 1]] } },
        { kind: 'paragraph', text: { src: [[2, 2]] } },
      ],
      dropped: [],
    }),
  )
  const e: Extraction = { ...extraction, runs: at, vectors: [], rules: [rule(40, 296, 300), rule(40, 415, 300)] }
  const lines = linesOf({ structure: own, extraction: e }, [], NO_BOXES)
  assert.deepEqual(
    [...lines.blocks],
    [
      [0, 'ruled rule-above ln-solid-231f20-1'],
      [2, 'ruled rule-below ln-solid-231f20-1'],
    ],
  )
})
