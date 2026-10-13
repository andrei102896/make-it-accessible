import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateV3Page } from './key-v3-check.ts'
import { fromV3Page } from './key-v3.ts'
import { KeyDocV3Schema } from './key-schema-v3.ts'
import type { Occurrence } from './ledger.ts'
import type { Word } from './words.ts'

const SHA = 'a'.repeat(64)
const word = (str: string, x: number): Word => ({ str, x, y: 0, w: 10, h: 10, line: 'l' })
const occurrence = (id: string, words: number[], text: string, cents: number | null): Occurrence => ({
  id,
  words,
  text,
  cents,
  currency: null,
  unreadable: cents === null,
  box: { x: 0, y: 0, w: 1, h: 1 },
})
function page(extra: Record<string, unknown>) {
  const [p] = KeyDocV3Schema.parse({
    version: 3,
    doc: 'd',
    pdf: 'd.pdf',
    pdfSha256: SHA,
    lang: 'de',
    currency: 'EUR',
    pages: [
      {
        pdfPage: 1,
        keyPage: 1,
        type: 'grid',
        wordsSha256: SHA,
        ledgerSha256: SHA,
        readingOrder: [[{ anchor: 'Tee', kind: 'text' }]],
        products: [
          { id: 'p1', anchor: 'Tee', alt: null },
          { id: 'p2', anchor: 'Milch', alt: null },
        ],
        ...extra,
      },
    ],
  }).pages
  if (!p) throw new Error('no page')
  return p
}
const TEXT = 'teemilch'
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
    manual: { m1: { source: 'image', printed: '3,00 €', cents: 300, currency: 'EUR', confirmed: true } },
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
