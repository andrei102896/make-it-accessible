import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageScore } from './fidelity-types.ts'
import { judgePage } from './fidelity-verdict.ts'

type Line = PageScore['lines'][number]
const span = (start: number, end: number) => ({ start, end, gap: 0 })
const line = (extra: Partial<Line> = {}): Line => ({
  text: 'Soup of the day',
  box: { x: 100, y: 100, w: 200, h: 20 },
  em: 16,
  price: false,
  mass: { ours: 1000, pdf: 1000 },
  core: { ours: 800, pdf: 800 },
  rim: 0,
  excess: null,
  effect: null,
  darker: null,
  contrast: 1,
  dy: 0,
  colour: 0.05,
  extent: { ours: span(0, 10), pdf: span(0, 10) },
  shadowed: false,
  fit: { k: 1, lx: 0 },
  ...extra,
})
const page = (lines: Line[], cluster = 0): PageScore => ({
  size: { w: 600, h: 800 },
  lines,
  outside: { cells: 100, busy: 0, pdfOnly: cluster, oursOnly: 0, cluster, worst: [] },
  groundOffset: 0,
})
const kinds = (p: PageScore) => {
  const v = judgePage(p)
  return { misinforming: v.misinforming.map((f) => f.kind), cosmetic: v.cosmetic.map((f) => f.kind) }
}

test('a line as printed is no finding', () => {
  assert.deepEqual(kinds(page([line()])), { misinforming: [], cosmetic: [] })
})

test('a copy misinforms: twice the ink, or an effect inking where the print has none (Howies allergens)', () => {
  assert.deepEqual(kinds(page([line({ mass: { ours: 1800, pdf: 1000 } })])).misinforming, ['doubled'])
  assert.deepEqual(kinds(page([line({ shadowed: true, excess: 0.32 })])).misinforming, ['doubled'])
  assert.deepEqual(kinds(page([line({ shadowed: true, excess: 0.05 })])).misinforming, [])
  // A dense line: the copy lands on neighbouring letters, but takes our ink's shape away from the print's.
  assert.deepEqual(kinds(page([line({ shadowed: true, excess: 0, effect: -0.04 })])).misinforming, ['doubled'])
  assert.deepEqual(kinds(page([line({ shadowed: true, excess: 0, effect: 0.03 })])).misinforming, [])
  // A dark glow round a gold word: its contrast moves away from the print's.
  assert.deepEqual(kinds(page([line({ effect: 0.03, darker: 0.15 })])).misinforming, ['doubled'])
})

test('faint ink misinforms; a price with none of our ink on its rows is unshown, and outranks the rest', () => {
  assert.deepEqual(kinds(page([line({ contrast: 0.4 })])).misinforming, ['vanished'])
  const gone = line({ price: true, core: { ours: 0, pdf: 800 }, extent: { ours: null, pdf: span(0, 2) } })
  assert.deepEqual(kinds(page([line({ mass: { ours: 1800, pdf: 1000 } }), gone])).misinforming, [
    'price-unshown',
    'doubled',
  ])
})

test('a line that does not show misinforms; on a ground the backdrop lacks it is not weighed', () => {
  assert.deepEqual(kinds(page([line({ core: { ours: 300, pdf: 800 } })])).misinforming, ['vanished'])
  const panel = kinds(page([line({ rim: 0.4, core: { ours: 300, pdf: 800 } })]))
  assert.deepEqual(panel, { misinforming: [], cosmetic: ['ground-differs'] })
  // White words on a panel the backdrop lost: none of our ink shows on our own ground.
  assert.deepEqual(kinds(page([line({ rim: 0.4, core: { ours: 0, pdf: 800 } })])).misinforming, ['vanished'])
})

test('a price moved half a line misinforms; any other line moved is cosmetic at most', () => {
  const moved = { extent: { ours: span(1, 3), pdf: span(0, 2) } }
  assert.deepEqual(kinds(page([line({ ...moved, price: true })])).misinforming, ['price-moved'])
  assert.deepEqual(kinds(page([line({ dy: 0.8, price: true })])).misinforming, ['price-moved'])
  assert.deepEqual(kinds(page([line(moved)])).misinforming, [])
})

test('ragged column edges, a narrower heading and a missing dotted side are cosmetic', () => {
  const a = line({ extent: { ours: span(0, 10), pdf: span(0, 10) } })
  const b = line({ box: { x: 100, y: 130, w: 200, h: 20 }, extent: { ours: span(0.6, 10), pdf: span(0, 10) } })
  assert.deepEqual(kinds(page([a, b])).cosmetic, ['ragged'])
  assert.deepEqual(kinds(page([line({ extent: { ours: span(0, 7), pdf: span(0, 10) } })])).cosmetic, ['narrower'])
  assert.deepEqual(kinds(page([line()], 3)).cosmetic, ['drawing-missing'])
})
