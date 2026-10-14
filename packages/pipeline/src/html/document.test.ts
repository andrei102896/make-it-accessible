import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction } from '../pdf/types.ts'
import { renderDocument } from './document.ts'

const words = ['Title', 'Intro', 'Name', '€2,99', 'Size', 'S', 'M', '€3,99', '€4,99']
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map((str, i) => ({
    id: `1:${String(i)}`,
    str,
    box: { x: 10, y: i * 20, w: 40, h: 10 },
    flow: 0,
    line: i,
  })),
  images: [],
  duplicates: [],
}
const structure = parsePage(
  JSON.stringify({
    lang: 'de',
    blocks: [
      { kind: 'heading', level: 1, text: { src: [[0, 0]] } },
      { kind: 'paragraph', text: { src: [[1, 1]] } },
      {
        kind: 'products',
        items: [
          {
            name: { src: [[2, 2]] },
            prices: [{ src: [[3, 3]] }],
            details: [
              {
                kind: 'table',
                rows: [
                  [{ text: { src: [[4, 4]] }, header: 'col' }],
                  [{ text: { src: [[5, 5]] } }, { prices: [{ src: [[7, 7]] }] }],
                  [{ text: { src: [[6, 6]] } }, { prices: [{ src: [[8, 8]] }] }],
                ],
              },
            ],
          },
        ],
      },
    ],
  }),
)

const render = (flagged: string[], ex: Extraction = extraction, lang = 'de'): string =>
  renderDocument({
    lang,
    title: 'T',
    pages: [{ keyPage: 1, structure, extraction: ex, flagged, imageSrc: () => undefined }],
  })
const withPrices = (a: string, b: string, c: string): Extraction => {
  const runs = [...extraction.runs]
  for (const [i, str] of [
    [3, a],
    [7, b],
    [8, c],
  ] as const) {
    const r = runs[i]
    if (r) runs[i] = { ...r, str }
  }
  return { ...extraction, runs }
}

test('a finding marks the narrowest element that carries it', () => {
  const html = render(['blocks[1]', 'blocks[2].items[0].details[0].rows[1][1].prices[0]'])
  assert.match(html, /<p data-review>Intro<\/p>/)
  assert.match(html, /<tr data-review><td>S<\/td>/)
  assert.match(html, /<tr><td>M<\/td>/)
  assert.match(html, /class="price" data-role="current" data-amount="399" data-review>/)
  assert.doesNotMatch(html, /<li data-review>/)
  assert.doesNotMatch(html, /class="table"[^>]*data-review/)
})

test('a grouping doubt marks the whole product, and only then', () => {
  assert.match(render(['blocks[2].items[0]']), /<li data-review>/)
  assert.doesNotMatch(render(['blocks[2].items[0].name']), /<li data-review>/)
  assert.match(render(['blocks[2].items[0].name']), /<p class="name" data-review>/)
})

test('each price shows its own currency; dollars are never euros', () => {
  const html = render([], withPrices('$2.99', '$3.99', '$4.99'), 'en-US')
  assert.match(html, /data-amount="299"><span class="amount">\$2\.99</)
  assert.doesNotMatch(html, /€/)
})

test('bare digits on a page without euro/cent pairs are shown as printed, never as cents', () => {
  const html = render(['blocks[2].items[0].prices[0]'], withPrices('17', '£12.00', '£9.50'), 'en-GB')
  assert.match(html, /data-review><span class="amount">17<\/span>/)
  assert.doesNotMatch(html, /0\.17/)
})

test('a price with no currency on the page is shown as printed', () => {
  const html = render([], withPrices('2,99', '3,99', '4,99'))
  assert.match(html, /class="price" data-role="current"><span class="amount">2,99</)
})

test('a list without pictures reads as a menu; whole prices keep no decimals; no generated text', () => {
  const html = render([], withPrices('£12', '£3.50', '£4'), 'en-GB')
  assert.match(html, /<ul class="products menu"/)
  assert.match(html, /<span class="amount">£12<\/span>/)
  assert.match(html, /<span class="amount">£3\.50<\/span>/)
  assert.doesNotMatch(html, /content:\s*"[^"]/)
  assert.match(html, /<h2 id="page-1" class="sr-only">/)
})

test('a menu with sections gets section links; a price list a visible contents list', () => {
  const doc = (kind: 'menu' | 'pricelist', headings: string[]) => {
    const blocks = headings.map((_, i) => ({ kind: 'heading', level: 1, text: { src: [[i, i]] } }))
    const page = parsePage(JSON.stringify({ lang: 'en', blocks }))
    const ex: Extraction = {
      ...extraction,
      runs: headings.map((str, i) => ({
        id: `1:${String(i)}`,
        str,
        box: { x: 0, y: i * 20, w: 40, h: 10 },
        flow: 0,
        line: i,
      })),
    }
    return renderDocument({
      lang: 'en',
      title: 'T',
      kind,
      pages: [{ keyPage: 1, structure: page, extraction: ex, flagged: [], imageSrc: () => undefined }],
    })
  }
  assert.match(
    doc('menu', ['Starters', 'Mains', 'Sides']),
    /<nav class="chips" id="contents" aria-label="Sections"><ul><li><a href="#s0-0">Starters<\/a>/,
  )
  assert.doesNotMatch(doc('menu', ['Starters', 'Mains']), /class="chips"/)
  assert.match(
    doc('pricelist', ['Fees']),
    /<nav class="toc" id="contents" aria-label="Contents"><p class="toc-title">Contents<\/p>/,
  )
  assert.match(doc('menu', ['Starters', 'Mains', 'Sides']), /<h3 id="s0-0">Starters<\/h3>/)
})
