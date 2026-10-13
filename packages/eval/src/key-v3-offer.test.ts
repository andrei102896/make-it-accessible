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
  assert.match(problems, /offer of o1 "£3.00" leaves out o2, a page price on the same line/)
  assert.match(problems, /offer of o2 "60p for each item" leaves out o1/)
  const elsewhere = offers({ offer: 'plus 60p for each item', offerWords: [1, 2, 3, 4, 5] })
  assert.match(validateV3Page(elsewhere, read, printed, TEXT).join(), /offer of o1 .* does not cite o1's own words/)
  const euro = offers({ offer: '3,00 € plus 60p for each item', offerWords: all })
  assert.match(validateV3Page(euro, read, printed, TEXT).join(), /does not read as its cited words/)
})

test('an offer reads claimed amounts as valued, a hidden glyph as letters and a line-end hyphen as one word', () => {
  const words = [word('£3.00', 0), word('plus', 12), word('6�p', 24), word('ex-', 36), word('tra', 0, 'm', 20)]
  const unreadable = [three, occurrence('o2', [2], '6�p', null)]
  const value = { printed: '60p', cents: 60, currency: 'GBP' }
  const p = offers(
    { offer: '£3.00 plus 60p extra', offerWords: [0, 1, 2, 3, 4] },
    { offer: '£3.00 plus 60p extra', offerWords: [0, 1, 2, 3, 4], value },
  )
  assert.deepEqual(validateV3Page(p, unreadable, words, TEXT), [])
  const glyph = [word('O�er', 0), word('£1', 12)]
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
