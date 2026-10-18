import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Brand } from './brand.ts'
import { renderDocument } from './document.ts'
import { profileOf } from './profile.ts'
import { inkedHtml, inkSegments } from './source.ts'

// Almond-like: small-caps names split into runs, a red farm name inside a black description, a dark teal note.
const words: [string, string, number][] = [
  ['RAW', '#000000', 10],
  ['BAR', '#000000', 10],
  ['C', '#000000', 12],
  ['URRIED', '#000000', 9],
  ['M', '#000000', 12],
  ['USSELS', '#000000', 9],
  ['19', '#000000', 10],
  ["chauncey's", '#c00000', 8],
  ['greens,', '#000000', 8],
  ['lemon', '#000000', 8],
  ['Karaoke', '#05262d', 8],
  ['Saturday', '#05262d', 8],
]
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, color, size], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x: 10 + (i % 6) * 60, y: 20 + Math.floor(i / 2) * 20, w: str.length * 5, h: size },
    flow: 0,
    line: Math.floor(i / 2),
    color,
    font: { key: 'minion', weight: 400, italic: false, size },
  })),
  images: [],
  duplicates: [],
  hidden: [],
}
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 2, text: { src: [[0, 1]] } },
      {
        kind: 'products',
        items: [
          {
            name: { src: [[2, 5]], text: 'Curried Mussels' },
            prices: [{ src: [[6, 6]] }],
            details: [{ kind: 'paragraph', text: { src: [[7, 9]] } }],
          },
        ],
      },
      { kind: 'paragraph', text: { src: [[10, 11]] } },
    ],
    dropped: [],
  }),
)
const page = { keyPage: 1, structure, extraction, flagged: [], imageSrc: () => undefined }

test("the profile's inks are the brand colours inside a role's words: the red farm name, not the dark teal", () => {
  const p = profileOf([{ structure, extraction }])
  assert.deepEqual(p?.inks, ['#c00000'])
})

test('colours map onto the shown text letter by letter, whitespace and case aside; else the common colour only', () => {
  const desc = structure.blocks[1]?.kind === 'products' ? structure.blocks[1].items[0]?.details[0] : undefined
  if (desc?.kind !== 'paragraph') throw new Error('fixture')
  assert.deepEqual(inkSegments(desc.text, extraction, "chauncey's greens, lemon"), [
    { text: "chauncey's ", color: '#c00000', icon: null },
    { text: 'greens, lemon', color: '#000000', icon: null },
  ])
  const name = structure.blocks[1]?.kind === 'products' ? structure.blocks[1].items[0]?.name : undefined
  if (!name) throw new Error('fixture')
  // The model's text stands in for the split small caps; every letter still finds its run.
  assert.deepEqual(inkSegments(name, extraction, 'Curried Mussels'), [
    { text: 'Curried Mussels', color: '#000000', icon: null },
  ])
  // Letters that differ (a repaired word) give one segment, coloured only when every run agrees.
  assert.deepEqual(inkSegments(desc.text, extraction, 'Chauncy greens'), [
    { text: 'Chauncy greens', color: null, icon: null },
  ])
  assert.deepEqual(inkSegments({ src: [[7, 7]] }, extraction, 'Chauncy'), [
    { text: 'Chauncy', color: '#c00000', icon: null },
  ])
  const html = inkedHtml(
    [
      { text: 'a ', color: '#000000', icon: null },
      { text: 'b', color: '#111111', icon: null },
      { text: ' c', color: '#c00000', icon: null },
    ],
    new Set(['#c00000']),
    (s) => `[${s}]`,
  )
  assert.equal(html, '[a b]<span class="ink-c00000">[ c]</span>')
})

test('with a brand the red words are wrapped and coloured at 4.5:1; the contents label stays plain; without, nothing', () => {
  const profile = profileOf([{ structure, extraction }])
  if (!profile) throw new Error('no profile')
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
  const html = renderDocument({ lang: 'en', title: 'Almond', kind: 'menu', pages: [page], brand })
  assert.match(html, /<p class="desc lead"><span class="ink-c00000">chauncey's <\/span>greens, lemon<\/p>/)
  assert.match(html, /\.ink-c00000, \.products\.menu \.price\.ink-c00000 \{ color: #c00000; \}/)
  // The dark teal note is ink: no tint, it inherits the text colour.
  assert.doesNotMatch(html, /#05262d/)
  assert.doesNotMatch(renderDocument({ lang: 'en', title: 'Almond', pages: [page] }), /ink-/)
})
