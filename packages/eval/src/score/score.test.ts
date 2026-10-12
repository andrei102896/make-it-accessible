import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadKey, type KeyPage } from '../keys.ts'
import { scoreDocument } from './score.ts'

const euros = (cents: number): string => `${(cents / 100).toFixed(2).replace('.', ',')} €`

function perfectSection(page: KeyPage): string {
  const order = page.readingOrder[0] ?? []
  const done = new Set<string>()
  const priced = (money: readonly number[], old: readonly number[]): string =>
    money
      .map(
        (m) =>
          `<span class="price" data-role="${old.includes(m) ? 'previous' : 'current'}" data-amount="${m}">${euros(m)}</span>`,
      )
      .join(' ')
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
      const rows = table.rows.map((r) => {
        const v = variants.find((p) => p.articleNo && r.includes(p.articleNo))
        return `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}<td>${v ? `${priced(v.money, v.old)} ${v.mustContain.join(' · ')}` : ''}</td></tr>`
      })
      const [first] = variants
      if (!first) return ''
      return `<ul class="products" role="list"><li><p class="name">${first.anchor}</p><div class="table" role="region" tabindex="0" aria-label="Tabelle"><table><tr>${table.header.map((h) => `<th scope="col">${h}</th>`).join('')}<th scope="col">Preis</th></tr>${rows.join('')}</table></div><img src="x.jpg" alt="${(first.alt ?? first.anchor).split('|')[0]}"></li></ul>`
    }
    return `<ul class="products" role="list">${variants
      .map(
        (p) =>
          `<li><p class="name">${p.anchor} ${p.articleNo ?? ''}</p><p>${priced(p.money, p.old)}</p><p>${p.mustContain.join(' · ')}</p><img src="x.jpg" alt="${(p.alt ?? p.anchor).split('|')[0]}"></li>`,
      )
      .join('')}</ul>`
  })
  return `<section aria-labelledby="page-${page.keyPage}" data-page="${page.keyPage}"><h2 id="page-${page.keyPage}">Seite ${page.keyPage}</h2>${items.join('')}</section>`
}

async function checkScorer(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'mia-perfect-'))
  for (const doc of ['01_billa', '02_pollin']) {
    const key = await loadKey(doc)
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Perfect</title></head><body><main><h1>Perfect</h1>${key.pages.map(perfectSection).join('')}</main></body></html>`
    const path = join(dir, `perfect-${doc}.html`)
    await writeFile(path, html)
    const score = await scoreDocument(
      path,
      key,
      key.pages.map((p) => p.keyPage),
    )
    for (const p of score.pages) {
      const failed = Object.entries(p.pass)
        .filter(([, ok]) => !ok)
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
