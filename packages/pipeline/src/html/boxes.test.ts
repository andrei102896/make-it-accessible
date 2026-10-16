import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run, Vector } from '../pdf/types.ts'
import { boxesCss, boxesOf, wrapBoxes } from './boxes.ts'
import { contrast, fromHex } from './color.ts'

// A 600 x 800 pt page: a framed section at the top left (its heading set in the frame's top edge), a framed
// section beside it, an unframed list below; white words printed on a black panel at the foot.
const words: [string, number, number, string][] = [
  ['DESSERTS', 60, 92, '#231f20'],
  ['Cake', 50, 130, '#231f20'],
  ['8', 250, 130, '#231f20'],
  ['SIDES', 360, 92, '#231f20'],
  ['Fries', 350, 130, '#231f20'],
  ['6', 550, 130, '#231f20'],
  ['DRINKS', 50, 400, '#231f20'],
  ['Soda', 50, 430, '#231f20'],
  ['3', 550, 430, '#231f20'],
  ['Pastrami', 50, 700, '#ffffff'],
  ['21', 550, 700, '#ffffff'],
]
const runs = words.map(([str, x, y, color], i): Run => ({
  id: `1:${String(i)}`,
  str,
  box: { x, y, w: str.length * 6, h: 14 },
  flow: 0,
  line: i,
  color,
}))
const frame = (x: number, y: number, w: number, h: number): Vector => ({
  kind: 'frame',
  box: { x, y, w, h },
  color: '#aa1e2e',
  width: 2,
  rounded: false,
  double: false,
})
const vectors: Vector[] = [
  frame(40, 100, 240, 60),
  frame(340, 80, 240, 90),
  { kind: 'panel', box: { x: 40, y: 680, w: 540, h: 60 }, color: '#191716', width: 0, rounded: false, double: false },
]
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs,
  images: [],
  duplicates: [],
  hidden: [],
  vectors,
}
const section = (h: number, n: number, p: number) => [
  { kind: 'heading', level: 2, text: { src: [[h, h]] } },
  { kind: 'products', items: [{ name: { src: [[n, n]] }, prices: [{ src: [[p, p]] }] }] },
]
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      ...section(0, 1, 2),
      ...section(3, 4, 5),
      ...section(6, 7, 8),
      { kind: 'products', items: [{ name: { src: [[9, 9]] }, prices: [{ src: [[10, 10]] }] }] },
    ],
    dropped: [],
  }),
)

test('each block belongs to the smallest box holding it; a heading on the top edge opens a notched box', () => {
  const { pageFrame, boxes } = boxesOf({ structure, extraction }, new Set())
  assert.equal(pageFrame, null)
  assert.deepEqual(
    boxes.map((b) => [b.blocks, b.notched]),
    [
      [[0, 1], true],
      [[2, 3], false],
      [[6], false],
    ],
  )
  // White words on the black panel keep their printed colour; the panel keeps its fill.
  assert.equal(boxes[2]?.ink, '#ffffff')
  assert.match(boxesCss(boxes), /section \.box\.panel-191716-ffffff\.panel-191716-ffffff \* \{ color: #ffffff; \}/)
  assert.match(boxesCss(boxes), /\.frame-aa1e2e-3 \{ border: 3px solid #aa1e2e; \}/)
})

test('a frame holding most of the page is its page frame, never a box round the sections', () => {
  const page = frame(10, 10, 580, 780)
  const { pageFrame, boxes } = boxesOf(
    { structure, extraction: { ...extraction, vectors: [...vectors, page] } },
    new Set(),
  )
  assert.equal(pageFrame, page)
  assert.equal(boxes.length, 3)
})

test('boxes wrap inside a column, round a whole band, or not at all when they straddle columns', () => {
  const parts = [0, 1, 2, 3, 4, 5].map((at) => ({ at, html: `<b${String(at)}>` }))
  const box = (blocks: number[]) => ({
    vector: frame(0, 0, 100, 100),
    blocks,
    notched: false,
    centred: false,
    ink: null,
  })
  const band = {
    columns: [
      [0, 1],
      [2, 3],
    ],
  }
  const inColumn = wrapBoxes(parts, [band], [box([0, 1])])
  assert.equal(inColumn.parts.find((p) => p.at === 0)?.html, '<div class="box frame-aa1e2e-3">\n<b0>\n<b1>\n</div>')
  assert.equal(
    inColumn.parts.some((p) => p.at === 1),
    false,
  )
  assert.equal(wrapBoxes(parts, [band], [box([0, 1, 2, 3])]).bandClass.get(0), 'box frame-aa1e2e-3')
  const straddle = wrapBoxes(parts, [band], [box([1, 2])])
  assert.deepEqual(straddle.parts, parts)
  assert.equal(straddle.bandClass.size, 0)
  // Outside the bands a box wraps consecutive blocks only.
  assert.equal(wrapBoxes(parts, [], [box([4, 5])]).parts.length, 5)
  assert.equal(wrapBoxes(parts, [], [box([3, 5])]).parts.length, 6)
})

test("a light panel moves the page's secondary grey until it reads on the fill (Kenny & Ziggy's salmon)", () => {
  const salmon: Vector = { ...frame(0, 0, 100, 100), kind: 'panel', color: '#ebb6a5', width: 0 }
  const css = boxesCss([{ vector: salmon, ink: null }])
  const muted = /--muted: (#[0-9a-f]{6});/.exec(css)?.[1]
  if (!muted) throw new Error('no muted grey on the panel')
  assert.ok(contrast(fromHex(muted), fromHex('#ebb6a5')) >= 4.5)
  assert.ok(contrast(fromHex('#555555'), fromHex('#ebb6a5')) < 4.5)
})
