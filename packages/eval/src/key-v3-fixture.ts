import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ledgerSha256 } from './key-v3.ts'
import { loadKeyFile, validateKey } from './keys.ts'
import { ledger } from './ledger.ts'
import { DOCS_DIR, WORDS_DIR } from './paths.ts'
import { snapshotWords } from './snapshot.ts'

// Test fixture: Stone House p4 (a tuning page) written as a version-3 key, edited per test.
export const local = existsSync(join(DOCS_DIR, '01_billa_plus_kw41_wien.pdf'))
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
export async function v3Key(
  edit: (key: Record<string, unknown>, page: Record<string, unknown>) => void = () => undefined,
) {
  const { words, sha256 } = await snapshotWords(join(DOCS_DIR, STONE_HOUSE), 4, {
    dir: WORDS_DIR,
    doc: '04_stonehouse',
  })
  const page: Record<string, unknown> = {
    pdfPage: 4,
    keyPage: 1,
    type: 'pricelist',
    wordsSha256: sha256,
    ledgerSha256: ledgerSha256(ledger(words)),
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
    pdfSha256: createHash('sha256')
      .update(await readFile(join(DOCS_DIR, STONE_HOUSE)))
      .digest('hex'),
    lang: 'en-GB',
    currency: 'GBP',
    pages: [page],
  }
  edit(key, page)
  const path = join(await mkdtemp(join(tmpdir(), 'mia-key-')), '04_stonehouse.json')
  await writeFile(path, JSON.stringify(key))
  return loadKeyFile(path)
}
export const problemsOf = async (edit?: Parameters<typeof v3Key>[0]): Promise<string> =>
  (await validateKey(await v3Key(edit), 'dev')).join('\n')

export const claims = (page: Record<string, unknown>): Record<string, unknown> =>
  typeof page.occurrences === 'object' && page.occurrences !== null ? { ...page.occurrences } : {}
export const products = (page: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(page.products)
    ? page.products.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    : []
