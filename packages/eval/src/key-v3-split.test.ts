import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateV3Page } from './key-v3-check.ts'
import { fromV3Page } from './key-v3.ts'
import { occurrence, page, TEXT, word } from './key-v3-page-fixture.ts'

const part = (words: number[], printed: string, cents: number) => ({
  source: 'split',
  words,
  printed,
  cents,
  currency: null,
  confirmed: true,
})

test('a split names distinct parts that cite each word of the occurrence once', () => {
  const words = [word('1,00', 0), word('2,00', 12)]
  const glued = [occurrence('o1', [0, 1], '1,002,00', null)]
  const manual = { m1: part([0], '1,00', 100), m2: part([1], '2,00', 200) }
  const priced = {
    m1: { kind: 'price', product: 'p1', role: 'current' },
    m2: { kind: 'price', product: 'p2', role: 'current' },
  }
  const ok = page({ manual, occurrences: { o1: { kind: 'split', into: ['m1', 'm2'] }, ...priced } })
  assert.deepEqual(validateV3Page(ok, glued, words, TEXT), [])
  assert.deepEqual(
    fromV3Page(ok, glued).products.map((p) => p.prices?.map((k) => k.cents)),
    [[100], [200]],
  )
  const missing = page({ manual, occurrences: { o1: { kind: 'split', into: ['m1', 'm9'] }, ...priced } })
  assert.match(validateV3Page(missing, glued, words, TEXT).join(), /not distinct split parts/)
  const twice = page({ manual, occurrences: { o1: { kind: 'split', into: ['m1', 'm1'] }, ...priced } })
  assert.match(validateV3Page(twice, glued, words, TEXT).join(), /not distinct split parts/)
  const two = [occurrence('o1', [0], '1,00', 100), occurrence('o2', [1], '2,00', 200)]
  const both = page({
    manual,
    occurrences: { o1: { kind: 'split', into: ['m1', 'm2'] }, o2: { kind: 'split', into: ['m1', 'm2'] }, ...priced },
  })
  assert.match(validateV3Page(both, two, words, TEXT).join(), /split part m1 is named by 2 splits/)
})

test('merged parts read, joined in word order, as the whole value', () => {
  const words = [word('1,', 0), word('99', 8)]
  const cut = [occurrence('o1', [0], '1,', null), occurrence('o2', [1], '99', 99)]
  const whole = (cents: number, printed: string) =>
    page({
      products: [{ id: 'p1', anchor: 'Tee', alt: null }],
      occurrences: {
        o1: {
          kind: 'price',
          product: 'p1',
          role: 'current',
          value: { printed, cents, currency: null },
          misread: 'confirmed',
        },
        o2: { kind: 'merged', into: 'o1' },
      },
    })
  assert.deepEqual(validateV3Page(whole(199, '1,99'), cut, words, TEXT), [])
  assert.deepEqual(
    fromV3Page(whole(199, '1,99'), cut).products[0]?.prices?.map((k) => k.cents),
    [199],
  )
  assert.match(validateV3Page(whole(500, '5,00'), cut, words, TEXT).join(), /do not read, joined, as 5,00/)
})

test('a price only in the image is scored as read from the render', () => {
  const p = page({
    products: [{ id: 'p1', anchor: 'Tee', alt: null }],
    manual: {
      m1: {
        source: 'image',
        printed: '3,00 €',
        cents: 300,
        currency: 'EUR',
        box: { x: 900, y: 900, w: 10, h: 10 },
        confirmed: true,
      },
    },
    occurrences: { m1: { kind: 'price', product: 'p1', role: 'current' } },
  })
  assert.deepEqual(validateV3Page(p, [], [], TEXT), [])
  assert.equal(fromV3Page(p, []).products[0]?.prices?.[0]?.seen, true)
})

test('a missed amount cites words no occurrence holds', () => {
  const words = [word('1,00', 0)]
  const read = [occurrence('o1', [0], '1,00', 100)]
  const p = page({
    products: [{ id: 'p1', anchor: 'Tee', alt: null }],
    manual: { m1: { source: 'missed', words: [0], printed: '1,00', cents: 100, currency: null, confirmed: true } },
    occurrences: { o1: { kind: 'notPrice', reason: 'test' }, m1: { kind: 'price', product: 'p1', role: 'current' } },
  })
  assert.match(validateV3Page(p, read, words, TEXT).join(), /m1 cites words an occurrence already holds/)
})

test('an image price is told from a text price by place; manual amounts never share a word', () => {
  const words = [word('1,00', 0), word('25', 30)]
  const read = [occurrence('o1', [0], '1,00', 100)]
  const image = (box: { x: number; y: number; w: number; h: number }) =>
    page({
      manual: { m1: { source: 'image', printed: '1,00', cents: 100, currency: null, box, confirmed: true } },
      occurrences: {
        o1: { kind: 'price', product: 'p1', role: 'current' },
        m1: { kind: 'price', product: 'p2', role: 'current' },
      },
    })
  assert.deepEqual(validateV3Page(image({ x: 500, y: 500, w: 10, h: 10 }), read, words, TEXT), [])
  assert.match(
    validateV3Page(image({ x: 0, y: 0, w: 10, h: 10 }), read, words, TEXT).join(),
    /m1 sits on occurrence o1 "1,00"/,
  )
  const twice = page({
    manual: {
      m1: { source: 'missed', words: [1], printed: '25', cents: 2500, currency: null, confirmed: true },
      m2: { source: 'missed', words: [1], printed: '25', cents: 2500, currency: null, confirmed: true },
    },
    occurrences: {
      o1: { kind: 'notPrice', reason: 'test' },
      m1: { kind: 'price', product: 'p1', role: 'current' },
      m2: { kind: 'price', product: 'p2', role: 'current' },
    },
  })
  assert.match(
    validateV3Page(twice, read, words, TEXT).join(),
    /m2 cites word 1, which another manual amount also cites/,
  )
})

test('a condition is proven by the text layer, or read from the render, confirmed and judged at its place', () => {
  const read = [occurrence('o1', [0], '1,00', 100, { box: { x: 0, y: 0, w: 10, h: 10 } })]
  // "2 for" is extractable far away (another offer), or on the price's own line.
  const far = [word('1,00', 0), word('2', 500, 'f', 500), word('for', 512, 'f', 500)]
  const near = [word('1,00', 0), word('2', 12), word('for', 24)]
  const claim = (condition: unknown) =>
    page({
      products: [{ id: 'p1', anchor: 'Tee', alt: null }],
      occurrences: { o1: { kind: 'price', product: 'p1', role: 'current', conditions: [condition] } },
    })
  assert.match(
    validateV3Page(claim('2 for'), read, [word('1,00', 0)], TEXT).join(),
    /price condition "2 for" not in the text layer/,
  )
  assert.match(
    validateV3Page(claim({ text: '2 for', seen: true }), read, far, `${TEXT}2for`).join(),
    /condition "2 for" read from the render awaits Andrei's confirmation/,
  )
  const confirmed = claim({ text: '2 for', seen: true, confirmed: true })
  assert.deepEqual(validateV3Page(confirmed, read, far, `${TEXT}2for`), [])
  assert.match(
    validateV3Page(confirmed, read, near, `${TEXT}2for`).join(),
    /"2 for" of o1 is in the text layer at its place/,
  )
  assert.deepEqual(fromV3Page(confirmed, read).products[0]?.prices?.[0]?.conditions, ['2 for'])
})

test('a table cell read from the render is marked for the scorer', () => {
  const p = page({
    products: [],
    readingOrder: [[{ anchor: 'Tee', kind: 'text' }]],
    tables: [{ header: ['Name', 'Preis'], rows: [['Tee', '1,00 €']] }],
    manual: {
      m1: {
        source: 'image',
        printed: '1,00 €',
        cents: 100,
        currency: 'EUR',
        box: { x: 500, y: 500, w: 9, h: 9 },
        confirmed: true,
      },
    },
    occurrences: { m1: { kind: 'cell', table: 0, row: 0, col: 1 } },
  })
  assert.deepEqual(validateV3Page(p, [], [], TEXT), [])
  assert.deepEqual(fromV3Page(p, []).renderedRows, [[0, 0]])
})

test('an image amount on an unreadable or set-aside occurrence must correct that occurrence instead', () => {
  const words = [word('1,\ufffd9', 0)]
  const read = [occurrence('o1', [0], '1,\ufffd9', null)]
  const p = page({
    products: [{ id: 'p1', anchor: 'Tee', alt: null }],
    manual: {
      m1: {
        source: 'image',
        printed: '1,99',
        cents: 199,
        currency: null,
        box: { x: 0, y: 0, w: 10, h: 10 },
        confirmed: true,
      },
    },
    occurrences: { o1: { kind: 'notPrice', reason: 'test' }, m1: { kind: 'price', product: 'p1', role: 'current' } },
  })
  assert.match(validateV3Page(p, read, words, TEXT).join(), /m1 sits on occurrence o1/)
  const twice = page({
    manual: { m1: { source: 'missed', words: [1, 1], printed: '25', cents: 2500, currency: null, confirmed: true } },
    occurrences: { o1: { kind: 'notPrice', reason: 'test' }, m1: { kind: 'price', product: 'p1', role: 'current' } },
  })
  assert.match(validateV3Page(twice, read, [...words, word('25', 30)], TEXT).join(), /m1 cites a word twice/)
})

test('a condition read from the render puts its price under review', () => {
  const read = [occurrence('o1', [0], '1,00', 100)]
  const p = page({
    products: [{ id: 'p1', anchor: 'Tee', alt: null }],
    occurrences: {
      o1: {
        kind: 'price',
        product: 'p1',
        role: 'current',
        conditions: [{ text: '2 for', seen: true, confirmed: true }],
      },
    },
  })
  assert.equal(fromV3Page(p, read).products[0]?.prices?.[0]?.seen, true)
})
