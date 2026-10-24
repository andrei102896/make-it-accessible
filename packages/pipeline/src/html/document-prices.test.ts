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
  vectors: [],
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

test('a small-caps text layer ("MEatball app") is not a printed case: the model\'s text shows', () => {
  const smallCaps: Extraction = {
    ...extraction,
    runs: extraction.runs.map((r) => (r.id === '1:1' ? { ...r, str: 'MEatball' } : r)),
  }
  const recased = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'products', items: [{ name: { src: [[1, 1]], text: 'Meatball' }, prices: [{ src: [[2, 3]] }] }] },
      ],
      dropped: [],
    }),
  )
  const html = renderDocument({
    lang: 'en',
    title: 'Almond',
    pages: [{ ...page, structure: recased, extraction: smallCaps }],
  })
  assert.match(html, /<p class="name">Meatball<\/p>/)
})

test('a small-caps name role takes the model\'s case: "plantain Chips" shows as "Plantain Chips", rendered small caps', () => {
  const lower: Extraction = {
    ...extraction,
    runs: extraction.runs.map((r) => (r.id === '1:1' ? { ...r, str: 'plantain' } : r)),
  }
  const named = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'products', items: [{ name: { src: [[1, 1]], text: 'Plantain' }, prices: [{ src: [[2, 3]] }] }] },
      ],
      dropped: [],
    }),
  )
  const doc = (smallCaps: boolean) =>
    renderDocument({
      lang: 'en',
      title: 'Carmine',
      pages: [{ ...page, structure: named, extraction: lower }],
      brand: {
        profile: {
          body: 11,
          roles: {
            name: {
              face: { key: 'bodonibt', weight: 700, italic: false },
              size: 16,
              color: '#000000',
              caps: false,
              words: 2,
              smallCaps,
            },
          },
          signatures: [],
          headings: new Map(),
          accent: null,
          headingBoxes: [],
          itemBoxes: [],
          pricesInline: false,
          inks: [],
        },
        library: [],
        faces: [],
        background: '#ffffff',
        rules: [],
        dividers: null,
        alternate: null,
        ornaments: [],
      },
    })
  assert.match(doc(true), /<p class="name">Plantain<\/p>/)
  assert.match(doc(false), /<p class="name">plantain<\/p>/)
})

test('a price cited twice for one dish is shown once', () => {
  const html = renderDocument({ lang: 'en', title: 'Almond', pages: [page] })
  assert.equal((html.match(/<span class="amount">26<\/span>/g) ?? []).length, 1)
})

test('a dish with several priced sizes wraps its prices; each price stays on one line with its label', () => {
  const css = renderDocument({ lang: 'en', title: 'Almond', pages: [page] })
  assert.match(css, /\n\.price \{ white-space: nowrap; \}/)
  // A long label wraps inside itself, the amount stays whole (Bernini's "Add 1 Scoop Of Vanilla Gelato 3" at 320px).
  assert.match(css, /\.price \.qualifier \{ white-space: normal; \}/)
  assert.doesNotMatch(css, /\.products\.menu \.prices \{[^}]*nowrap/)
  // The price column never squeezes the name: several add-on prices wrap inside their share of the row.
  assert.match(css, /\.products\.menu > li \{[^}]*grid-template-columns: 1fr fit-content\(60%\)/)
})

test('a price label sits where it is printed, a separator between prices stays outside them; menu labels are words', () => {
  // "3.5 ea, 20 half dozen": the label after the amount, the comma after the pair.
  const runs: Run[] = [
    { id: '1:0', str: 'Oysters', box: { x: 10, y: 40, w: 40, h: 13 }, flow: 0, line: 2 },
    { id: '1:1', str: '3.5', box: { x: 400, y: 40, w: 18, h: 13 }, flow: 0, line: 2 },
    { id: '1:2', str: 'ea,', box: { x: 422, y: 40, w: 16, h: 13 }, flow: 0, line: 2 },
    { id: '1:3', str: 'Half', box: { x: 450, y: 40, w: 22, h: 13 }, flow: 0, line: 2 },
    { id: '1:4', str: 'Dozen', box: { x: 475, y: 40, w: 30, h: 13 }, flow: 0, line: 2 },
    { id: '1:5', str: '20,', box: { x: 510, y: 40, w: 18, h: 13 }, flow: 0, line: 2 },
  ]
  const noah = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [
            {
              name: { src: [[0, 0]] },
              prices: [
                { src: [[1, 1]], qualifier: { src: [[2, 2]] } },
                { src: [[5, 5]], qualifier: { src: [[3, 4]] } },
              ],
            },
          ],
        },
      ],
      dropped: [],
    }),
  )
  const html = renderDocument({
    lang: 'en',
    title: 'Noah',
    kind: 'menu',
    pages: [{ ...page, structure: noah, extraction: { ...extraction, runs } }],
  })
  assert.match(
    html,
    /<span class="price" data-role="current"><span class="amount">3\.5<\/span> <span class="qualifier">ea<\/span><\/span>, <span class="price" data-role="current"><span class="qualifier">Half Dozen<\/span> <span class="amount">20<\/span><\/span>,<\/span><\/p>/,
  )
  assert.match(
    html,
    /\.doc-menu \.price \.qualifier \{ display: inline; border: 0; padding: 0; color: var\(--muted\); font-weight: 400; font-size: 1rem; \}/,
  )
})

test('a column head printed above its price is read before it, whatever its x (Eusebi "btl" over "29.5")', () => {
  const runs: Run[] = [
    { id: '1:0', str: 'btl', box: { x: 268, y: 20, w: 9, h: 10 }, flow: 0, line: 0 },
    { id: '1:1', str: 'Grillo', box: { x: 10, y: 40, w: 40, h: 13 }, flow: 0, line: 1 },
    { id: '1:2', str: '29.5', box: { x: 258.9, y: 40, w: 17.5, h: 13 }, flow: 0, line: 1 },
  ]
  const wine = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [{ name: { src: [[1, 1]] }, prices: [{ src: [[2, 2]], qualifier: { src: [[0, 0]] } }] }],
        },
      ],
      dropped: [],
    }),
  )
  const html = renderDocument({
    lang: 'en',
    title: 'Eusebi',
    kind: 'menu',
    pages: [{ ...page, structure: wine, extraction: { ...extraction, runs } }],
  })
  assert.match(html, /<span class="qualifier">btl<\/span> <span class="amount">29\.5<\/span>/)
  // A note printed below and left of its price stays after it.
  const below = runs.map((r) => (r.id === '1:0' ? { ...r, str: 'pp', box: { ...r.box, x: 250, y: 56 } } : r))
  const after = renderDocument({
    lang: 'en',
    title: 'Eusebi',
    kind: 'menu',
    pages: [{ ...page, structure: wine, extraction: { ...extraction, runs: below } }],
  })
  assert.match(after, /<span class="amount">29\.5<\/span> <span class="qualifier">pp<\/span>/)
})

test('an add-on and a price per person show as printed: no sign added, no amount (Scotts "+ 4.50", Unruly Pig "49pp")', () => {
  const runs: Run[] = [
    { id: '1:0', str: 'Liqueur', box: { x: 10, y: 40, w: 40, h: 13 }, flow: 0, line: 1 },
    { id: '1:1', str: '+', box: { x: 250, y: 40, w: 5, h: 13 }, flow: 0, line: 1 },
    { id: '1:2', str: '4.50', box: { x: 257, y: 40, w: 20, h: 13 }, flow: 0, line: 1 },
    { id: '1:3', str: 'Cutlet', box: { x: 10, y: 60, w: 40, h: 13 }, flow: 0, line: 2 },
    { id: '1:4', str: '£49pp', box: { x: 250, y: 60, w: 28, h: 13 }, flow: 0, line: 2 },
    { id: '1:5', str: 'Toast', box: { x: 10, y: 80, w: 40, h: 13 }, flow: 0, line: 3 },
    { id: '1:6', str: '£5.00', box: { x: 250, y: 80, w: 28, h: 13 }, flow: 0, line: 3 },
  ]
  const items = [
    [0, 1, 2],
    [3, 4, 4],
    [5, 6, 6],
  ].map(([n, from, to]) => ({ name: { src: [[n, n]] }, prices: [{ src: [[from, to]] }] }))
  const structure = parsePage(JSON.stringify({ lang: 'en', blocks: [{ kind: 'products', items }], dropped: [] }))
  const html = renderDocument({
    lang: 'en',
    title: 'Add-ons',
    kind: 'menu',
    pages: [{ ...page, structure, extraction: { ...extraction, runs } }],
  })
  assert.match(html, /<span class="price" data-role="current"><span class="amount">\+ 4\.50<\/span><\/span>/)
  assert.match(html, /<span class="price" data-role="current"><span class="amount">£49pp<\/span><\/span>/)
  assert.match(html, /data-amount="500"/)
})
