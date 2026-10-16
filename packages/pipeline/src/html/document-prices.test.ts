import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { renderDocument } from './document.ts'

const words: [string, number, number][] = [
  ['RAW BAR', 10, 20],
  ['Crudo', 10, 40],
  ['21.9', 500, 40],
  ['5', 525.3, 40],
  ['Risotto', 10, 60],
  ['26', 500, 60],
]
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, y], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y, w: str.length * 6, h: 13 },
    flow: 0,
    line: y / 20,
  })),
  images: [],
  duplicates: [],
  hidden: [],
}
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 1, text: { src: [[0, 0]], text: 'Raw Bar' } },
      {
        kind: 'products',
        items: [
          { name: { src: [[1, 1]] }, prices: [{ src: [[2, 3]] }] },
          { name: { src: [[4, 4]] }, prices: [{ src: [[5, 5]] }, { src: [[5, 5]], qualifier: { src: [[4, 4]] } }] },
        ],
      },
    ],
    dropped: [],
  }),
)
const page = { keyPage: 1, structure, extraction, flagged: [], imageSrc: () => undefined }

test('a price split in the text layer shows joined; a heading the model only re-cased keeps its printed case', () => {
  const html = renderDocument({ lang: 'en', title: 'Almond', pages: [page] })
  assert.match(html, /<span class="amount">21\.95<\/span>/)
  assert.doesNotMatch(html, /21\.9 5/)
  assert.match(html, />RAW BAR<\/h3>/)
})

test('a price cited twice for one dish is shown once', () => {
  const html = renderDocument({ lang: 'en', title: 'Almond', pages: [page] })
  assert.equal((html.match(/<span class="amount">26<\/span>/g) ?? []).length, 1)
})

test('a dish with several priced sizes wraps its prices; each price stays on one line with its label', () => {
  const css = renderDocument({ lang: 'en', title: 'Almond', pages: [page] })
  assert.match(css, /\n\.price \{ white-space: nowrap; \}/)
  assert.doesNotMatch(css, /\.products\.menu \.prices \{[^}]*nowrap/)
  // The price column never squeezes the name: several add-on prices wrap inside their share of the row.
  assert.match(css, /\.products\.menu > li \{[^}]*grid-template-columns: 1fr fit-content\(60%\)/)
})
