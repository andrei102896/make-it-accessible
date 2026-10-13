import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { KeyDocSchema } from '../key-schema.ts'
import type { KeyDoc } from '../keys.ts'
import { scoreDocument } from './score.ts'
import type { PageScore } from './types.ts'

const price = (role: string, text: string, qualifier = '', flag = ''): string =>
  `<span class="price" data-role="${role}"${flag}>${qualifier ? `<span class="qualifier">${qualifier}</span> ` : ''}${text}</span>`
const product = (name: string, ...prices: string[]): string =>
  `<li><p class="name">${name}</p><p>${prices.join(' ')}</p></li>`

async function score(page: Record<string, unknown>, body: string): Promise<PageScore> {
  const key: KeyDoc = {
    ...KeyDocSchema.parse({
      doc: 'rules',
      pdf: 'none.pdf',
      lang: 'de',
      currency: 'EUR',
      pages: [
        {
          pdfPage: 1,
          keyPage: 1,
          type: 'grid',
          strict: true,
          readingOrder: [[{ anchor: 'Top', kind: 'text' }]],
          ...page,
        },
      ],
    }),
    pdfPath: '',
  }
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>T</title></head><body><main><h1>T</h1><section aria-labelledby="a" data-page="1"><h2 id="a">Seite 1</h2><p>Top</p>${body}</section></main></body></html>`
  const path = join(await mkdtemp(join(tmpdir(), 'mia-rules-')), 'index.html')
  await writeFile(path, html)
  const [result] = (await scoreDocument(path, key, [1])).pages
  if (!result) throw new Error('no page score')
  return result
}
const eur = (cents: number, role: string, conditions: string[] = []): Record<string, unknown> => ({
  printed: (cents / 100).toFixed(2).replace('.', ','),
  cents,
  role,
  currency: 'EUR',
  conditions,
})
const list = (...items: string[]): string => `<ul class="products" role="list">${items.join('')}</ul>`
const plus = {
  products: [{ anchor: 'Kaffee', alt: null, prices: [eur(199, 'current', ['Lidl Plus']), eur(249, 'unknown')] }],
}

test('a card condition must sit on its own price, not negated, not on the other price', async () => {
  const right = await score(
    plus,
    list(product('Kaffee', price('current', '1,99 €', 'Mit Lidl Plus'), price('current', '2,49 €'))),
  )
  assert.deepEqual(right.c2.errors, [])
  assert.equal(right.c2.unverified, 1)
  const swapped = await score(
    plus,
    list(product('Kaffee', price('current', '1,99 €'), price('current', '2,49 €', 'Lidl Plus'))),
  )
  assert.match(swapped.c2.errors.join(' '), /1,99 lacks "Lidl Plus".*carries another price's condition/)
  const negated = await score(
    plus,
    list(product('Kaffee', price('current', '1,99 €', 'ohne Lidl Plus'), price('current', '2,49 €'))),
  )
  assert.match(negated.c2.errors.join(' '), /lacks "Lidl Plus"/)
})

test('a previous unit price needs both of its conditions; a deposit needs its own', async () => {
  const key = {
    products: [
      { anchor: 'Käse', alt: null, prices: [eur(999, 'unit', ['1 kg']), eur(1299, 'previousUnit', ['statt', '1 kg'])] },
    ],
  }
  const good = await score(
    key,
    list(product('Käse', price('unit', '9,99 €', '1 kg'), price('previous', '12,99 €', 'statt 1 kg'))),
  )
  assert.deepEqual(good.c2.errors, [])
  const bare = await score(
    key,
    list(product('Käse', price('unit', '9,99 €', '1 kg'), price('unit', '12,99 €', '1 kg'))),
  )
  assert.match(bare.c2.errors.join(' '), /12,99 lacks "statt"/)
  const deposit = { products: [{ anchor: 'Wasser', alt: null, prices: [eur(25, 'deposit', ['Pfand'])] }] }
  assert.deepEqual(
    (await score(deposit, list(product('Wasser', price('current', '0,25 €', 'zzgl. Pfand'))))).c2.errors,
    [],
  )
})

test('strict tables: an empty cell stays empty, headers are compared, rows match one to one', async () => {
  const key = {
    tables: [
      {
        header: ['Modell', 'Preis'],
        rows: [
          ['A', ''],
          ['A', ''],
        ],
      },
    ],
  }
  const table = (cells: string): string =>
    `<table><tr><th scope="col">Modell</th><th scope="col">Preis</th></tr>${cells}</table>`
  const filled = await score(key, table('<tr><td>A</td><td>999 €</td></tr><tr><td>A</td><td></td></tr>'))
  assert.equal(filled.c5.rowsOk, 1)
  const one = await score(key, table('<tr><td>A</td><td></td></tr>'))
  assert.equal(one.c5.rowsOk, 1)
  const header = await score(
    key,
    `<table><tr><th scope="col">Modell</th><th scope="col">Größe</th></tr><tr><td>A</td><td></td></tr><tr><td>A</td><td></td></tr></table>`,
  )
  assert.equal(header.c5.rowsOk, 2)
  assert.equal(header.pass.c5, false)
})

test('an add-on may sit inside its parent; the parent still needs its own price', async () => {
  const key = {
    products: [
      { id: 'g', anchor: 'Grill', alt: null, prices: [eur(4999, 'current')] },
      { id: 'a', parent: 'g', anchor: 'Abdeckung', alt: null, prices: [eur(1999, 'current')] },
    ],
  }
  const nested = `<li><p class="name">Grill</p><p>${price('current', '49,99 €')}</p>${list(product('Abdeckung', price('current', '19,99 €')))}</li>`
  assert.deepEqual((await score(key, list(nested))).c2.errors, [])
  const inside = await score(
    key,
    list(product('Grill Abdeckung', price('current', '49,99 €'), price('current', '19,99 €'))),
  )
  assert.deepEqual(inside.c2.errors, [])
  const lost = `<li><p class="name">Grill</p>${list(product('Abdeckung', price('current', '49,99 €')))}</li>`
  assert.match((await score(key, list(lost))).c2.errors.join(' '), /Grill: missing 49,99/)
})

test('a price that belongs to no product may be published as a product once per print', async () => {
  const key = { textPrices: [eur(100, 'current')] }
  assert.equal((await score(key, list(product('Alles', price('current', '1,00 €'))))).c2.errorProducts, 0)
  const twice = await score(
    key,
    list(product('Alles', price('current', '1,00 €')), product('Nochmal', price('current', '1,00 €'))),
  )
  assert.equal(twice.c2.errorProducts, 1)
})

test('order inside one block counts, and a negated alt text does not name the product', async () => {
  const order = {
    readingOrder: [
      [
        { anchor: 'Alpha', kind: 'text' },
        { anchor: 'Beta', kind: 'text' },
      ],
    ],
  }
  assert.equal((await score(order, '<p>Beta Alpha</p>')).c1.textOnly, 0.5)
  const peas = { products: [{ anchor: 'Erbsen', alt: 'Erbsen', prices: [eur(99, 'current')] }] }
  const pictured = (alt: string): string =>
    list(`<li><p class="name">Erbsen</p><p>${price('current', '0,99 €')}</p><img src="x.jpg" alt="${alt}"></li>`)
  assert.equal((await score(peas, pictured('Dose Erbsen'))).c4.ok, 1)
  assert.equal((await score(peas, pictured('Keine Erbsen abgebildet'))).c4.ok, 0)
})

test('a price that belongs to no product must be published; an invented unit price is extra on a complete key', async () => {
  const key = { textPrices: [eur(100, 'current')] }
  assert.match((await score(key, '<p>Alles 2,00 €</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.deepEqual((await score(key, '<p>Alles 1,00 €</p>')).c2.errors, [])
  const unit = { products: [{ anchor: 'Tee', alt: null, prices: [eur(199, 'current')] }] }
  const invented = await score(unit, list(product('Tee', price('current', '1,99 €'), price('unit', '9,99 €', '1 kg'))))
  assert.match(invented.c2.errors.join(' '), /extra 999/)
})

test('a flagged neighbour does not flag an unflagged image price', async () => {
  const seen = {
    products: [
      { anchor: 'Rad', alt: null, prices: [{ ...eur(1999, 'current'), seen: true }, eur(99, 'unit', ['1 kg'])] },
    ],
  }
  const result = await score(
    seen,
    list(product('Rad', price('current', '19,99 €'), price('unit', '0,99 €', '1 kg', ' data-review'))),
  )
  assert.equal(result.c2.silent, 1)
})

test('an add-on published on its own is the one after its parent, before the next parent', async () => {
  const key = {
    products: [
      { id: 'a', anchor: 'Rösti', alt: null, prices: [eur(500, 'current')] },
      { id: 'b', anchor: 'Burger', alt: null, prices: [eur(900, 'current')] },
      { id: 'a1', parent: 'a', anchor: 'Add bacon', alt: null, prices: [eur(60, 'current')] },
      { id: 'b1', parent: 'b', anchor: 'Add bacon', alt: null, prices: [eur(80, 'current')] },
    ],
  }
  const body = list(
    product('Rösti', price('current', '5,00 €')),
    product('Add bacon rashers', price('current', '0,60 €')),
    product('Burger', price('current', '9,00 €')),
    product('Add bacon', price('current', '0,80 €')),
  )
  assert.deepEqual((await score(key, body)).c2.errors, [])
})

test('strict tables keep empty columns, read headers above the body, and give each output table one key table', async () => {
  const table = (head: string, body: string): string => `<table><tr>${head}</tr>${body}</table>`
  const th = (...h: string[]): string => h.map((x) => `<th scope="col">${x}</th>`).join('')
  const swallowed = await score(
    { tables: [{ header: ['Modell', 'Farbe', 'Preis'], rows: [['X1', '', '5,00 €']] }] },
    table(th('Modell', 'Farbe', 'Preis'), '<tr><td>X1</td><td>5,00 €</td></tr>'),
  )
  assert.equal(swallowed.c5.rowsOk, 0)
  const section = await score(
    { tables: [{ header: ['Modell', 'Preis'], rows: [['X1', '5,00 €']] }] },
    table(th('Modell', 'Preis'), '<tr><th colspan="2">Wohnwagen</th></tr><tr><td>X1</td><td>5,00 €</td></tr>'),
  )
  assert.deepEqual(section.c5.headerErrors, [])
  const two = await score(
    {
      tables: [
        { header: ['A', 'B'], rows: [['1', 'x']] },
        { header: ['A', 'B'], rows: [['2', 'y']] },
      ],
    },
    table(th('A', 'B'), '<tr><td>1</td><td>x</td></tr><tr><td>2</td><td>y</td></tr>'),
  )
  assert.equal(two.c5.rowsOk, 1)
  const specific = await score(
    {
      tables: [
        {
          header: ['Modell', 'Preis'],
          rows: [
            [null, '5,00 €'],
            ['X2', '5,00 €'],
          ],
        },
      ],
    },
    table(th('Modell', 'Preis'), '<tr><td>X2</td><td>5,00 €</td></tr><tr><td>Bild</td><td>5,00 €</td></tr>'),
  )
  assert.equal(specific.c5.rowsOk, 2)
})

test('a page price needs its amount, currency and offer words in one block', async () => {
  const offer = { textPrices: [{ ...eur(100, 'current'), conditions: ['Alles für'] }] }
  assert.deepEqual((await score(offer, '<p>Alles für 1,00 €</p>')).c2.errors, [])
  assert.match((await score(offer, '<p>Alles</p><p>1,00 €</p>')).c2.errors.join(' '), /page price 1,00 missing/)
  assert.match((await score(offer, '<p>Alles für 1,00 CHF</p>')).c2.errors.join(' '), /page price 1,00 missing/)
})

test('a reading-order entry may name the n-th block holding a repeated anchor', async () => {
  const order = {
    readingOrder: [
      [
        { anchor: 'Rösti', kind: 'text' },
        { anchor: 'Add bacon', kind: 'text', occurrence: 1 },
        { anchor: 'Burger', kind: 'text' },
        { anchor: 'Add bacon', kind: 'text', occurrence: 2 },
      ],
    ],
  }
  assert.equal((await score(order, '<p>Rösti</p><p>Add bacon</p><p>Burger</p><p>Add bacon</p>')).c1.textOnly, 1)
  // The only bacon left lands after Burger: the first add-on is out of order and the second is missing.
  assert.equal((await score(order, '<p>Rösti</p><p>Burger</p><p>Add bacon</p>')).c1.textOnly, 0.5)
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

test('repeated anchors inside one block are counted like the validator counts them', async () => {
  const order = {
    readingOrder: [
      [
        { anchor: 'Rösti', kind: 'text' },
        { anchor: 'add bacon', kind: 'text', occurrence: 1 },
        { anchor: 'Burger', kind: 'text' },
        { anchor: 'add bacon', kind: 'text', occurrence: 2 },
      ],
    ],
  }
  assert.equal((await score(order, '<p>Rösti, add bacon. Burger, add bacon.</p>')).c1.textOnly, 1)
})
