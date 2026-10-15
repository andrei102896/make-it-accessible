import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction } from '../pdf/types.ts'
import type { Brand } from './brand.ts'
import { renderDocument } from './document.ts'
import type { Profile } from './profile.ts'

const words = ['KENDELLS', 'BISTRO', 'Soupe', '12.50']
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
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 1, text: { src: [[0, 1]] } },
      { kind: 'products', items: [{ name: { src: [[2, 2]] }, prices: [{ src: [[3, 3]] }] }] },
    ],
    dropped: [],
  }),
)
const page = { keyPage: 1, structure, extraction, flagged: [], imageSrc: () => undefined }
const profile: Profile = {
  body: 14,
  roles: {},
  signatures: [
    { face: { key: 'oswald', weight: 400, italic: false }, size: 17, color: '#000000', caps: true, words: 2 },
  ],
  headings: new Map([['0:blocks[0]', 0]]),
  accent: null,
  headingBoxes: [],
  itemBoxes: [],
}
const brand: Brand = {
  profile,
  library: [],
  faces: [],
  background: '#ffffff',
  rules: [],
  dividers: false,
  alternate: null,
}

test('with the document brand: headings carry their signature; a printed title shows once, the band is sr-only', () => {
  const html = renderDocument({ lang: 'en', title: 'Kendells Bistro', pages: [page], brand })
  assert.match(html, /<h3 id="[^"]+" class="hs-1">KENDELLS BISTRO<\/h3>/)
  assert.match(html, /<div class="band sr-only"><h1>/)
  assert.match(html, /\.products\.menu > li \{ border-bottom: 0/)
  // The validity line stays visible outside the hidden band; print is black on white.
  const dated = renderDocument({
    lang: 'en',
    title: 'Kendells Bistro',
    pages: [page],
    brand,
    validity: 'Valid until 31 October',
  })
  assert.match(dated, /<div class="band sr-only"><h1>.*<\/h1><\/div><p class="validity">Valid until 31 October<\/p>/s)
  assert.match(html, /@media print \{[^@]*body \* \{ color: #000000 !important; \}/)
  // A title the heading prints only in part keeps the band visible.
  assert.match(
    renderDocument({ lang: 'en', title: 'Kendells Bistro · Menu', pages: [page], brand }),
    /<div class="band"><h1>/,
  )
})

test('without a brand (runs saved before fonts were read) the page keeps the base template', () => {
  const html = renderDocument({ lang: 'en', title: 'Kendells Bistro', pages: [page] })
  assert.doesNotMatch(html, /hs-1|@font-face|border-bottom: 0/)
  assert.match(html, /<div class="band"><h1>/)
  assert.match(html, /color-scheme: light;/)
  assert.doesNotMatch(html, /prefers-color-scheme/)
})

test('a note naming the heading above it prices every list under that heading, without a box', () => {
  const said = [
    'TEA',
    'TIME',
    'SET',
    'MENU',
    'ENTRÉES',
    'Pâté',
    'PLATS',
    'Confit',
    'TEA',
    'TIME',
    'SET',
    'MENU:',
    'two',
    'courses',
    '£31.90',
  ]
  const e: Extraction = {
    ...extraction,
    runs: said.map((str, i) => ({
      id: `1:${String(i)}`,
      str,
      box: { x: 10, y: i * 20, w: 40, h: 10 },
      flow: 0,
      line: i,
    })),
  }
  const s = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'heading', level: 2, text: { src: [[0, 3]] } },
        { kind: 'heading', level: 3, text: { src: [[4, 4]] } },
        { kind: 'products', items: [{ name: { src: [[5, 5]] } }] },
        { kind: 'heading', level: 3, text: { src: [[6, 6]] } },
        { kind: 'products', items: [{ name: { src: [[7, 7]] } }] },
        { kind: 'paragraph', text: { src: [[8, 14]] } },
      ],
      dropped: [],
    }),
  )
  const html = renderDocument({ lang: 'en', title: 'Menu', pages: [{ ...page, structure: s, extraction: e }] })
  assert.equal(html.match(/<ul class="products menu" role="list" aria-describedby="note-1-5">/g)?.length, 2)
  assert.match(html, /<p class="note" id="note-1-5">TEA TIME SET MENU: two courses £31\.90<\/p>/)
  assert.doesNotMatch(html, /class="priced"/)
})
