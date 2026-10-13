import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eur, list, price, product, score } from './rules-fixture.ts'

test('a price that belongs to no product may be published as a product once per print', async () => {
  const key = { textPrices: [eur(100, 'current')] }
  assert.equal((await score(key, list(product('Alles', price('current', '1,00 €'))))).c2.errorProducts, 0)
  const twice = await score(
    key,
    list(product('Alles', price('current', '1,00 €')), product('Nochmal', price('current', '1,00 €'))),
  )
  assert.equal(twice.c2.errorProducts, 1)
})

test('a price that belongs to no product must be published; an invented unit price is extra on a complete key', async () => {
  const key = { textPrices: [eur(100, 'current')] }
  assert.match((await score(key, '<p>Alles 2,00 €</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.deepEqual((await score(key, '<p>Alles 1,00 €</p>')).c2.errors, [])
  const unit = { products: [{ anchor: 'Tee', alt: null, prices: [eur(199, 'current')] }] }
  const invented = await score(unit, list(product('Tee', price('current', '1,99 €'), price('unit', '9,99 €', '1 kg'))))
  assert.match(invented.c2.errors.join(' '), /extra 999/)
})

test('a page price needs its amount, currency and offer words in one block', async () => {
  const offer = { textPrices: [{ ...eur(100, 'current'), conditions: ['Alles für'] }] }
  assert.deepEqual((await score(offer, '<p>Alles für 1,00 €</p>')).c2.errors, [])
  assert.match((await score(offer, '<p>Alles</p><p>1,00 €</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.match((await score(offer, '<p>Alles für 1,00 CHF</p>')).c2.errors.join(' '), /page price 1,00 missing/)
})

test('identical page prices take one block each; one without a currency or read from the render is flagged', async () => {
  const two = {
    textPrices: [
      { ...eur(100, 'current'), conditions: ['Alles für'] },
      { ...eur(100, 'current'), conditions: ['Kinder essen'] },
    ],
  }
  assert.deepEqual((await score(two, '<p>Alles für 1,00 €</p><p>Kinder essen 1,00 €</p>')).c2.errors, [])
  const bare = { textPrices: [{ ...eur(100, 'current'), currency: null, conditions: ['Alles'] }] }
  assert.match((await score(bare, '<p>Alles 1,00 CHF</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.deepEqual((await score(bare, '<p data-review>Alles 1,00 CHF</p>')).c2.errors, [])
  const seen = { textPrices: [{ ...eur(100, 'current'), seen: true, conditions: ['Alles'] }] }
  assert.match((await score(seen, '<p>Alles 1,00 €</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.deepEqual(
    (await score(seen, '<figure data-review><img src="x.jpg" alt="Alles 1,00 €"></figure>')).c2.errors,
    [],
  )
})

test('two page prices in one sentence each take their own amount; a table row read from the render is flagged', async () => {
  const sentence = {
    textPrices: [
      { ...eur(300, 'current'), conditions: ['plus'] },
      { ...eur(60, 'current'), conditions: ['for each item'] },
    ],
  }
  assert.deepEqual((await score(sentence, '<p>3,00 € plus 0,60 € for each item</p>')).c2.errors, [])
  const rendered = { tables: [{ header: ['Name', 'Preis'], rows: [['Tee', '1,00 €']] }], renderedRows: [[0, 0]] }
  const table = (flag: string): string =>
    `<table><tr><th scope="col">Name</th><th scope="col">Preis</th></tr><tr${flag}><td>Tee</td><td>1,00 €</td></tr></table>`
  const silent = await score(rendered, table(''))
  assert.equal(silent.c5.silentRows, 1)
  assert.equal((await score(rendered, table(' data-review'))).c5.rowsOk, 1)
})

test('a flagged page price is not taken by a product shown unflagged; the most specific page price chooses first', async () => {
  const seen = {
    products: [{ anchor: 'Tee', alt: null, prices: [eur(100, 'current')] }],
    textPrices: [{ ...eur(100, 'current'), seen: true }],
  }
  const body = `${list(product('Tee', price('current', '1,00 €')))}<p data-review>1,00 €</p>`
  assert.deepEqual((await score(seen, body)).c2.errors, [])
  const specific = { textPrices: [eur(100, 'current'), { ...eur(100, 'current'), conditions: ['Everything'] }] }
  assert.deepEqual((await score(specific, '<p>Everything 1,00 €</p><p>Delivery 1,00 €</p>')).c2.errors, [])
})
