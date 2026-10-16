import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { renderDocument } from './document.ts'

const words = ['BEER', 'Peroni', '7.5', 'Lager', '5', 'GLS', 'BTL']
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map((str, i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x: 10 + (i % 3) * 100, y: 20 * i, w: str.length * 6, h: 10 },
    flow: 0,
    line: i,
  })),
  images: [],
  duplicates: [],
  hidden: [],
}
const priceList = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 2, text: { src: [[0, 0]] } },
      {
        kind: 'table',
        rows: [
          [{ text: { src: [[1, 1]] }, header: 'row' }, { prices: [{ src: [[2, 2]] }] }],
          [{ text: { seen: 'Blue Moon' }, header: 'row' }, { prices: [{ src: [[4, 4]] }] }],
        ],
      },
    ],
    dropped: [],
  }),
)
const headed = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      {
        kind: 'table',
        rows: [
          [
            { text: { src: [[5, 5]] }, header: 'col' },
            { text: { src: [[6, 6]] }, header: 'col' },
          ],
          [{ text: { src: [[1, 1]] }, header: 'row' }, { prices: [{ src: [[2, 2]] }] }],
        ],
      },
    ],
    dropped: [],
  }),
)
const render = (structure: typeof priceList, kind: 'menu' | 'pricelist', flagged: string[] = []) =>
  renderDocument({
    lang: 'en',
    title: 'T',
    kind,
    pages: [{ keyPage: 1, structure, extraction, flagged, imageSrc: () => undefined }],
  })

test('on a menu a two-column price table without headers is a list of menu rows, review marks kept', () => {
  const html = render(priceList, 'menu', ['blocks[1].rows[1][1].prices[0]'])
  assert.match(
    html,
    /<ul class="products menu" role="list"><li><p class="name">Peroni<\/p><p class="prices"><span role="text"><span class="price" data-role="current"><span class="amount">7\.5<\/span><\/span><\/span><\/p><\/li><li data-review><p class="name"><span data-seen>Blue Moon<\/span><\/p><p class="prices"><span role="text"><span class="price" data-role="current" data-review>/,
  )
  assert.doesNotMatch(html, /<table/)
})

test('a table with a header row, or any table on a price list, stays a table', () => {
  assert.match(render(headed, 'menu'), /<table aria-label="Table"><thead><tr><th scope="col">GLS<\/th>/)
  assert.match(
    render(priceList, 'pricelist'),
    /<table aria-labelledby="s0-0"><tbody><tr><th scope="row">Peroni<\/th><td class="num">/,
  )
})
