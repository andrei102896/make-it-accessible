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
  vectors: [],
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
  pricesInline: false,
  inks: [],
}
const brand: Brand = {
  profile,
  library: [],
  faces: [],
  background: '#ffffff',
  rules: [],
  dividers: false,
  alternate: null,
  ornaments: [],
}

test('with the document brand: headings carry their signature; a printed title shows once, the band is sr-only', () => {
  const html = renderDocument({ lang: 'en', title: 'Kendells Bistro', pages: [page], brand })
  assert.match(html, /<h3 id="[^"]+" class="hs-1 masthead-title">KENDELLS BISTRO<\/h3>/)
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
  // A masthead that names the place hides the band too, whatever the document part of the title; the h1 keeps
  // the full name for screen readers.
  assert.match(
    renderDocument({ lang: 'en', title: 'Kendells Bistro · Menu', pages: [page], brand }),
    /<div class="band sr-only"><h1>/,
  )
})

test('an ornament under the title is drawn by CSS on that heading only, and falls back to a rule in print', () => {
  const ornament = {
    mask: 'iVBORw0KGgo=',
    em: 12.9,
    aspect: 23.4,
    centered: true,
    color: '#222222',
    headings: ['0:blocks[0]'],
  }
  const rule = { width: 0.4, full: false, centered: true, color: '#222222' }
  const html = renderDocument({
    lang: 'en',
    title: 'Kendells Bistro',
    pages: [page],
    brand: { ...brand, rules: [rule], ornaments: [ornament] },
  })
  assert.match(html, /<h3 id="[^"]+" class="hs-1 orn-1 masthead-title">KENDELLS BISTRO<\/h3>/)
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
  const own = css.indexOf(':is(h1, h2, h3, h4, h5, h6).orn-1::after { content: ""; display: block; width: 12.9em;')
  // Same specificity as the signature's rule: the ornament wins by coming after it.
  assert.ok(own > css.indexOf('.hs-1::after'))
  assert.match(css, /--ornament: url\(data:image\/png;base64,iVBORw0KGgo=\); text-align: center;/)
  assert.match(css, /mask: var\(--ornament\) center \/ 100% 100% no-repeat; \}/)
  assert.match(
    css,
    /@media print, \(forced-colors: active\) \{ :is\(h1, h2, h3, h4, h5, h6\)\[class\*="orn-"\]::after \{ background: none;/,
  )
  assert.doesNotMatch(css, /content: "[^"]/)
})

test('a rule the vector layer draws under a heading replaces the rules measured from the render', () => {
  const ruled = {
    ...extraction,
    rules: [{ box: { x: 10, y: 32, w: 40, h: 0 }, color: '#222222', width: 1, dash: 'solid' as const, double: false }],
  }
  const rule = { width: 0.4, full: false, centered: true, color: '#222222' }
  const html = renderDocument({
    lang: 'en',
    title: 'Kendells Bistro',
    pages: [{ ...page, extraction: ruled }],
    brand: { ...brand, rules: [rule] },
  })
  assert.match(html, /class="hs-1 masthead-title ruled rule-under rule-centred ln-solid-222222-1"/)
  assert.doesNotMatch(html, /\.hs-1::after/)
  assert.match(html, /\.ln-solid-222222-1 \{ --rule: 1px solid #222222; \}/)
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
