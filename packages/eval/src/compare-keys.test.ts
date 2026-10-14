import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareKeys, type Side } from './compare-keys.ts'
import { KeyDocV3Schema } from './key-schema-v3.ts'
import { occurrence, page } from './key-v3-page-fixture.ts'
import { fromV3Page } from './key-v3.ts'

const OCCURRENCES = [occurrence('o1', [0], '1,99', 199), occurrence('o2', [1], '0,99', 99)]
const CLAIMS = {
  o1: { kind: 'price', product: 'p1', role: 'current' },
  o2: { kind: 'price', product: 'p2', role: 'current' },
}

function side(extra: Record<string, unknown> = {}): Side {
  const p = page({ occurrences: CLAIMS, ...extra })
  const raw = KeyDocV3Schema.parse({
    version: 3,
    doc: 'd',
    pdf: 'd.pdf',
    pdfSha256: 'a'.repeat(64),
    lang: 'de',
    currency: 'EUR',
    pages: [p],
  })
  return { raw, pages: [fromV3Page(p, OCCURRENCES)] }
}
const areas = (a: Side, b: Side): string[] => compareKeys(a, b).map((d) => `${d.area} ${d.at}`)

test('two writers who number the same products differently agree', () => {
  const b = side({
    products: [
      { id: 'p1', anchor: 'Milch', alt: null },
      { id: 'p2', anchor: 'Tee', alt: null },
    ],
    occurrences: {
      o1: { kind: 'price', product: 'p2', role: 'current' },
      o2: { kind: 'price', product: 'p1', role: 'current' },
    },
  })
  assert.deepEqual(areas(side(), b), [])
})

test('an anchor that only contains the other is a difference, since the scorer finds blocks by it', () => {
  const b = side({
    products: [
      { id: 'p1', anchor: 'Tee mit Zitrone', alt: null },
      { id: 'p2', anchor: 'Milch', alt: null },
    ],
  })
  assert.deepEqual(areas(side(), b), ['product p1 p1/p1 anchor'])
})

test('conditions compare as the scorer reads whole words', () => {
  const claims = (when: string) => ({ occurrences: { ...CLAIMS, o1: { ...CLAIMS.o1, conditions: [when] } } })
  assert.deepEqual(areas(side(claims('1 kg')), side(claims('1-kg'))), [])
  assert.deepEqual(areas(side(claims('1 kg')), side(claims('1kg'))), [
    'occurrence p1 o1 conditions',
    'product p1 p1/p1 scored prices',
  ])
})

test('a manual amount the writers read differently is one difference, not two missing entries', () => {
  const manual = (id: string, cents: number) => ({
    manual: { [id]: { source: 'missed', words: [0], printed: 'x', cents, currency: 'EUR' } },
    occurrences: { ...CLAIMS, [id]: { kind: 'price', product: 'p1', role: 'previous' } },
  })
  assert.deepEqual(areas(side(manual('m1', 249)), side(manual('m7', 250))), [
    'manual p1 m1/m7 cents',
    'product p1 p1/p1 scored prices',
  ])
})

test('a product the writers give different amounts is still paired, with one claim difference', () => {
  const third = occurrence('o3', [2], '2,49', 249)
  const both = (owner: string) => {
    const p = page({ occurrences: { ...CLAIMS, o3: { kind: 'price', product: owner, role: 'current' } } })
    const raw = KeyDocV3Schema.parse({ ...side().raw, pages: [p] })
    return { raw, pages: [fromV3Page(p, [...OCCURRENCES, third])] }
  }
  assert.deepEqual(areas(both('p1'), both('p2')), [
    'occurrence p1 o3 product',
    'product p1 p1/p1 scored prices',
    'product p1 p2/p2 scored prices',
  ])
})

test('hand-drawn boxes of one image amount agree', () => {
  const image = (x: number) => ({
    manual: { m1: { source: 'image', box: { x, y: 0, w: 20, h: 10 }, printed: '£2', cents: 200, currency: 'GBP' } },
    occurrences: { ...CLAIMS, m1: { kind: 'price', product: 'p1', role: 'previous' } },
  })
  assert.deepEqual(areas(side(image(0)), side(image(3))), [])
})

test('swapped columns differ; merged cells written either way agree', () => {
  const table = (header: string[], second: unknown) => ({
    tables: [
      {
        header,
        rows: [
          ['A', '1'],
          ['B', second],
        ],
      },
    ],
  })
  assert.deepEqual(areas(side(table(['Art', 'Preis'], '1')), side(table(['Art', 'Preis'], { same: 'above' }))), [])
  assert.deepEqual(areas(side(table(['Art', 'Preis'], '1')), side(table(['Preis', 'Art'], '1'))), [
    'table p1 table 0 header',
  ])
})

test('tables written in another order pair by the amounts claimed in them', () => {
  const tea = { header: ['Art', 'Preis'], rows: [['Tee', '1,99']] }
  const milk = { header: ['Sorte', 'Preis'], rows: [['Milch', '0,99']] }
  const cells = (tables: unknown[], first: number) => ({
    tables,
    occurrences: {
      o1: { kind: 'cell', table: first, row: 0, col: 1 },
      o2: { kind: 'cell', table: 1 - first, row: 0, col: 1 },
    },
  })
  assert.deepEqual(areas(side(cells([tea, milk], 0)), side(cells([milk, tea], 1))), [])
})

test('heading levels compare relative to the top heading', () => {
  const headings = (top: number) => ({
    headings: [
      { anchor: 'Tee', level: top },
      { anchor: 'Milch', level: top + 1 },
    ],
  })
  assert.deepEqual(areas(side(headings(1)), side(headings(2))), [])
})

test('keys of different snapshots are refused, not compared', () => {
  const b = side()
  const p = b.raw.pages[0]
  if (p) p.wordsSha256 = 'b'.repeat(64)
  assert.throws(() => compareKeys(side(), b), /not keys of the same evidence/)
})
