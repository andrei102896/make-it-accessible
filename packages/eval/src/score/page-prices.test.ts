import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eur, list, offer, price, product, score } from './rules-fixture.ts'

test('a price that belongs to no product may be published as a product once per print, its offer split by the markup', async () => {
  const key = { textPrices: [offer(100, 'Alles für 1,00 €')] }
  assert.equal((await score(key, list(product('Alles für', price('current', '1,00 €'))))).c2.errorProducts, 0)
  const twice = await score(
    key,
    list(product('Alles für', price('current', '1,00 €')), product('Nochmal', price('current', '1,00 €'))),
  )
  assert.equal(twice.c2.errorProducts, 1)
})

test('a price that belongs to no product must be published; an invented unit price is extra on a complete key', async () => {
  const key = { textPrices: [offer(100, '1,00 €')] }
  assert.match((await score(key, '<p>Alles 2,00 €</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.deepEqual((await score(key, '<p>Alles 1,00 €</p>')).c2.errors, [])
  const unit = { products: [{ anchor: 'Tee', alt: null, prices: [eur(199, 'current')] }] }
  const invented = await score(unit, list(product('Tee', price('current', '1,99 €'), price('unit', '9,99 €', '1 kg'))))
  assert.match(invented.c2.errors.join(' '), /extra 999/)
})

test('a page price needs its offer word for word in one block, amounts by value, not negated', async () => {
  const key = { textPrices: [offer(100, 'Alles für 1,00 €')] }
  assert.deepEqual((await score(key, '<p>Alles für 1 €!</p>')).c2.errors, [])
  for (const wrong of ['<p>Alles</p><p>1,00 €</p>', '<p>Alles für 1,00 CHF</p>', '<p>Kein Alles für 1,00 €</p>'])
    assert.match((await score(key, wrong)).c2.errors.join(' '), /page price 1,00 missing/, wrong)
  const discount = { textPrices: [{ ...offer(-140, 'Spare -1,40 €'), printed: '-1,40 €' }] }
  assert.deepEqual((await score(discount, '<p>Spare −1,40 €</p>')).c2.errors, [])
  assert.match((await score(discount, '<p>Spare 1,40 €</p>')).c2.errors.join(' '), /missing/)
})

test('two page prices of one offer keep their order: a swap fails, in one sentence or across merged blocks', async () => {
  const sentence = '£3.00 plus 60p for each item'
  const gbp = (cents: number, printed: string, words: string) => ({ ...offer(cents, words), printed, currency: 'GBP' })
  const shared = { textPrices: [gbp(300, '£3.00', sentence), gbp(60, '60p', sentence)] }
  assert.deepEqual((await score(shared, '<p>£3 plus £0.60 for each item</p>')).c2.errors, [])
  assert.equal((await score(shared, '<p>60p plus £3.00 for each item</p>')).c2.silent, 2)
  assert.equal((await score(shared, '<p>£3.00 for each item plus 60p</p>')).c2.silent, 2)
  const apart = { textPrices: [gbp(300, '£3.00', 'Delivery £3.00'), gbp(60, '60p', 'Each extra item 60p')] }
  assert.deepEqual((await score(apart, '<p>Delivery £3.00.</p><p>Each extra item 60p</p>')).c2.errors, [])
  assert.equal((await score(apart, '<p>Delivery 60p. Each extra item £3.00</p>')).c2.silent, 2)
  const equal = {
    textPrices: [gbp(100, '£1', '£1 delivery plus £1 per item'), gbp(100, '£1', '£1 delivery plus £1 per item')],
  }
  assert.deepEqual((await score(equal, '<p>£1 delivery plus £1 per item</p>')).c2.errors, [])
})

test('identical page prices take one block each; one without a currency or read from the render is flagged', async () => {
  const two = { textPrices: [offer(100, 'Alles für 1,00 €'), offer(100, 'Kinder essen 1,00 €')] }
  assert.deepEqual((await score(two, '<p>Alles für 1,00 €</p><p>Kinder essen 1,00 €</p>')).c2.errors, [])
  const bare = { textPrices: [offer(100, 'Alles 1,00', { currency: null })] }
  assert.match((await score(bare, '<p>Alles 1,00 CHF</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.deepEqual((await score(bare, '<p data-review>Alles 1,00 CHF</p>')).c2.errors, [])
  const seen = { textPrices: [offer(100, 'Alles 1,00 €', { seen: true })] }
  assert.match((await score(seen, '<p>Alles 1,00 €</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.deepEqual(
    (await score(seen, '<figure data-review><img src="x.jpg" alt="Alles 1,00 €"></figure>')).c2.errors,
    [],
  )
})

test('a table row read from the render is flagged', async () => {
  const rendered = { tables: [{ header: ['Name', 'Preis'], rows: [['Tee', '1,00 €']] }], renderedRows: [[0, 0]] }
  const table = (flag: string): string =>
    `<table><tr><th scope="col">Name</th><th scope="col">Preis</th></tr><tr${flag}><td>Tee</td><td>1,00 €</td></tr></table>`
  const silent = await score(rendered, table(''))
  assert.equal(silent.c5.silentRows, 1)
  assert.equal((await score(rendered, table(' data-review'))).c5.rowsOk, 1)
})

test('a flagged page price is not taken by a product shown unflagged; the longest offer chooses first', async () => {
  const seen = {
    products: [{ anchor: 'Tee', alt: null, prices: [eur(100, 'current')] }],
    textPrices: [offer(100, '1,00 €', { seen: true })],
  }
  const body = `${list(product('Tee', price('current', '1,00 €')))}<p data-review>1,00 €</p>`
  assert.deepEqual((await score(seen, body)).c2.errors, [])
  const specific = { textPrices: [offer(100, '1,00 €'), offer(100, 'Everything 1,00 €')] }
  assert.deepEqual((await score(specific, '<p>Everything 1,00 €</p><p>Delivery 1,00 €</p>')).c2.errors, [])
})

test('an offer with Swiss or space thousands or a pence minus scores as printed', async () => {
  const chf = { textPrices: [offer(120000, 'Jahresabo CHF 1’200', { currency: 'CHF', printed: 'CHF 1’200' })] }
  assert.deepEqual((await score(chf, '<p>Jahresabo CHF 1’200.00</p>')).c2.errors, [])
  assert.match((await score(chf, '<p>Jahresabo CHF 1.00</p>')).c2.errors.join(' '), /missing/)
  const gbp = { textPrices: [offer(750000, 'Deposit £7 500', { currency: 'GBP', printed: '£7 500' })] }
  assert.deepEqual((await score(gbp, '<p>Deposit £7,500</p>')).c2.errors, [])
  const pence = { textPrices: [offer(-60, 'Refill -60p', { currency: 'GBP', printed: '-60p', role: 'discount' })] }
  assert.deepEqual((await score(pence, '<p>Refill -60p</p>')).c2.errors, [])
  assert.match((await score(pence, '<p>Refill 60p</p>')).c2.errors.join(' '), /missing/)
})

test('a repeated heading is scored by its n-th occurrence in reading order', async () => {
  const key = {
    headings: [
      { anchor: 'Optional Extras', level: 2 },
      { anchor: 'Optional Extras', level: 3, occurrence: 2 },
    ],
  }
  const body = (second: string): string => `<h3>Optional Extras</h3><p>a</p><${second}>Optional Extras</${second}>`
  assert.equal((await score(key, body('h4'))).c5.headingsOk, 2)
  assert.equal((await score(key, body('h3'))).c5.headingsOk, 1)
})
