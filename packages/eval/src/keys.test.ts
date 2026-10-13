import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadKey, validateKey, type KeyPrice } from './keys.ts'
import { DOCS_DIR } from './paths.ts'

const local = existsSync(join(DOCS_DIR, '01_billa_plus_kw41_wien.pdf'))

for (const doc of ['01_billa', '02_pollin', '03_honda', '04_stonehouse', '05_bannatyne']) {
  test(`answer key ${doc} matches the PDF text layer`, { skip: !local && 'test PDFs are local-only' }, async () => {
    assert.deepEqual(await validateKey(await loadKey(doc)), [])
  })
}

test(
  'key validation checks printed prices, currencies and new-key rules',
  { skip: !local && 'test PDFs are local-only' },
  async () => {
    const key = await loadKey('04_stonehouse')
    const page = key.pages.find((p) => p.keyPage === 4)
    const room = page?.products[0]
    if (!page || !room) throw new Error('Stone House p4 is missing from the key')
    const price: KeyPrice = { printed: '£1,040', cents: 104000, role: 'current', currency: 'GBP', optional: false }
    const withPrices = (p: KeyPrice): typeof key => ({
      ...key,
      pages: [{ ...page, products: [{ ...room, money: undefined, prices: [p] }] }],
    })
    assert.deepEqual(await validateKey(withPrices(price), 'dev'), [])
    assert.match((await validateKey(withPrices({ ...price, cents: 104100 }), 'dev')).join(), /does not read as 104100/)
    assert.match((await validateKey(withPrices({ ...price, printed: '£1,041' }), 'dev')).join(), /not printed/)
    assert.match((await validateKey(withPrices({ ...price, currency: 'EUR' }), 'dev')).join(), /is GBP, keyed EUR/)
    assert.match((await validateKey({ ...key, pages: [page] }, 'dev')).join(), /stage-0 money fields/)
  },
)
