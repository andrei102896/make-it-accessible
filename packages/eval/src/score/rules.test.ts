import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eur, list, price, product, score, plus } from './rules-fixture.ts'

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

test('a row read from the render takes the flagged one of two twin output rows', async () => {
  const twins = {
    tables: [
      {
        header: ['Name', 'Preis'],
        rows: [
          ['Tee', '1,00 €'],
          ['Tee', '1,00 €'],
        ],
      },
    ],
    renderedRows: [[0, 0]],
  }
  const body = `<table><tr><th scope="col">Name</th><th scope="col">Preis</th></tr><tr><td>Tee</td><td>1,00 €</td></tr><tr data-review><td>Tee</td><td>1,00 €</td></tr></table>`
  const result = await score(twins, body)
  assert.equal(result.c5.silentRows, 0)
  assert.equal(result.c5.rowsOk, 2)
})
