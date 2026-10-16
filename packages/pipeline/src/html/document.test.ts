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
  hidden: [],
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

test('a price with no currency is shown as printed; prices are one phrase for VoiceOver (role="text")', () => {
  const html = render([], withPrices('2,99', '3,99', '4,99'))
  assert.match(html, /"prices"><span role="text"><span class="price" data-role="current"><span class="amount">2,99</)
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
    /<nav class="chips pinned" id="contents" aria-label="Sections"><ul><li><a href="#s0-0">Starters<\/a>/,
  )
  assert.doesNotMatch(doc('menu', ['Starters', 'Mains']), /class="chips"/)
  assert.match(
    doc('pricelist', ['Fees']),
    /<nav class="toc" id="contents" aria-label="Contents"><p class="toc-title">Contents<\/p>/,
  )
  assert.match(doc('menu', ['Starters', 'Mains', 'Sides']), /<h3 id="s0-0">Starters<\/h3>/)
})

test('hidden words are not published; page markers and headings follow the PDF; a table is named by its heading', () => {
  const page = parsePage(
    JSON.stringify({
      lang: 'de',
      blocks: [
        { kind: 'heading', level: 2, text: { src: [[0, 0]] } },
        { kind: 'paragraph', text: { src: [[1, 1]] } },
        {
          kind: 'table',
          rows: [
            [
              { text: { src: [[4, 4]] }, header: 'col' },
              { text: { src: [[2, 2]] }, header: 'col' },
            ],
            [{ text: { src: [[5, 5]] }, header: 'row' }, { prices: [{ src: [[7, 7]] }] }],
          ],
        },
      ],
    }),
  )
  const html = renderDocument({
    lang: 'de',
    title: 'T',
    pages: [
      {
        keyPage: 1,
        structure: page,
        extraction: { ...extraction, pdfPage: 7, hidden: ['1:1'] },
        flagged: [],
        imageSrc: () => undefined,
      },
    ],
  })
  assert.doesNotMatch(html, /Intro/)
  assert.match(html, /data-page="1">\n<h2 id="page-7" class="sr-only">Seite 7<\/h2>/)
  assert.match(html, /<h3 id="s0-0">Title<\/h3>/)
  assert.match(html, /aria-labelledby="s0-0"><table aria-labelledby="s0-0"><thead><tr><th scope="col">Size/)
  assert.match(html, /<\/thead><tbody><tr><th scope="row">S<\/th>/)
})

test('a menu shows its legend codes as tags after the name, read out in full', () => {
  const runs = ['Fries', '£4', 'with', 'dip', 'V', 'GF', 'V', 'Vegetarian', 'GF', 'Gluten', 'Free']
  const page = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [
            {
              name: { src: [[0, 0]] },
              prices: [{ src: [[1, 1]] }],
              details: [{ kind: 'paragraph', text: { src: [[2, 5]] } }],
            },
          ],
        },
        { kind: 'list', items: [{ src: [[6, 7]] }, { src: [[8, 10]] }] },
      ],
    }),
  )
  const ex: Extraction = {
    ...extraction,
    runs: runs.map((str, i) => ({
      id: `1:${String(i)}`,
      str,
      box: { x: i * 50, y: 0, w: 40, h: 10 },
      flow: 0,
      line: 0,
    })),
  }
  const html = renderDocument({
    lang: 'en',
    title: 'Inn · Menu',
    kind: 'menu',
    pages: [{ keyPage: 1, structure: page, extraction: ex, flagged: [], imageSrc: () => undefined }],
  })
  assert.match(
    html,
    /<p class="name">Fries <span class="diet"><span aria-hidden="true">V<\/span><span class="sr-only">, Vegetarian<\/span><\/span>/,
  )
  assert.match(html, /<p class="desc lead">with dip<\/p>/)
  assert.match(
    html,
    /<p class="legend"><span class="sr-only">V Vegetarian, GF Gluten Free<\/span><span aria-hidden="true">/,
  )
  assert.match(
    html,
    /<h1><span role="text"><span class="brand">Inn<span class="sr-only">,<\/span><\/span> <span class="doc">Menu<\/span><\/span><\/h1>/,
  )
})

test('a note naming no item describes the list; a picture in the same place on every page is decorative', () => {
  const runs = ['Room', '£100', 'Prices', 'per', 'person']
  const page = (pdfPage: number) =>
    parsePage(
      JSON.stringify({
        lang: 'en',
        blocks: [
          { kind: 'products', items: [{ name: { src: [[0, 0]] }, prices: [{ src: [[1, 1]] }] }] },
          { kind: 'paragraph', text: { src: [[2, 4]] } },
          { kind: 'figure', image: { box: [10, 900, 100, 50], alt: `Drawing of the hotel ${String(pdfPage)}` } },
        ],
      }),
    )
  const ex = (pdfPage: number): Extraction => ({
    ...extraction,
    pdfPage,
    runs: runs.map((str, i) => ({
      id: `${String(pdfPage)}:${String(i)}`,
      str,
      box: { x: i * 50, y: 0, w: 40, h: 10 },
      flow: 0,
      line: 0,
    })),
  })
  const html = renderDocument({
    lang: 'en',
    title: 'T',
    pages: [1, 2].map((n) => ({
      keyPage: n,
      structure: page(n),
      extraction: ex(n),
      flagged: [],
      imageSrc: () => 'x.jpg',
    })),
  })
  assert.match(html, /<div class="priced"><ul aria-describedby="note-1-1" class="products menu"/)
  assert.match(html, /<p class="note" id="note-1-1">Prices per person<\/p><\/div>/)
  assert.equal(html.match(/<div class="ornament"><img src="x.jpg" alt="" class="fig-s"><\/div>/g)?.length, 2)
})

test('a note naming some items describes only them, without a group around the list', () => {
  const runs = ['Lamb', 'Rump', '£29', 'Carew', 'Burger', '£18', 'All', 'burgers', 'served', 'with', 'chips']
  const page = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [
            { name: { src: [[0, 1]] }, prices: [{ src: [[2, 2]] }] },
            { name: { src: [[3, 4]] }, prices: [{ src: [[5, 5]] }] },
          ],
        },
        { kind: 'paragraph', text: { src: [[6, 10]] } },
      ],
    }),
  )
  const ex: Extraction = {
    ...extraction,
    runs: runs.map((str, i) => ({
      id: `1:${String(i)}`,
      str,
      box: { x: i * 50, y: 0, w: 40, h: 10 },
      flow: 0,
      line: 0,
    })),
  }
  const html = renderDocument({
    lang: 'en',
    title: 'T',
    pages: [{ keyPage: 1, structure: page, extraction: ex, flagged: [], imageSrc: () => undefined }],
  })
  assert.doesNotMatch(html, /class="priced"/)
  assert.match(html, /<li><p class="name">Lamb Rump/)
  assert.match(html, /<li aria-describedby="note-1-1"><p class="name">Carew Burger/)
  assert.match(html, /<p class="note" id="note-1-1">All burgers served with chips<\/p>/)
})
