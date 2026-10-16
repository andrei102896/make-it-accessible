import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Brand } from './brand.ts'
import { renderDocument } from './document.ts'
import type { Profile } from './profile.ts'
import { shapesOf } from './shapes.ts'

// A 600 pt wide page: one list prints each dish on a wide line, name then description then the price at the
// right edge (Noah's); a second list prints narrow items in two columns (Carew).
const words: [string, number, number][] = [
  ['SMALL PLATES', 20, 100],
  ['Spicy Tuna Bites', 20, 130],
  ['Crispy rice, avocado', 130, 130],
  ['24', 560, 130],
  ['Fig Salad', 20, 160],
  ['Arugula, pecans, goat cheese', 90, 160],
  ['18', 560, 160],
  ['SIDES', 20, 300],
  ['Fries', 20, 330],
  ['8', 250, 330],
  ['Slaw', 320, 330],
  ['6', 560, 330],
]
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, y], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y, w: str.length * 5, h: 10 },
    flow: 0,
    line: y,
    font: { key: 'avenir', weight: 400, italic: false, size: 10 },
  })),
  images: [],
  duplicates: [],
  hidden: [],
}
const dish = (n: number, d: number | null, p: number) => ({
  name: { src: [[n, n]] },
  prices: [{ src: [[p, p]] }],
  details: d === null ? [] : [{ kind: 'paragraph', text: { src: [[d, d]] } }],
})
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 2, text: { src: [[0, 0]] } },
      { kind: 'products', items: [dish(1, 2, 3), dish(4, 5, 6)] },
      { kind: 'heading', level: 2, text: { src: [[7, 7]] } },
      { kind: 'products', items: [dish(8, null, 9), dish(10, null, 11)] },
    ],
    dropped: [],
  }),
)

test('a list of stacked wide lines is wide, with the description running on from the name; two columns are not', () => {
  const shapes = shapesOf({ structure, extraction })
  assert.deepEqual(shapes.get(1), { wide: true, runOn: true })
  assert.deepEqual(shapes.get(3), { wide: false, runOn: false })
})

test('a wide run-on list renders one dish per line, the lead description before the price; plain without a brand', () => {
  const page = { keyPage: 1, structure, extraction, flagged: [], imageSrc: () => undefined }
  const profile: Profile = {
    body: 10,
    roles: {},
    signatures: [],
    headings: new Map(),
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
    dividers: null,
    alternate: null,
    ornaments: [],
  }
  const html = renderDocument({ lang: 'en', title: 'Noah', kind: 'menu', pages: [page], brand })
  assert.match(
    html,
    /<ul class="products menu wide run-on" role="list"><li><p class="name">Spicy Tuna Bites<\/p><p class="desc lead">Crispy rice, avocado<\/p><p class="prices">/,
  )
  assert.match(html, /<ul class="products menu" role="list"><li><p class="name">Fries<\/p><p class="prices">/)
  assert.match(html, /\.products\.menu\.wide \{ columns: 1; \}/)
  // Prices printed right after the name keep their place: name, price, then the description on the same line.
  const inline = renderDocument({
    lang: 'en',
    title: 'Noah',
    kind: 'menu',
    pages: [page],
    brand: { ...brand, profile: { ...profile, pricesInline: true } },
  })
  assert.match(inline, /<p class="name">Spicy Tuna Bites<\/p><p class="prices">.*?<\/p><p class="desc lead">/)
  assert.match(inline, /\.products\.menu\.run-on > li > \.lead \{ display: inline; \}/)
  const plain = renderDocument({ lang: 'en', title: 'Noah', kind: 'menu', pages: [page] })
  assert.match(
    plain,
    /<ul class="products menu" role="list"><li><p class="name">Spicy Tuna Bites<\/p><p class="prices">/,
  )
})
