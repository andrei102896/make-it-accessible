import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Brand } from './brand.ts'
import { renderDocument } from './document.ts'
import { profileOf } from './profile.ts'
import { inkedHtml, inkSegments, runsClasses, type Segment } from './segments.ts'
import { css } from './style.ts'

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

test("each word's italic is its own; weight only where its line mixes styles (Le Dive, Howies' notes), silently", () => {
  const run = (str: string, x: number, weight: number, italic: boolean, styled: boolean): Run => ({
    id: `1:${String(x)}`,
    str,
    box: { x: x * 40, y: 0, w: 30, h: 10 },
    flow: 0,
    line: 0,
    font: { key: 'louize', weight, italic, size: 12 },
    ...(styled ? { styled: true as const } : {}),
  })
  // "High Life Lager 6": name bold, beer italic; "Gold" bold by its name alone; a note italic on a line of its own.
  const runs = [
    run('High', 0, 700, false, true),
    run('Lager', 1, 400, true, true),
    run('Gold', 2, 700, false, false),
    run('Perfect', 3, 300, true, false),
  ]
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const html = (from: number, to: number, shown: string): string =>
    inkedHtml(inkSegments({ src: [[from, to]] }, e, shown), new Set(), (s) => s)
  assert.equal(html(0, 1, 'High Lager'), '<span class="fw-700">High </span><span class="fw-400 fi">Lager</span>')
  assert.equal(html(1, 2, 'Lager Gold'), '<span class="fw-400 fi">Lager </span>Gold')
  assert.equal(html(3, 3, 'Perfect'), '<span class="fi">Perfect</span>')
  // Letters that do not follow their runs: the leaf takes most of its runs' italic, no weight.
  assert.equal(html(2, 3, 'Golden Perfect'), '<span class="fi">Golden Perfect</span>')
  // An amount takes its words' classes when they agree, none when they differ.
  assert.deepEqual(runsClasses(runs.slice(1, 2)), ['fw-400', 'fi'])
  assert.deepEqual(runsClasses(runs.slice(3)), ['fi'])
  assert.deepEqual(runsClasses(runs.slice(1, 3)), [])
  // A word its text matrix slants leans (an upright face sheared), never asking its italic file.
  const sheared: Extraction = { ...e, runs: [{ ...run('Served', 0, 400, false, false), slanted: true }] }
  assert.equal(
    inkedHtml(inkSegments({ src: [[0, 0]] }, sheared, 'Served'), new Set(), (s) => s),
    '<span class="fo">Served</span>',
  )
  // Named italic wins over a slant; a leaf whose letters do not follow its runs takes most of them; mixed runs: none.
  const mixed: Extraction = {
    ...e,
    runs: [
      { ...run('Served', 0, 400, true, false), slanted: true },
      { ...run('With', 1, 400, false, false), slanted: true },
      run('Your', 2, 400, false, false),
    ],
  }
  assert.equal(
    inkedHtml(inkSegments({ src: [[0, 0]] }, mixed, 'Served'), new Set(), (s) => s),
    '<span class="fi">Served</span>',
  )
  assert.equal(
    inkedHtml(inkSegments({ src: [[1, 1]] }, mixed, 'Withh'), new Set(), (s) => s),
    '<span class="fo">Withh</span>',
  )
  assert.deepEqual(runsClasses(mixed.runs.slice(1)), [])
  // A span synthesises a style its file lacks, keeping a small-caps role's synthesis.
  assert.match(css(null, null), /:is\(\[class\*="fw-"\], \.fi, \.fo\) \{ font-synthesis: weight style small-caps; \}/)
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
