import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { keyPath, loadKey, loadKeyFile, validateKey, visibleProblems } from './keys.ts'
import { loadSplit } from './manifest.ts'
import { DOCS_DIR, WORDS_DIR } from './paths.ts'
import { snapshotDrift, snapshotWords } from './snapshot.ts'

const local = existsSync(join(DOCS_DIR, '01_billa_plus_kw41_wien.pdf'))
const split = await loadSplit()

for (const [doc, set] of Object.entries(split)) {
  const missing = !local ? 'test PDFs are local-only' : !existsSync(keyPath(doc)) && 'no key written yet'
  test(`answer key ${doc} (${set}) matches the PDF text layer`, { skip: missing }, async () => {
    const problems = await validateKey(await loadKey(doc), set)
    // A sealed key's problems would show its content to whoever runs the tests.
    if (set === 'test') assert.equal(problems.length, 0, `${String(problems.length)} problems in a sealed key`)
    else assert.deepEqual(problems, [])
  })
}

const STONE_HOUSE = '04_stonehouse_hotel_christmas_brochure_2026.pdf'
const rooms: [string, string][] = [
  ['p1', 'Cosy Double'],
  ['p2', 'Cosy Conservatory'],
  ['p3', 'Junior Suite'],
  ['p4', 'Cosy King'],
  ['p5', 'Superior Room'],
  ['p6', 'Suite: £1,225'],
  ['p7', 'Deluxe Room'],
]

// Stone House p4 written as a version-3 key: each room price is one occurrence (o1 … o7, in stream order).
async function v3Key(edit: (key: Record<string, unknown>, page: Record<string, unknown>) => void = () => undefined) {
  const { sha256 } = await snapshotWords(join(DOCS_DIR, STONE_HOUSE), 4, { dir: WORDS_DIR, doc: '04_stonehouse' })
  const page: Record<string, unknown> = {
    pdfPage: 4,
    keyPage: 1,
    type: 'pricelist',
    wordsSha256: sha256,
    readingOrder: [[{ anchor: 'Extend Your Stay', kind: 'text' }]],
    products: rooms.map(([id, anchor]) => ({ id, anchor, alt: null })),
    occurrences: Object.fromEntries(
      rooms.map(([id], i) => [`o${String(i + 1)}`, { kind: 'price', product: id, role: 'current' }]),
    ),
  }
  const key: Record<string, unknown> = {
    version: 3,
    doc: '04_stonehouse',
    pdf: STONE_HOUSE,
    lang: 'en-GB',
    currency: 'GBP',
    pages: [page],
  }
  edit(key, page)
  const path = join(await mkdtemp(join(tmpdir(), 'mia-key-')), '04_stonehouse.json')
  await writeFile(path, JSON.stringify(key))
  return loadKeyFile(path)
}
const problemsOf = async (edit?: Parameters<typeof v3Key>[0]): Promise<string> =>
  (await validateKey(await v3Key(edit), 'dev')).join('\n')

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
    const occurrences = (page: Record<string, unknown>): Record<string, unknown> =>
      typeof page.occurrences === 'object' && page.occurrences !== null ? { ...page.occurrences } : {}
    assert.match(
      await problemsOf((_, page) => {
        const o = occurrences(page)
        delete o.o7
        page.occurrences = o
      }),
      /o7 "£1,180" is not claimed/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...occurrences(page), o1: { kind: 'price', product: 'p9', role: 'current' } }
      }),
      /unknown product "p9"/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = {
          ...occurrences(page),
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
        page.occurrences = { ...occurrences(page), o1: override }
      }),
      /overrides a readable value/,
    )
    assert.doesNotMatch(
      await problemsOf((_, page) => {
        page.occurrences = { ...occurrences(page), o1: { ...override, misread: 'confirmed' } }
      }),
      /overrides/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...occurrences(page), o1: { kind: 'notPrice', reason: 'test' } }
      }),
      /product p1 has no price/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.wordsSha256 = '0'.repeat(64)
      }),
      /word snapshot is not the one/,
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

const claims = (page: Record<string, unknown>): Record<string, unknown> =>
  typeof page.occurrences === 'object' && page.occurrences !== null ? { ...page.occurrences } : {}
const products = (page: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(page.products)
    ? page.products.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    : []

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
  'misreads stay open until confirmed; an open role needs a reason; seen prices and conditions are checked',
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
        page.occurrences = { ...claims(page), o1: { kind: 'notPrice', reason: 'test' } }
        page.products = products(page).map((p) => (p.id === 'p1' ? { ...p, seen: [{ ...value, role: 'current' }] } : p))
      }),
      /p1 seen price "£1,040" is in the text layer/,
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
  },
)

test('a sealed key prints only its problem count unless details are asked for', () => {
  assert.deepEqual(visibleProblems(['p1: price "£9" wrong'], true, false), ['1 problems'])
  assert.deepEqual(visibleProblems(['p1: price "£9" wrong'], true, true), ['p1: price "£9" wrong', '1 problems'])
  assert.deepEqual(visibleProblems([], false, false), ['key valid'])
})

test('the word snapshot of a keyed page matches what Poppler reads now', { skip: !local && 'local only' }, async () => {
  assert.equal(await snapshotDrift(join(DOCS_DIR, STONE_HOUSE), 4, { dir: WORDS_DIR, doc: '04_stonehouse' }), false)
})
