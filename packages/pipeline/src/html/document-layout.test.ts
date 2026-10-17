import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Brand } from './brand.ts'
import { renderDocument } from './document.ts'
import type { Profile } from './profile.ts'

const words: [string, number, number, number][] = [
  ['PROHIBITION', 100, 30, 81],
  ['KITCHEN', 400, 30, 81],
  ['SMALL', 40, 200, 16],
  ['PLATES', 90, 200, 16],
  ['Fries', 40, 240, 11],
  ['7', 500, 240, 11],
  ['Consuming', 40, 770, 7],
  ['raw', 110, 770, 7],
]
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, y, size], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y, w: str.length * 6, h: size },
    flow: 0,
    line: i,
    font: { key: 'oswald', weight: 400, italic: false, size },
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
      { kind: 'heading', level: 2, text: { src: [[2, 3]] } },
      { kind: 'products', items: [{ name: { src: [[4, 4]] }, prices: [{ src: [[5, 5]] }] }] },
      { kind: 'paragraph', text: { src: [[6, 7]] } },
    ],
    dropped: [],
  }),
)
const page = { keyPage: 1, structure, extraction, flagged: [], imageSrc: () => undefined }
const face = { key: 'oswald', weight: 400, italic: false }
const profile: Profile = {
  body: 11,
  roles: {},
  signatures: [
    { face, size: 81, color: '#000000', caps: true, words: 2 },
    { face, size: 16, color: '#000000', caps: true, words: 2 },
  ],
  headings: new Map([
    ['0:blocks[0]', 0],
    ['0:blocks[1]', 1],
  ]),
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

test('with a brand, the name is a masthead at its printed ratio, bounded, and small print is the page tail', () => {
  const html = renderDocument({ lang: 'en', title: 'Prohibition Kitchen', pages: [page], brand })
  // The masthead stands before the navigation and the pages, as the name does on the printed page; the name is no
  // section of its own (nav.ts listedHeadings), so it takes a plain heading id.
  assert.match(
    html,
    /<\/div>\n<header class="masthead centered">\n<h3 id="h0-0-" class="hs-1 masthead-title">PROHIBITION KITCHEN<\/h3>\n<\/header>\n<section/,
  )
  assert.match(html, /\.masthead-title \{ font-size: clamp\(1\.5rem, min\(7\.824rem, 11vw\), 4\.5rem\)/)
  assert.match(html, /<footer class="small-print">\n<p>Consuming raw<\/p>\n<\/footer>\n<\/section>/)
  // The band repeats the name only for screen readers, and the section headings keep their own compression.
  assert.match(html, /<div class="band sr-only">/)
  assert.match(html, /\.hs-2 \{[^}]*font-size: clamp\(1\.125rem/)
})

test('without a brand nothing is segmented: no masthead, no small print, the band visible', () => {
  const html = renderDocument({ lang: 'en', title: 'Prohibition Kitchen', pages: [page] })
  assert.doesNotMatch(html, /masthead|small-print/)
  assert.match(html, /<div class="band"><h1>/)
})

test("an artwork logo leads the masthead, once; a big heading that is not the name stays its section (Claudio's)", () => {
  const raw = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'heading', level: 1, text: { src: [[2, 3]] } },
        { kind: 'products', items: [{ name: { src: [[4, 4]] }, prices: [{ src: [[5, 5]] }] }] },
      ],
      dropped: [],
    }),
  )
  const big = { ...extraction, runs: extraction.runs.map((r, i) => (i < 4 ? { ...r, box: { ...r.box, h: 40 } } : r)) }
  const html = renderDocument({
    lang: 'en',
    title: "Claudio's",
    pages: [{ ...page, structure: raw, extraction: big }],
    brand: { ...brand, profile: { ...profile, headings: new Map([['0:blocks[0]', 0]]) } },
    logo: { src: 'p01/img-logo.jpg', share: 0.3 },
  })
  // The band's h1 names the place for screen readers; the picture is not read again.
  assert.match(
    html,
    /<header class="masthead centered">\n<div class="logo"><img src="p01\/img-logo.jpg" alt="" class="logo"><\/div>\n<\/header>/,
  )
  assert.match(html, /<div class="band sr-only"><h1>/)
  assert.match(html, /<section[^>]*>[\s\S]*SMALL PLATES/)
})
