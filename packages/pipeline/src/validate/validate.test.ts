import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

// Words on one line, 10 pt high, each at the x given; the page is 600 x 800.
const page = (words: [string, number, number?][]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, h = 10], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y: 100, w: str.length * 5, h },
    flow: 0,
    line: 0,
  })),
  images: [],
  duplicates: [],
  hidden: [],
})
const menu = (items: { name: number; prices: number[][] }[]): ReturnType<typeof parsePage> =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: items.map((it) => ({
            name: { src: [[it.name, it.name]] },
            prices: it.prices.map((src) => ({ src: [src] })),
          })),
        },
      ],
      dropped: [],
    }),
  )

test('a US menu with bare prices, a market price, a two-size price and one decimal has no price findings', () => {
  const e = page([
    ['Crudo', 0],
    ['19', 100],
    ['Oysters', 0],
    ['MP', 100],
    ['Penne', 0],
    ['22/32', 100],
    ['Soup', 0],
    ['18.9', 100],
  ])
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 1]] },
      { name: 2, prices: [[3, 3]] },
      { name: 4, prices: [[5, 5]] },
      { name: 6, prices: [[7, 7]] },
    ]),
    e,
  )
  assert.deepEqual(v.errors, [])
  assert.deepEqual(v.review, [])
})

test('a leaflet with fused cents still needs a currency and keeps bare digits in review', () => {
  // "2" with small "69" beside it is a euro/cent pair: the page prints fused cents.
  const e = page([
    ['Milch', 0],
    ['2', 100, 30],
    ['69', 110, 18],
    ['Brot', 0],
    ['399', 100, 30],
  ])
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 2]] },
      { name: 3, prices: [[4, 4]] },
    ]),
    e,
  )
  assert.equal(v.errors.filter((f) => f.problem.startsWith('no currency')).length, 2)
  const withEuro = page([
    ['Milch', 0],
    ['2', 100, 30],
    ['69', 110, 18],
    ['€', 0],
    ['Brot', 0],
    ['€', 50],
    ['399', 100, 30],
  ])
  const w = validatePage(
    menu([
      { name: 0, prices: [[1, 2]] },
      { name: 4, prices: [[6, 6]] },
    ]),
    withEuro,
  )
  assert.deepEqual(w.errors, [])
  assert.equal(w.review.filter((f) => f.problem.startsWith('price read from bare digits')).length, 1)
})

test('words that are no price are still an error, and a price cited twice for one dish is an error', () => {
  const e = page([
    ['Steak', 0],
    ['-37%', 100],
    ['Risotto', 0],
    ['26', 100],
  ])
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 1]] },
      {
        name: 2,
        prices: [
          [3, 3],
          [3, 3],
        ],
      },
    ]),
    e,
  )
  assert.deepEqual(
    v.errors.map((f) => f.problem),
    ['price words "-37%" are not an amount', 'price cites the same words as another price of this item'],
  )
})

test('sizes and a price per unit show as printed; unlabelled sizes go to review; a date or a cut count is none', () => {
  const e = page([
    ['Crudités', 0],
    ['$65/80/90', 100],
    ['SM/MED/LG', 200],
    ['Coffee', 0],
    ['3.99/4.99/5.99', 100],
    ['Cookies', 0],
    ['$30/dz', 100],
    ['Special', 0],
    ['10/16/2026', 100],
    ['Rolls', 0],
    ['$12/2', 100],
  ])
  const structure = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [
            { name: { src: [[0, 0]] }, prices: [{ src: [[1, 1]], qualifier: { src: [[2, 2]] } }] },
            ...[3, 5, 7, 9].map((n) => ({ name: { src: [[n, n]] }, prices: [{ src: [[n + 1, n + 1]] }] })),
          ],
        },
      ],
      dropped: [],
    }),
  )
  const v = validatePage(structure, e)
  assert.deepEqual(
    v.errors.map((f) => f.problem),
    ['price words "10/16/2026" are not an amount', 'price words "$12/2" are not an amount'],
  )
  assert.deepEqual(
    v.review.map((f) => f.problem),
    ['prices of several sizes with no size label: "3.99/4.99/5.99"'],
  )
})

test('a word the text layer split where a ligature drew takes the letters the model read, noted as read from the image', () => {
  // 10 pt words: a dropped glyph leaves 0.55–0.7 em ("fes"+"ve", "apricots,"+"gs"), a word space 0.25 em.
  const e = page([
    ['fes', 0],
    ['ve', 20.5],
    ['apricots,', 100],
    ['gs', 152],
    ['of', 200],
    ['ice', 212.5],
    ['par', 300],
    ['Es', 320.5],
  ])
  const para = (from: number, text: string) => ({ kind: 'paragraph', text: { src: [[from, from + 1]], text } })
  const structure = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [para(0, 'festive'), para(2, 'apricots, figs'), para(4, 'office'), para(6, 'parties')],
      dropped: [],
    }),
  )
  const v = validatePage(structure, e)
  assert.deepEqual(
    v.generated.map((f) => f.path),
    ['blocks[0]', 'blocks[1]'],
  )
  assert.deepEqual(
    v.errors.map((f) => f.path),
    ['blocks[2]', 'blocks[3]'],
  )
})

test('a word a dropped glyph leaves unwhole, its letters named nowhere in the PDF, is an error unless the model read it', () => {
  const e = {
    ...page([
      ['Pance', 0],
      ['a', 32],
      ['Pla', 100],
      ['er', 122],
    ]),
    lost: ['1:1', '1:3'],
  }
  const para = (from: number, text?: string) => ({ kind: 'paragraph', text: { src: [[from, from + 1]], text } })
  const structure = parsePage(JSON.stringify({ lang: 'en', blocks: [para(0), para(2, 'Platter')], dropped: [] }))
  const v = validatePage(structure, e)
  assert.deepEqual(
    v.errors.map((f) => f.path),
    ['blocks[0]'],
  )
  assert.match(v.errors[0]?.problem ?? '', /names nowhere are missing from "Pance a"/)
})

test('a price whose digits are partly drawn as shapes is an error, the price being another amount (La Segunda "3")', () => {
  const e = {
    ...page([
      ['TOAST', 0],
      ['3', 100],
      ['TEA', 200],
      ['2.50', 300],
    ]),
    lost: ['1:1'],
  }
  const v = validatePage(
    menu([
      { name: 0, prices: [[1, 1]] },
      { name: 2, prices: [[3, 3]] },
    ]),
    e,
  )
  assert.deepEqual(
    v.errors.map((f) => f.path),
    ['blocks[0].items[0].prices[0]'],
  )
})

test('on a scan, a price the page image reads otherwise than OCR is an error naming both; an agreeing one is not', () => {
  const e = page([
    ['Soup', 0],
    ['$12.50', 200],
    ['Fish', 0],
    ['$20', 200],
  ])
  const structure = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [
            { name: { src: [[0, 0]] }, prices: [{ src: [[1, 1]], text: '12.80' }] },
            { name: { src: [[2, 2]] }, prices: [{ src: [[3, 3]], text: '$20' }] },
          ],
        },
      ],
    }),
  )
  assert.deepEqual(
    validatePage(structure, e).errors.map((f) => f.problem),
    ['the page image reads "12.80" where OCR reads "$12.50"'],
  )
})

test('a name read without the comma that ends its words is the same reading; another word is not', () => {
  const e = page([
    ['PERONI', 0],
    ['AZZURRO,', 40],
    ['5.50', 200],
  ])
  const check = (text: string) =>
    validatePage(
      parsePage(
        JSON.stringify({
          lang: 'en',
          blocks: [{ kind: 'products', items: [{ name: { src: [[0, 1]], text }, prices: [{ src: [[2, 2]] }] }] }],
        }),
      ),
      e,
    ).errors.map((f) => f.problem)
  assert.deepEqual(check('PERONI AZZURRO'), [])
  assert.deepEqual(check('PERONI ROSSO'), ['"PERONI ROSSO" does not match the cited words "PERONI AZZURRO,"'])
})
