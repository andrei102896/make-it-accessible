import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadKey, type KeyPage, type KeyProduct } from '../keys.ts'
import type { DocScore, PageScore } from './types.ts'
import { scoreDocument } from './score.ts'

const money = (cents: number, currency: string | null): string =>
  currency
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100)
    : (cents / 100).toFixed(2)
const picture = (p: KeyProduct): string =>
  p.alt === null ? '' : `<img src="x.jpg" alt="${(p.alt ?? p.anchor).split('|')[0] ?? ''}">`
const plainTable = (t: KeyPage['tables'][number]): string =>
  `<table><tr>${t.header.map((h) => `<th scope="col">${h}</th>`).join('')}</tr>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</table>`

function perfectSection(page: KeyPage, currency: string): string {
  const order = page.readingOrder[0] ?? []
  const done = new Set<string>()
  const tablesDone = new Set<KeyPage['tables'][number]>()
  const span = (role: string, text: string, qualifier = '', review = false): string =>
    `<span class="price" data-role="${role}"${review ? ' data-review' : ''}>${qualifier ? `<span class="qualifier">${qualifier}</span> ` : ''}${text}</span>`
  const priced = (p: KeyProduct): string =>
    (p.prices
      ? p.prices.map((k) =>
          span(k.role === 'any' ? 'current' : k.role, money(k.cents, k.currency), k.qualifier, k.currency === null),
        )
      : (p.money ?? []).map((m) => span(p.old.includes(m) ? 'previous' : 'current', money(m, currency)))
    ).join(' ')
  const productList = (products: readonly KeyProduct[]): string =>
    `<ul class="products" role="list">${products
      .map(
        (p) =>
          `<li><p class="name">${p.anchor} ${p.articleNo ?? ''}</p><p>${priced(p)}</p><p>${p.mustContain.join(' · ')}</p>${picture(p)}</li>`,
      )
      .join('')}</ul>`
  const items = order.map((entry) => {
    const heading = page.headings.find((h) => h.anchor === entry.anchor)
    if (heading) return `<h${heading.level + 2}>${entry.anchor}</h${heading.level + 2}>`
    const variants = page.products.filter(
      (p) => p.anchor === entry.anchor && !done.has(`${p.anchor}${p.articleNo ?? ''}`),
    )
    if (!variants.length) return `<p>${entry.anchor}</p>`
    variants.forEach((p) => done.add(`${p.anchor}${p.articleNo ?? ''}`))
    const table = page.tables.find((t) =>
      t.rows.some((r) => variants.some((v) => v.articleNo && r.includes(v.articleNo))),
    )
    if (table) {
      tablesDone.add(table)
      const rows = table.rows.map((r) => {
        const v = variants.find((p) => p.articleNo && r.includes(p.articleNo))
        const extra = v ? ` ${priced(v)} ${v.mustContain.join(' · ')}` : ''
        return `<tr>${r.map((cell, i) => `<td>${cell}${i === r.length - 1 ? extra : ''}</td>`).join('')}</tr>`
      })
      const [first] = variants
      if (!first) return ''
      return `<ul class="products" role="list"><li><p class="name">${first.anchor}</p><div class="table" role="region" tabindex="0" aria-label="Tabelle"><table><tr>${table.header.map((h) => `<th scope="col">${h}</th>`).join('')}</tr>${rows.join('')}</table></div>${picture(first)}</li></ul>`
    }
    return productList(variants)
  })
  const rest = page.products.filter((p) => !done.has(`${p.anchor}${p.articleNo ?? ''}`))
  if (rest.length) items.push(productList(rest))
  items.push(...page.tables.filter((t) => !tablesDone.has(t)).map(plainTable))
  return `<section aria-labelledby="page-${page.keyPage}" data-page="${page.keyPage}"><h2 id="page-${page.keyPage}">Seite ${page.keyPage}</h2>${items.join('')}</section>`
}

async function scoreHtml(doc: string, change: (html: string) => string): Promise<DocScore> {
  const key = await loadKey(doc)
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Perfect</title></head><body><main><h1>Perfect</h1>${key.pages.map((p) => perfectSection(p, key.currency)).join('')}</main></body></html>`
  const path = join(await mkdtemp(join(tmpdir(), 'mia-perfect-')), `${doc}.html`)
  await writeFile(path, change(html))
  return scoreDocument(
    path,
    key,
    key.pages.map((p) => p.keyPage),
  )
}

const c5Of = (score: DocScore, keyPage: number): PageScore['c5'] | undefined =>
  score.pages.find((p) => p.keyPage === keyPage)?.c5

async function checkScorer(): Promise<void> {
  for (const doc of ['01_billa', '02_pollin', '03_honda', '04_stonehouse', '05_bannatyne']) {
    const score = await scoreHtml(doc, (html) => html)
    for (const p of score.pages) {
      const failed = Object.entries(p.pass)
        .filter(([, ok]) => ok === false)
        .map(([c]) => c)
      assert.deepEqual(
        failed,
        [],
        `perfect ${doc} p${p.keyPage} fails ${failed.join(',')}: ${JSON.stringify({ c1: p.c1, c2: p.c2.errors, c3: p.c3, c4: p.c4.failures })}`,
      )
      assert.equal(p.c5.rowsOk, p.c5.rows, `perfect ${doc} p${p.keyPage} table rows`)
    }
  }
}

test('an HTML page written from the key scores 100 %', checkScorer)

test('table cells are scored by column, merged cells and price amounts included', async () => {
  const merged = await scoreHtml('03_honda', (html) =>
    ['42 POLYSTRONG', '47 POLYSTRONG', '53 XENOY'].reduce((h, deck) => {
      const cell = `<td>${deck}</td>`
      const [head = '', ...rest] = h.split(cell)
      return `${head}<td rowspan="4">${deck}</td>${rest.join('')}`
    }, html),
  )
  assert.equal(c5Of(merged, 3)?.rowsOk, 12)
  const shifted = await scoreHtml('03_honda', (html) =>
    html.replace(
      '<td>HRX 426 PKEH</td><td>42 POLYSTRONG</td><td>■</td><td></td>',
      '<td>HRX 426 PKEH</td><td>42 POLYSTRONG</td><td></td><td>■</td>',
    ),
  )
  assert.deepEqual(c5Of(shifted, 3)?.rowErrors, ['HRX 426 PKEH | 42 POLYSTRONG | ■ (silent)'])
  const priced = await scoreHtml('05_bannatyne', (html) =>
    html
      .replace('<td>£8500</td>', '<td><span class="price" data-amount="850000">£8,500.00</span></td>')
      .replace('<td>£7500</td>', '<td><span class="price" data-amount="760000">£7,600.00</span></td>'),
  )
  assert.deepEqual(c5Of(priced, 3)?.rowErrors, ['2026 | £7500 | £8000 (silent)'])
})

test('a key page published as two sections is scored as one page', async () => {
  const split = await scoreHtml('05_bannatyne', (html) =>
    html.replace(
      '<p>Toasting drinks</p>',
      '<p>Toasting drinks</p></section><section aria-labelledby="page-2b" data-page="2"><h2 id="page-2b">Page 2b</h2>',
    ),
  )
  const page = split.pages.find((p) => p.keyPage === 2)
  assert.ok(page && Object.values(page.pass).every((ok) => ok !== false), JSON.stringify(page))
  assert.equal(page.c1.textOnly, 1)
})
