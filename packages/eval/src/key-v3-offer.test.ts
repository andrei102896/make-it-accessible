import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateV3Page } from './key-v3-check.ts'
import { occurrence, page, TEXT, word } from './key-v3-page-fixture.ts'
import { fromV3Page } from './key-v3.ts'

const SENTENCE = '£3.00 plus 60p for each item'
const printed = ['£3.00', 'plus', '60p', 'for', 'each', 'item'].map((s, i) => word(s, i * 12))
const three = occurrence('o1', [0], '£3.00', 300, { currency: 'GBP' })
const read = [three, occurrence('o2', [2], '60p', 60, { currency: 'GBP' })]
const all = [0, 1, 2, 3, 4, 5]
const offers = (one: Record<string, unknown>, two: Record<string, unknown> = one) =>
  page({ products: [], occurrences: { o1: { kind: 'text', ...one }, o2: { kind: 'text', ...two } } })

test('a page price cites the printed words of its offer, and two on one line share it', () => {
  assert.deepEqual(validateV3Page(offers({ offer: SENTENCE, offerWords: all }), read, printed, TEXT), [])
  const swapped = offers({ offer: '60p plus £3.00 for each item', offerWords: all })
  assert.match(validateV3Page(swapped, read, printed, TEXT).join(), /does not read as its cited words/)
  const lazy = offers({ offer: '£3.00', offerWords: [0] }, { offer: '60p for each item', offerWords: [2, 3, 4, 5] })
  const problems = validateV3Page(lazy, read, printed, TEXT).join()
  assert.match(problems, /offer of o1 "£3.00" leaves out o2, an amount on a line it cites/)
  assert.match(problems, /offer of o2 "60p for each item" leaves out o1/)
  const elsewhere = offers({ offer: 'plus 60p for each item', offerWords: [1, 2, 3, 4, 5] })
  assert.match(validateV3Page(elsewhere, read, printed, TEXT).join(), /offer of o1 .* does not cite o1's own words/)
  const euro = offers({ offer: '3,00 € plus 60p for each item', offerWords: all })
  assert.match(validateV3Page(euro, read, printed, TEXT).join(), /does not read as its cited words/)
})

test('an offer reads claimed amounts as valued, a hidden glyph as letters and a line-end hyphen as one word', () => {
  const words = [
    word('£3.00', 0, 'b.0.0'),
    word('plus', 12, 'b.0.0'),
    word('6\ufffdp', 24, 'b.0.0'),
    word('ex-', 36, 'b.0.0'),
    word('tra', 0, 'b.0.1', 20),
  ]
  const unreadable = [three, occurrence('o2', [2], '6\ufffdp', null)]
  const value = { printed: '60p', cents: 60, currency: 'GBP' }
  const p = offers(
    { offer: '£3.00 plus 60p extra', offerWords: [0, 1, 2, 3, 4] },
    { offer: '£3.00 plus 60p extra', offerWords: [0, 1, 2, 3, 4], value },
  )
  assert.deepEqual(validateV3Page(p, unreadable, words, TEXT), [])
  const glyph = [word('O\ufffder', 0), word('£1', 12)]
  const one = page({
    products: [],
    occurrences: { o1: { kind: 'text', offer: 'Offer £1', offerWords: [0, 1] } },
  })
  assert.deepEqual(validateV3Page(one, [occurrence('o1', [1], '£1', 100, { currency: 'GBP' })], glyph, TEXT), [])
})

test('an offer read from the render is confirmed, cites no words, and must not be printed at its place', () => {
  const badge = page({
    products: [],
    manual: {
      m1: {
        source: 'image',
        printed: '£5',
        cents: 500,
        currency: 'GBP',
        box: { x: 0, y: 0, w: 10, h: 10 },
        confirmed: true,
      },
    },
    occurrences: { m1: { kind: 'text', offer: { text: '2 for £5', seen: true } } },
  })
  assert.match(validateV3Page(badge, [], [], TEXT).join(), /offer of m1 "2 for £5" read from the render awaits/)
  const confirmed = page({
    ...badge,
    occurrences: { m1: { kind: 'text', offer: { text: '2 for £5', seen: true, confirmed: true } } },
  })
  assert.deepEqual(validateV3Page(confirmed, [], [], TEXT), [])
  const [price] = fromV3Page(confirmed, []).textPrices
  assert.deepEqual([price?.offer, price?.seen], ['2 for £5', true])
  const plain = page({
    products: [],
    occurrences: { o1: { kind: 'text', offer: { text: 'Only £5', seen: true, confirmed: true } } },
  })
  const text = [word('Only', 0), word('£5', 12)]
  const o1 = occurrence('o1', [1], '£5', 500, { currency: 'GBP', box: { x: 12, y: 0, w: 10, h: 10 } })
  assert.match(validateV3Page(plain, [o1], text, TEXT).join(), /"Only £5" is in the text layer at its place; cite it/)
  const euro = page({
    ...badge,
    occurrences: { m1: { kind: 'text', offer: { text: '2 for 5 €', seen: true, confirmed: true } } },
  })
  assert.match(validateV3Page(euro, [], [], TEXT).join(), /"2 for 5 €" does not print £5/)
  const negated = [word('Not', 0), word('Only', 12), word('£5', 24)]
  const o3 = occurrence('o1', [2], '£5', 500, { currency: 'GBP', box: { x: 24, y: 0, w: 10, h: 10 } })
  assert.match(validateV3Page(plain, [o3], negated, TEXT).join(), /in the text layer at its place/)
  const image = page({ ...badge, occurrences: { m1: { kind: 'text', offer: '2 for £5' } } })
  assert.match(validateV3Page(image, [], [], TEXT).join(), /an image amount's offer is read from the render/)
})

test('one print is one image amount; different amounts may overlap', () => {
  const at = (x: number, cents: number, printed: string) => ({
    source: 'image',
    printed,
    cents,
    currency: 'GBP',
    box: { x, y: 0, w: 20, h: 10 },
    confirmed: true,
  })
  const claim = { kind: 'price', product: 'p1', role: 'current' }
  const twice = (m2: Record<string, unknown>) =>
    page({ manual: { m1: at(0, 500, '£5'), m2 }, occurrences: { m1: claim, m2: { ...claim, product: 'p2' } } })
  assert.match(validateV3Page(twice(at(5, 500, '£5')), [], [], TEXT).join(), /image amounts m1 and m2 are one print/)
  assert.deepEqual(validateV3Page(twice(at(5, 300, '£3')), [], [], TEXT), [])
  assert.deepEqual(validateV3Page(twice(at(40, 500, '£5')), [], [], TEXT), [])
})

test('cited words follow the page: one run per block, blocks in stream order, every amount on a cited line', () => {
  const reorders = /skips or reorders words inside a text block/
  const swapped = offers({ offer: '60p plus £3.00 for each item', offerWords: [2, 1, 0, 3, 4, 5] })
  assert.match(validateV3Page(swapped, read, printed, TEXT).join(), reorders)
  const gap = offers({ offer: '£3.00 60p', offerWords: [0, 2] })
  assert.match(validateV3Page(gap, read, printed, TEXT).join(), reorders)
  const three = ['0.0.0', '0.0.0', '0.0.1', '0.0.2', '0.0.2', '0.0.2']
  const lines = printed.map((w, i) => ({ ...w, line: three[i] ?? '' }))
  assert.deepEqual(validateV3Page(offers({ offer: SENTENCE, offerWords: all }), read, lines, TEXT), [])
  const middle = offers({ offer: '£3.00 plus for each item', offerWords: [0, 1, 3, 4, 5] })
  assert.match(validateV3Page(middle, read, lines, TEXT).join(), reorders)
  const blocks = printed.map((w, i) => ({ ...w, line: i < 2 ? '0.0.0' : '1.0.0' }))
  assert.deepEqual(validateV3Page(offers({ offer: SENTENCE, offerWords: all }), read, blocks, TEXT), [])
  const back = offers({ offer: '60p for each item £3.00 plus', offerWords: [2, 3, 4, 5, 0, 1] })
  assert.match(validateV3Page(back, read, blocks, TEXT).join(), /departs from stream order; say why in offerNote/)
  const dropped = page({
    products: [{ id: 'p1', anchor: 'Tee', alt: null }],
    occurrences: {
      o1: { kind: 'text', offer: '£3.00 plus', offerWords: [0, 1], offerNote: { text: 'x', confirmed: true } },
      o2: { kind: 'notPrice', reason: 'not an offer' },
    },
  })
  assert.match(validateV3Page(dropped, read, printed, TEXT).join(), /leaves out o2, an amount on a line it cites/)
})

test('leaving out the edge of a line needs a note Andrei confirms', () => {
  const edge = [word('Delivery:', 0), ...printed.map((w) => ({ ...w, x: w.x + 60 }))]
  const shifted = read.map((o) => ({ ...o, words: o.words.map((i) => i + 1) }))
  const cut = (note: Record<string, unknown>) => offers({ offer: SENTENCE, offerWords: all.map((i) => i + 1), ...note })
  assert.match(validateV3Page(cut({}), shifted, edge, TEXT).join(), /say why in offerNote/)
  const open = cut({ offerNote: { text: 'a label, not the offer' } })
  assert.match(validateV3Page(open, shifted, edge, TEXT).join(), /offerNote "a label, not the offer" awaits/)
  const confirmed = cut({ offerNote: { text: 'a label, not the offer', confirmed: true } })
  assert.deepEqual(validateV3Page(confirmed, shifted, edge, TEXT), [])
})

test('amounts in an offer read as readMoney reads them: Swiss and space thousands, a pence minus', () => {
  const swiss = [word('CHF', 0), word('1’200', 12), word('pro', 24), word('Jahr', 36)]
  const year = occurrence('o1', [0, 1], 'CHF 1’200', 120000, { currency: 'CHF' })
  const one = page({
    products: [],
    occurrences: { o1: { kind: 'text', offer: 'CHF 1’200 pro Jahr', offerWords: [0, 1, 2, 3] } },
  })
  assert.deepEqual(validateV3Page(one, [year], swiss, TEXT), [])
  const pence = [word('Save', 0), word('-60p', 12)]
  const off = occurrence('o1', [1], '-60p', -60, { currency: 'GBP' })
  const save = page({
    products: [],
    occurrences: { o1: { kind: 'text', role: 'discount', offer: 'Save -60p', offerWords: [0, 1] } },
  })
  assert.deepEqual(validateV3Page(save, [off], pence, TEXT), [])
})

test('a table cell holding one amount reads as a price does', () => {
  const p = page({
    products: [],
    tables: [
      {
        header: ['Modell', '€'],
        rows: [
          ['A', '2 299,00'],
          ['B', '45.–'],
        ],
      },
    ],
    occurrences: { o1: { kind: 'cell', table: 0, row: 0, col: 1 }, o2: { kind: 'cell', table: 0, row: 1, col: 1 } },
  })
  const cells = [occurrence('o1', [0, 1], '2 299,00', 229900), occurrence('o2', [2], '45.–', 4500)]
  const words = [word('2', 0), word('299,00', 12), word('45.–', 0, 'm', 20)]
  assert.deepEqual(validateV3Page(p, cells, words, TEXT), [])
})

test('a spec value in a table is not a price: its amounts are claimed notPrice', () => {
  const table = (claim: Record<string, unknown>) =>
    page({
      products: [],
      tables: [{ header: ['Modell', 'Länge'], rows: [['A', '7.50']] }],
      occurrences: { o1: claim },
    })
  const cells = [occurrence('o1', [0], '7.50', 750)]
  const words = [word('7.50', 0)]
  assert.match(
    validateV3Page(table({ kind: 'cell', table: 0, row: 0, col: 1 }), cells, words, TEXT).join(),
    /is a spec value; claim its amounts notPrice/,
  )
  assert.deepEqual(validateV3Page(table({ kind: 'notPrice', reason: 'a length' }), cells, words, TEXT), [])
})
