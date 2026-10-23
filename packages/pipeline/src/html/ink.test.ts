import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Brand } from './brand.ts'
import { renderDocument } from './document.ts'
import { profileOf } from './profile.ts'
import { inkedHtml, inkSegments, runsClasses, type Segment } from './segments.ts'

// A segment's text, ink and icon (its run is the fixture's own).
const inked = (s: readonly Segment[]): Pick<Segment, 'text' | 'color' | 'icon'>[] =>
  s.map(({ text, color, icon }) => ({ text, color, icon }))

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
  assert.deepEqual(inked(inkSegments(desc.text, extraction, "chauncey's greens, lemon")), [
    { text: "chauncey's ", color: '#c00000', icon: null },
    { text: 'greens, lemon', color: '#000000', icon: null },
  ])
  const name = structure.blocks[1]?.kind === 'products' ? structure.blocks[1].items[0]?.name : undefined
  if (!name) throw new Error('fixture')
  // The model's text stands in for the split small caps; every letter still finds its run.
  assert.deepEqual(inked(inkSegments(name, extraction, 'Curried Mussels')), [
    { text: 'Curried Mussels', color: '#000000', icon: null },
  ])
  // Letters that differ (a repaired word) give one segment, coloured only when every run agrees.
  assert.deepEqual(inked(inkSegments(desc.text, extraction, 'Chauncy greens')), [
    { text: 'Chauncy greens', color: null, icon: null },
  ])
  assert.deepEqual(inked(inkSegments({ src: [[7, 7]] }, extraction, 'Chauncy')), [
    { text: 'Chauncy', color: '#c00000', icon: null },
  ])
  const html = inkedHtml(
    [
      { text: 'a ', color: '#000000', style: null, icon: null },
      { text: 'b', color: '#111111', style: null, icon: null },
      { text: ' c', color: '#c00000', style: null, icon: null },
    ],
    new Set(['#c00000']),
    (s) => `[${s}]`,
  )
  assert.equal(html, '[a b]<span class="ink-c00000">[ c]</span>')
})

test('words their line prints in more than one style are spanned silently with their own face (Le Dive), others not', () => {
  const run = (str: string, x: number, weight: number, italic: boolean, styled: boolean): Run => ({
    id: `1:${String(x)}`,
    str,
    box: { x: x * 40, y: 0, w: 30, h: 10 },
    flow: 0,
    line: 0,
    font: { key: 'louize', weight, italic, size: 12 },
    ...(styled ? { styled: true as const } : {}),
  })
  // "High Life Lager 6": the name bold, the beer italic; "Gold" bold by its font's name alone, on a line of one style.
  const runs = [run('High', 0, 700, false, true), run('Lager', 1, 400, true, true), run('Gold', 2, 700, false, false)]
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const html = (from: number, to: number, shown: string): string =>
    inkedHtml(inkSegments({ src: [[from, to]] }, e, shown), new Set(), (s) => s)
  assert.equal(html(0, 1, 'High Lager'), '<span class="fw-700 fn">High </span><span class="fw-400 fi">Lager</span>')
  assert.equal(html(1, 2, 'Lager Gold'), '<span class="fw-400 fi">Lager </span>Gold')
  // An amount takes its words' class when they agree on one, none when one is not styled.
  assert.deepEqual(runsClasses(runs.slice(1, 2)), ['fw-400', 'fi'])
  assert.deepEqual(runsClasses(runs.slice(1)), [])
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
