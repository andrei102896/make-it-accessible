import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run, Vector } from '../pdf/types.ts'
import { boxesCss, boxesOf, wrapBoxes } from './boxes.ts'
import { topLevel } from './ground.ts'
import { unfilled } from '../pdf/vectors.ts'
import { contrast, fromHex } from './color.ts'

// The page's colours as drawn (brand.ts paintedOf): dark text, the base grey, nothing else painted.
const PAGE = { text: '#1a1a1a', muted: '#555555', accent: null, painted: [] }

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
  assert.match(
    boxesCss(boxes, PAGE),
    /\.panel-191716-ffffff \{ background: #191716; [^}]*--fg: #ffffff; color: #ffffff;/,
  )
  assert.match(boxesCss(boxes, PAGE), /\.frame-aa1e2e-3 \{ border: 3px solid #aa1e2e; \}/)
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
    kept: [],
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
  const css = boxesCss([{ vector: salmon, ink: null, kept: [] }], PAGE)
  const muted = /--muted: (#[0-9a-f]{6});/.exec(css)?.[1]
  if (!muted) throw new Error('no muted grey on the panel')
  assert.ok(contrast(fromHex(muted), fromHex('#ebb6a5')) >= 4.5)
  assert.ok(contrast(fromHex('#555555'), fromHex('#ebb6a5')) < 4.5)
})

test("a filled frame keeps its fill and its printed rule; its colours move each on its own (Howies' cream cards)", () => {
  const card: Vector = { ...frame(0, 0, 100, 100), color: '#eaceb0', width: 1, fill: '#f7ecdf' }
  const strip: Vector = { ...frame(0, 0, 100, 100), color: '#eaceb0', width: 1 }
  const drawn = {
    text: '#1a1a1a',
    muted: '#555555',
    accent: null,
    painted: [
      { selector: '.products.menu .prices, td.num', printed: '#ce9156', shown: '#a5692e' },
      { selector: '.products.menu .name', printed: '#183a5a', shown: '#183a5a' },
    ],
  }
  const css = boxesCss(
    [
      { vector: card, ink: null, kept: [] },
      { vector: strip, ink: null, kept: [] },
    ],
    drawn,
  )
  // One stroke, two looks: the card's class names its fill.
  assert.match(
    css,
    /\.frame-eaceb0-1-f7ecdf \{ background: #f7ecdf; --bg: #f7ecdf; --focus: #[0-9a-f]{6}; border: 1px solid #eaceb0;/,
  )
  assert.match(css, /\.frame-eaceb0-1 \{ border: 1px solid #eaceb0; \}/)
  // A light fill restates the page's text, so a box never inherits a dark page's.
  assert.match(
    css,
    /f7ecdf \{ background: #f7ecdf; --bg: #f7ecdf; --focus: #[0-9a-f]{6}; border: 1px solid #eaceb0; --fg: #1a1a1a; color: #1a1a1a;/,
  )
  // Gold stays gold, darkened to read on cream; navy already reads and is left alone.
  const gold =
    /\.products\.menu \.prices:where\(\.frame-eaceb0-1-f7ecdf \*\), td\.num:where\(\.frame-eaceb0-1-f7ecdf \*\) \{ color: (#[0-9a-f]{6}); \}/.exec(
      css,
    )?.[1]
  if (!gold) throw new Error(css)
  assert.ok(contrast(fromHex(gold), fromHex('#f7ecdf')) >= 4.5)
  const [r, g, b] = fromHex(gold)
  assert.ok(r > g && g > b, gold)
  // Once one colour moves, every painted rule is written again in the page's order, navy as shown.
  assert.match(css, /\.products\.menu \.name:where\(\.frame-eaceb0-1-f7ecdf \*\) \{ color: #183a5a; \}/)
})

test("a frame's fill moves without touching its rule; a heading printed on a fill stays inside, one above leaves", () => {
  const above = { ...frame(40, 102, 240, 58), kind: 'panel' as const, color: '#e94e1b', width: 0 }
  const lifted = boxesOf({ structure, extraction: { ...extraction, vectors: [above] } }, new Set()).boxes
  assert.deepEqual(
    lifted.map((b) => b.blocks),
    [[1]],
  )
  const banner = { ...frame(40, 95, 240, 65), color: '#ffffff', width: 3, fill: '#d42e1f' }
  const white = runs.map((r) => ({ ...r, color: '#ffffff' }))
  const { boxes } = boxesOf({ structure, extraction: { ...extraction, runs: white, vectors: [banner] } }, new Set())
  const box = boxes.find((b) => b.blocks.includes(0))
  if (!box?.vector.fill) throw new Error('no filled box')
  assert.equal(box.vector.color, '#ffffff')
  assert.ok(contrast(fromHex(box.vector.fill), fromHex('#ffffff')) >= 4.5)
  assert.equal(box.notched, false)
})

test('a dark document on a light fill moves its light text there', () => {
  const panel: Vector = { ...frame(0, 0, 100, 100), kind: 'panel', color: '#f7ecdf', width: 0 }
  const css = boxesCss([{ vector: panel, ink: null, kept: [] }], {
    text: '#f2f2f2',
    muted: '#c4c4c4',
    accent: null,
    painted: [],
  })
  const fg = /--fg: (#[0-9a-f]{6}); color: \1;/.exec(css)?.[1]
  if (!fg) throw new Error(css)
  assert.ok(contrast(fromHex(fg), fromHex('#f7ecdf')) >= 4.5)
})

test('a selector list splits at its own commas only; an unfilled frame is the frame without its fill', () => {
  assert.deepEqual(topLevel('.products.menu > li > :not(.name, .prices), .products.cards .more > p'), [
    '.products.menu > li > :not(.name, .prices)',
    '.products.cards .more > p',
  ])
  const card: Vector = { ...frame(0, 0, 100, 100), fill: '#f7ecdf' }
  assert.deepEqual(unfilled(card), frame(0, 0, 100, 100))
})
