import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import { BACKDROP_VERSION, type Grid } from '../pdf/backdrop.ts'
import type { Pixels } from '../pdf/pixels.ts'
import type { Box, Extraction, Vector } from '../pdf/types.ts'
import { boxesOf } from './boxes.ts'
import { fromHex, type Rgb } from './color.ts'
import { unfilled } from '../pdf/vectors.ts'
import { asSeen, fillSeen, fillsOf } from './seen.ts'
import type { HtmlPage } from './types.ts'

const WHITE: Rgb = [255, 255, 255]
const inBox = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
// A 100 x 60 px page (72 dpi: a pixel per point) drawn by `at`.
const img = (at: (x: number, y: number) => Rgb): Pixels => ({ width: 100, height: 60, at })
const box = { x: 10, y: 10, w: 60, h: 30 }
const word = { x: 20, y: 20, w: 30, h: 8 }
// The fill drawn round the word, the word's letters dark.
const filled = (c: Rgb): Pixels => img((x, y) => (inBox(word, x, y) ? [20, 20, 20] : inBox(box, x, y) ? c : WHITE))

test('a fill is seen round its words within the drift between renders, in the colour printed', () => {
  // Gigi's olive: #aa9749 drawn, #b4a266 printed (33 away).
  assert.deepEqual(fillSeen(filled(fromHex('#b4a266')), box, [word], '#aa9749'), { look: 'fill', colour: '#b4a266' })
  // 54 away is another colour over it.
  assert.equal(fillSeen(filled([170, 151, 127]), box, [word], '#aa9749').look, 'none')
})

test("a fill seen only round its edge is a border; a card drawn over it hides it (Kenny & Ziggy's planks)", () => {
  const green = fromHex('#476e4c')
  const edge = (x: number, y: number): boolean =>
    inBox(box, x, y) && !inBox({ x: box.x + 3, y: box.y + 3, w: box.w - 6, h: box.h - 6 }, x, y)
  assert.deepEqual(
    fillSeen(
      img((x, y) => (edge(x, y) ? green : WHITE)),
      box,
      [word],
      '#476e4c',
    ),
    {
      look: 'edge',
      colour: '#476e4c',
    },
  )
  // A hairline blended into white at .35 of its colour (Scotts' gratuity note).
  const hairline = img((x, y) =>
    edge(x, y) && (x === box.x || y === box.y || y === 39 || x === 69) ? [178, 177, 178] : WHITE,
  )
  assert.equal(fillSeen(hairline, box, [word], '#231f20').look, 'edge')
  assert.equal(
    fillSeen(
      img(() => fromHex('#fff200')),
      box,
      [word],
      '#814f2e',
    ).look,
    'none',
  )
})

const panel = (x: number, y: number, w: number, h: number, color = '#814f2e'): Vector => ({
  kind: 'panel',
  box: { x, y, w, h },
  color,
  width: 0,
  rounded: false,
  double: false,
})

test('fills of one colour laid edge to edge, six or more, are a texture; a frame stroked on an unseen fill goes with it', () => {
  const brown = img(() => fromHex('#814f2e'))
  const row = (n: number): Vector[] => Array.from({ length: n }, (_, i) => panel(i * 15, 10, 15, 10))
  assert.ok(fillsOf(brown, row(6), []).every((f) => f.look === 'none'))
  assert.ok(fillsOf(brown, row(3), []).every((f) => f.look === 'fill'))
  const frame: Vector = { ...panel(10, 10, 60, 30, '#220000'), kind: 'frame', width: 1 }
  const looks = fillsOf(
    img(() => fromHex('#fff200')),
    [panel(10, 10, 60, 30), frame],
    [word],
  )
  assert.deepEqual(
    looks.map((f) => [f.index, f.look]),
    [
      [0, 'none'],
      [1, 'none'],
    ],
  )
})

// A plank drawn first, a yellow card over it: the words' centre lies on both.
const plank = panel(0, 300, 300, 30)
const card = panel(0, 200, 400, 200, '#fff200')
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: [{ id: '1:0', str: 'Pancakes', box: { x: 20, y: 305, w: 60, h: 14 }, flow: 0, line: 0, color: '#231f20' }],
  images: [],
  duplicates: [],
  hidden: [],
  vectors: [plank, card],
}
const structure = parsePage(
  JSON.stringify({ lang: 'en', blocks: [{ kind: 'paragraph', text: { src: [[0, 0]] } }], dropped: [] }),
)
const grid = (fills: Grid['fills']): Grid => ({
  version: BACKDROP_VERSION,
  cell: 8,
  cols: 1,
  rows: 1,
  min: [1],
  max: [1],
  mean: ['#ffffff'],
  inks: {},
  alpha: {},
  shadows: {},
  strokes: {},
  undrawn: [],
  kept: [],
  ends: {},
  capsFaces: [],
  ground: null,
  fills,
})
const page = (fills: Grid['fills']): HtmlPage => ({
  keyPage: 1,
  structure,
  extraction,
  flagged: [],
  imageSrc: () => undefined,
  backdrop: { src: 'b.webp', src2x: 'b2.webp', grid: grid(fills) },
})

test('an unseen plank leaves before the boxes are made: its words reach the card printed over it', () => {
  const looks: NonNullable<Grid['fills']>['looks'] = [
    { index: 0, look: 'none', colour: '#814f2e' },
    { index: 1, look: 'fill', colour: '#fdf001' },
  ]
  assert.equal(boxesOf(page(null), new Set()).boxes[0]?.vector.color, '#814f2e')
  const seen = asSeen(page({ vectors: 2, looks }))
  assert.deepEqual(boxesOf(seen, new Set()).boxes[0]?.blocks, [0])
  assert.equal(boxesOf(seen, new Set()).boxes[0]?.vector.color, '#fdf001')
  // An edge seen alone is a frame in its colour; fills measured on another build's vectors change nothing.
  const edge = asSeen(page({ vectors: 2, looks: [{ index: 1, look: 'edge', colour: '#e13929' }] }))
  assert.deepEqual(edge.extraction.vectors?.[1], { ...card, kind: 'frame', color: '#e13929', width: 1.5 })
  assert.equal(asSeen(page({ vectors: 3, looks })).extraction.vectors?.length, 2)
})

test('each word is read by the smallest fill holding it: a cream section keeps its fill round a white card', () => {
  const section = { ...panel(5, 5, 90, 50, '#f0e1be') }
  const card = { ...panel(30, 25, 60, 25, '#ffffff') }
  const heading = { x: 10, y: 10, w: 20, h: 6 }
  const item = { x: 40, y: 32, w: 30, h: 6 }
  const page = img((x, y) => (inBox(card.box, x, y) ? WHITE : inBox(section.box, x, y) ? fromHex('#f0e1be') : WHITE))
  assert.deepEqual(
    fillsOf(page, [section, card], [heading, item]).map((f) => f.look),
    ['fill', 'fill'],
  )
})

test('a band and the badges drawn on it are no texture; a frame whose fill is hidden keeps its rule', () => {
  const red = img(() => fromHex('#d12347'))
  const badges = Array.from({ length: 5 }, (_, i) => panel(5 + i * 18, 22, 12, 12, '#d12347'))
  const looks = fillsOf(red, [panel(0, 20, 100, 16, '#d12347'), ...badges], [])
  assert.ok(looks.every((f) => f.look === 'fill'))
  const photo: Vector = { ...panel(10, 10, 60, 30, '#231f20'), kind: 'frame', fill: '#ffffff' }
  assert.deepEqual(
    fillsOf(
      img(() => fromHex('#3a7d44')),
      [photo],
      [],
    ).map((f) => f.look),
    ['rule'],
  )
  const framed = page({ vectors: 2, looks: [{ index: 0, look: 'rule', colour: '#231f20' }] })
  const shown = asSeen({ ...framed, extraction: { ...extraction, vectors: [photo, card] } })
  assert.deepEqual(shown.extraction.vectors?.[0], unfilled(photo))
})
