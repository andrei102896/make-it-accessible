import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KeyDocSchema } from '../key-schema.ts'
import { poissonBound, pricedItems, productPages, regressions, summarize, zeroFailureBound } from './aggregate.ts'

test('bounds match the pre-registered formulas', () => {
  assert.ok(Math.abs((zeroFailureBound(52) ?? 0) - 0.056) < 0.0005)
  assert.ok(Math.abs((zeroFailureBound(300) ?? 0) - 0.00994) < 0.0001)
  assert.ok(Math.abs((poissonBound(0, 1) ?? 0) - 2.996) < 0.001)
  assert.ok(Math.abs((poissonBound(6, 12) ?? 0) - 11.84 / 12) < 0.01)
  assert.equal(zeroFailureBound(0), null)
})

test('a page that passed every run and now passes at most one is a regression', () => {
  const page = (passed: number) => ({
    doc: 'd',
    keyPage: 1,
    type: 'grid',
    passed,
    runs: 3,
    silentPriceErrors: 0,
    decisions: 0,
    failing: [],
  })
  assert.deepEqual(regressions([page(3)], [page(1)]), ['d p1'])
  assert.deepEqual(regressions([page(3)], [page(2)]), [])
  assert.deepEqual(regressions([page(2)], [page(0)]), [])
})

test('the decisions bound counts each grid page once, at its worst run', () => {
  const run = (decisions: number) => ({
    keyPage: 1,
    pass: {},
    c2: { silent: 0, unverified: 0 },
    c5: { silentRows: 0 },
    decisions,
  })
  const page = {
    doc: 'd',
    type: 'grid',
    keyPage: 1,
    items: 10,
    seenItems: 0,
    printedPages: 2,
    runs: [run(1), run(3), run(2)],
  }
  const s = summarize([page])
  assert.equal(s.gridDecisionsPerPage, 1)
  assert.equal(s.gridDecisionsBound, poissonBound(3, 2))
})

test('priced items: version-3 pages count claimed price cells; product pages need a product anchor', () => {
  const page = KeyDocSchema.parse({
    doc: 'd',
    pdf: 'p.pdf',
    lang: 'de',
    currency: 'EUR',
    pages: [
      {
        pdfPage: 1,
        keyPage: 1,
        type: 'grid',
        products: [{ anchor: 'Tee', prices: [{ printed: '1,99', cents: 199, role: 'current', currency: 'EUR' }] }],
        textPrices: [{ printed: '1,00', cents: 100, role: 'current', currency: 'EUR', offer: '1,00' }],
        tables: [{ header: ['Maß', 'Preis'], rows: [['7.5 m', '5,00 €']] }],
        pricedCells: 1,
      },
    ],
  })
  const [first] = page.pages
  if (!first) throw new Error('no page')
  assert.equal(pricedItems(first), 3)
  const key = {
    ...page,
    pdfPath: '',
    sections: [
      { keyPage: 1, label: '2', anchors: ['Tee'] },
      { keyPage: 1, label: '3', anchors: [] },
    ],
  }
  assert.equal(productPages(key, first), 1)
})
