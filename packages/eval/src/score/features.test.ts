import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { KeyDocSchema } from '../key-schema.ts'
import type { KeyDoc } from '../keys.ts'
import { scoreDocument } from './score.ts'
import type { PageScore } from './types.ts'

const key: KeyDoc = {
  ...KeyDocSchema.parse({
    doc: 'synthetic',
    pdf: 'none.pdf',
    lang: 'en-GB',
    currency: 'GBP',
    sections: [
      { keyPage: 1, label: '14', anchors: ['Starters'] },
      { keyPage: 1, label: '15', anchors: ['Desserts'] },
      { keyPage: 2, label: null, anchors: [] },
    ],
    pages: [
      {
        pdfPage: 1,
        keyPage: 1,
        type: 'pricelist',
        strict: true,
        readingOrder: [
          [
            { anchor: 'Starters', kind: 'text' },
            { anchor: 'Desserts', kind: 'text' },
          ],
        ],
        products: [
          {
            anchor: 'Soup',
            alt: null,
            prices: [
              { printed: '£6.50', cents: 650, role: 'current', currency: 'GBP' },
              { printed: '£8', cents: 800, role: 'previous', currency: 'GBP', conditions: ['was'] },
            ],
          },
          { anchor: 'Tart', alt: null, prices: [{ printed: '7.5', cents: 750, role: 'current', currency: null }] },
        ],
        tables: [{ header: ['', 'Price'], rows: [['Coffee', '£3']] }],
        mustContain: [{ text: '2 for £10', seen: true }],
        outsideTrim: ['PRINT PROOF'],
      },
      { pdfPage: 2, keyPage: 2, type: 'text', expect: 'unsupported' },
    ],
  }),
  pdfPath: '',
}

const page = (body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><main><h1>T</h1>${body}</main></body></html>`
const price = (role: string, text: string, extra = ''): string =>
  `<span class="price" data-role="${role}"${extra}>${text}</span>`
const good = {
  soup: `<li><p class="name">Soup</p><p>${price('current', '£6.50')} ${price('previous', '£8.00', '><span class="qualifier">was</span')}</p></li>`,
  tart: `<li><p class="name">Tart</p><p>${price('current', '7.50', ' data-review')}</p></li>`,
  table: `<table><tr><th scope="col"></th><th scope="col">Price</th></tr><tr><td>Coffee</td><td>${price('current', '£3.00')}</td></tr></table>`,
}

async function score(
  parts: Partial<typeof good> & { first?: string; second?: string; unsupported?: string },
  k: KeyDoc = key,
) {
  const p = { ...good, ...parts }
  const first =
    parts.first ??
    `<section aria-labelledby="a" data-page="1"><h2 id="a">Page 14</h2><h3>Starters</h3><ul class="products" role="list">${p.soup}</ul><p>2 for £10</p></section>`
  const second =
    parts.second ??
    `<section aria-labelledby="b" data-page="1"><h2 id="b">Page 15</h2><h3>Desserts</h3><ul class="products" role="list">${p.tart}</ul>${p.table}</section>`
  const third =
    parts.unsupported ?? `<section aria-labelledby="c" data-page="2" data-unsupported><h2 id="c">Page 16</h2></section>`
  const path = join(await mkdtemp(join(tmpdir(), 'mia-features-')), 'index.html')
  await writeFile(path, page(first + second + third))
  const result = await scoreDocument(path, k, [1, 2])
  const [one, two] = result.pages
  if (!one || !two) throw new Error('missing page scores')
  return { one, two }
}

const failed = (s: PageScore): string[] =>
  Object.entries(s.pass)
    .filter(([, ok]) => ok === false)
    .map(([k]) => k)

test('a correct page with two printed pages and an unsupported page passes', async () => {
  const { one, two } = await score({})
  assert.deepEqual(failed(one), [], JSON.stringify(one))
  assert.equal(two.pass.unsupported, true)
  assert.equal(two.pass.c1, null)
})

test('wrong currency, wrong role, missing qualifier and an unflagged guess are price errors', async () => {
  const { one } = await score({
    soup: `<li><p class="name">Soup</p><p>${price('current', '6,50 €')} ${price('current', '£8.00')}</p></li>`,
    tart: `<li><p class="name">Tart</p><p>${price('current', '£7.50')}</p></li>`,
  })
  assert.equal(one.c2.silent, 2)
  assert.match(one.c2.errors.join(' '), /shown in EUR/)
  assert.match(one.c2.errors.join(' '), /shown as current/)
  assert.match(one.c2.errors.join(' '), /lacks "was"/)
  assert.match(one.c2.errors.join(' '), /keyed none/)
})

test('a table price in the wrong currency fails its row', async () => {
  const { one } = await score({ table: good.table.replace('£3.00', '3,00 €') })
  assert.equal(one.pass.c5, false)
})

test('printed pages: order, labels and anchor placement are checked', async () => {
  const swapped = await score({
    first: `<section aria-labelledby="a" data-page="1"><h2 id="a">Page 14</h2><h3>Starters</h3><h3>Desserts</h3><ul class="products" role="list">${good.soup}${good.tart}</ul><p>2 for £10</p>${good.table}</section>`,
    second: '',
  })
  assert.equal(swapped.one.pass.layout, false)
  const mislabelled = await score({
    first: `<section aria-labelledby="a" data-page="1"><h2 id="a">Page 1</h2><h3>Starters</h3><ul class="products" role="list">${good.soup}</ul><p>2 for £10</p></section>`,
  })
  assert.match((mislabelled.one.layout ?? []).join(' '), /label/)
})

test('image text with a digit and slug text have zero tolerance; an alt text counts', async () => {
  const missing = await score({
    first: `<section aria-labelledby="a" data-page="1"><h2 id="a">Page 14</h2><h3>Starters</h3><ul class="products" role="list">${good.soup}</ul><p>PRINT PROOF</p></section>`,
  })
  assert.deepEqual(missing.one.c3.required, ['2 for £10'])
  assert.deepEqual(missing.one.c3.outsideTrim, ['PRINT PROOF'])
  assert.equal(missing.one.pass.c3, false)
  const inAlt = await score({
    first: `<section aria-labelledby="a" data-page="1"><h2 id="a">Page 14</h2><h3>Starters</h3><ul class="products" role="list">${good.soup}</ul><img src="x.jpg" alt="Badge: 2 for £10"></section>`,
  })
  assert.equal(inAlt.one.pass.c3, true)
})

test('an unsupported page that publishes content fails', async () => {
  const { two } = await score({
    unsupported: `<section aria-labelledby="c" data-page="2"><h2 id="c">Page 16</h2><p>º}¯}Ü</p></section>`,
  })
  assert.equal(two.pass.unsupported, false)
})

const section14 = (body: string): string =>
  `<section aria-labelledby="a" data-page="1"><h2 id="a">Page 14</h2><h3>Starters</h3><ul class="products" role="list">${good.soup}${body}</ul><p>2 for £10</p></section>`

test('a priced product the key does not have is an error, silent unless flagged', async () => {
  const extra = `<li><p class="name">Bread</p><p>${price('current', '£2.00')}</p></li>`
  const { one } = await score({ first: section14(extra) })
  assert.equal(one.c2.silent, 1)
  assert.match(one.c2.errors.join(' '), /unkeyed product with £2.00/)
  const flagged = await score({
    first: section14(extra.replace('data-role="current"', 'data-role="current" data-review')),
  })
  assert.equal(flagged.one.c2.silent, 0)
})

test('a merged output cell may hold adjacent key cells', async () => {
  const merged = `<table><tr><th scope="col"></th><th scope="col">Price</th></tr><tr><td>Coffee £3</td></tr></table>`
  const { one } = await score({ table: merged })
  assert.equal(one.pass.c5, true)
})

test('a price printed only in an image counts in the alt text when the picture is flagged', async () => {
  const [first, ...rest] = key.pages
  if (!first) throw new Error('no page')
  const badge = {
    anchor: 'Badge',
    alt: null,
    prices: [
      {
        printed: '£2',
        cents: 200,
        role: 'current' as const,
        currency: 'GBP' as const,
        conditions: [],
        seen: true as const,
      },
    ],
    old: [],
    roleFree: [],
    optional: [],
    mustContain: [],
  }
  const seenKey: KeyDoc = { ...key, pages: [{ ...first, products: [...first.products, badge] }, ...rest] }
  const item = (flag: string): string =>
    `<li><p class="name">Badge</p><img src="b.jpg" alt="Badge: only £2"${flag}></li>`
  const silent = await score({ first: section14(item('')) }, seenKey)
  assert.match(silent.one.c2.errors.join(' '), /read from the image but not flagged/)
  const confirmed = await score({ first: section14(item(' data-review')) }, seenKey)
  assert.deepEqual(confirmed.one.c2.errors, [])
})

test('printed pages may follow an accepted alternative order', async () => {
  const [p14, p15, p16] = key.sections ?? []
  if (!p14 || !p15 || !p16) throw new Error('no sections')
  const swapped = {
    first: `<section aria-labelledby="b" data-page="1"><h2 id="b">Page 15</h2><h3>Desserts</h3><ul class="products" role="list">${good.tart}</ul>${good.table}</section>`,
    second: `<section aria-labelledby="a" data-page="1"><h2 id="a">Page 14</h2><h3>Starters</h3><ul class="products" role="list">${good.soup}</ul><p>2 for £10</p></section>`,
  }
  assert.equal((await score(swapped)).one.pass.layout, false)
  const alternative = await score(swapped, { ...key, sectionOrders: [[p15, p14, p16]] })
  assert.equal(alternative.one.pass.layout, true)
})
