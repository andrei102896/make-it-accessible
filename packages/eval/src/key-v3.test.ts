import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { claims, local, problemsOf, products, v3Key } from './key-v3-fixture.ts'
import { keyPath, loadKey, loadKeyFile, validateKey } from './keys.ts'

test(
  'a version-3 key claims every occurrence once and becomes per-product prices',
  { skip: !local && 'local only' },
  async () => {
    const key = await v3Key()
    assert.deepEqual(await validateKey(key, 'dev'), [])
    const suite = key.pages[0]?.products.find((p) => p.id === 'p6')
    assert.deepEqual(suite?.prices, [
      { printed: '£1,225', cents: 122500, role: 'current', currency: 'GBP', conditions: [] },
    ])
  },
)

test(
  'version-3 validation rejects unclaimed, unknown, overridden and miscurrencied claims',
  { skip: !local && 'local only' },
  async () => {
    assert.match(
      await problemsOf((_, page) => {
        const o = claims(page)
        delete o.o7
        page.occurrences = o
      }),
      /o7 "£1,180" is not claimed/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...claims(page), o1: { kind: 'price', product: 'p9', role: 'current' } }
      }),
      /unknown product "p9"/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = {
          ...claims(page),
          o1: { kind: 'price', product: 'p1', role: 'current', currency: 'EUR' },
        }
      }),
      /prints GBP, claimed EUR/,
    )
    const override = {
      kind: 'price',
      product: 'p1',
      role: 'current',
      value: { printed: '£1,040', cents: 104000, currency: 'GBP' },
    }
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...claims(page), o1: override }
      }),
      /overrides a readable value/,
    )
    assert.doesNotMatch(
      await problemsOf((_, page) => {
        page.occurrences = { ...claims(page), o1: { ...override, misread: 'confirmed' } }
      }),
      /overrides/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...claims(page), o1: { kind: 'notPrice', reason: 'test' } }
      }),
      /product p1 has no price/,
    )
    // Every reader of a key loads it through the same checks, so a moved snapshot, ledger or PDF stops the load.
    await assert.rejects(
      v3Key((_, page) => {
        page.wordsSha256 = '0'.repeat(64)
      }),
      /word snapshot is not the one/,
    )
    await assert.rejects(
      v3Key((_, page) => {
        page.ledgerSha256 = '0'.repeat(64)
      }),
      /segments this page differently; migrate the key explicitly/,
    )
    await assert.rejects(
      v3Key((key) => {
        key.pdfSha256 = '0'.repeat(64)
      }),
      /the PDF is not the one/,
    )
  },
)

test(
  'anchors are unique, every key page is in each section order, open disputes block',
  { skip: !local && 'local only' },
  async () => {
    assert.match(
      await problemsOf((_, page) => {
        page.readingOrder = [[{ anchor: 'Cosy', kind: 'text' }]]
      }),
      /reading-order anchor "Cosy" occurs \d+ times/,
    )
    assert.match(
      await problemsOf((key) => {
        key.sections = [{ keyPage: 1, label: '4' }]
        key.sectionOrders = [[]]
      }),
      /key page 1 is missing from a section order/,
    )
    assert.match(
      await problemsOf((key) => {
        key.disputes = [{ keyPage: 1, note: 'unsure' }]
      }),
      /open dispute: unsure/,
    )
    assert.match((await validateKey(await loadKey('04_stonehouse'), 'dev')).join(), /dev and test keys use version 3/)
  },
)

test(
  'table cells: a price cell claims each amount once, a claim names a written cell it reads as',
  { skip: !local && 'local only' },
  async () => {
    const asCell =
      (cells: unknown[], second?: unknown) =>
      (_: Record<string, unknown>, page: Record<string, unknown>): void => {
        page.products = products(page).filter((p) => p.id !== 'p1')
        page.tables = [{ header: ['Room', 'Price'], rows: [['Cosy Double', ...cells]] }]
        page.occurrences = {
          ...claims(page),
          o1: { kind: 'cell', table: 0, row: 0, col: 1 },
          ...(second ? { o2: second } : {}),
        }
      }
    assert.equal(await problemsOf(asCell(['£1,040'])), '')
    assert.match(await problemsOf(asCell(['£1,041'])), /o1 "£1,040" does not read as cell 0\.0\.1/)
    assert.match(
      await problemsOf(asCell([{ unchecked: 'picture' }])),
      /cell 0\.0\.1 is not a written cell but is claimed/,
    )
    assert.match(
      await problemsOf(asCell(['£1,040'], { kind: 'cell', table: 0, row: 0, col: 1 })),
      /cell 0\.0\.1 "£1,040" has 1 amounts, claimed 2/,
    )
    assert.match(
      await problemsOf((key, page) => {
        asCell(['£1,040'])(key, page)
        page.tables = [{ header: ['Room', 'Price'], rows: [[{ same: 'above' }, '£1,040']] }]
      }),
      /cell 0\.0\.0 repeats a neighbour it does not have/,
    )
  },
)

test(
  'misreads stay open until confirmed; an open role needs a reason; image prices and conditions are checked',
  { skip: !local && 'local only' },
  async () => {
    const value = { printed: '£1,040', cents: 104000, currency: 'GBP' }
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = {
          ...claims(page),
          o1: { kind: 'price', product: 'p1', role: 'current', value, misread: 'open' },
        }
      }),
      /o1 "£1,040" overrides a readable value/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...claims(page), o1: { kind: 'text', value } }
        page.products = [...products(page).filter((p) => p.id !== 'p1')]
      }),
      /o1 "£1,040" overrides a readable value/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...claims(page), o1: { kind: 'price', product: 'p1', role: 'unknown' } }
      }),
      /o1 leaves the role open without a reason/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.manual = { m1: { source: 'image', ...value, box: { x: 0, y: 0, w: 2000, h: 2000 }, confirmed: true } }
        page.occurrences = {
          ...claims(page),
          o1: { kind: 'notPrice', reason: 'test' },
          m1: { kind: 'price', product: 'p1', role: 'current' },
        }
      }),
      /m1 sits on occurrence o1 "£1,040"/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = {
          ...claims(page),
          o1: { kind: 'price', product: 'p1', role: 'current', conditions: ['Clubcard'] },
        }
      }),
      /price condition "Clubcard" not in the text layer/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.products = [...products(page), { id: 'p1', anchor: 'Extend Your Stay', alt: null, parent: 'p0' }]
      }),
      /product id "p1" is not unique[\s\S]*names unknown parent "p0"/,
    )
  },
)

test(
  'printed pages name a product anchor; section orders need sections; stage-0 files reject version-3 fields',
  { skip: !local && 'local only' },
  async () => {
    assert.match(
      await problemsOf((key) => {
        key.sections = [{ keyPage: 1, label: '4', anchors: ['Extend Your Stay'] }]
      }),
      /no printed page of it names a product anchor/,
    )
    assert.match(
      await problemsOf((key) => {
        key.sectionOrders = [[{ keyPage: 1, label: '4' }]]
      }),
      /sectionOrders without sections/,
    )
    const legacy = await readFile(keyPath('04_stonehouse'), 'utf8')
    const path = join(await mkdtemp(join(tmpdir(), 'mia-legacy-')), 'k.json')
    const withStrict = JSON.stringify(JSON.parse(legacy)).replace('"keyPage":4', '"keyPage":4,"strict":true')
    await writeFile(path, withStrict)
    await assert.rejects(loadKeyFile(path), /stage-0 key uses version-3 fields/)
    await writeFile(
      path,
      JSON.stringify(JSON.parse(legacy)).replace('"keyPage":4', '"keyPage":4,"renderedRows":[[0,0]]'),
    )
    await assert.rejects(loadKeyFile(path), /stage-0 key uses version-3 fields/)
  },
)
