import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import { validatePage } from '../validate/validate.ts'
import { legendOf, withIcons, type IconPiece } from './icons.ts'
import type { Extraction, Run } from './types.ts'

// Howies' group menu legend (Waterloo p1, y 764.7): V and Dairy Free within a point of each other, told apart by
// their drawings; shapes are path points as shares of the icon's box (pdf/art.ts shapeIn).
type Shape = [number, number][]
const ring: Shape = [
  [0, 0.5],
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
]
const V: Shape = [...ring, [0.3, 0.25], [0.5, 0.75], [0.7, 0.25]]
const DAIRY: Shape = [...ring, [0.4, 0.2], [0.6, 0.2], [0.6, 0.8], [0.4, 0.8], [0.15, 0.15], [0.85, 0.85]]
const LOBSTER: Shape = [...ring, [0.2, 0.45], [0.8, 0.45], [0.5, 0.1], [0.5, 0.9], [0.35, 0.7], [0.65, 0.7]]
const LEAF: Shape = [
  [0, 0.2],
  [0.4, 1],
  [1, 0],
  [0.5, 0.5],
]
const NUT: Shape = [
  [0.5, 0],
  [0, 0.4],
  [1, 0.4],
  [0.5, 1],
]

let n = 0
const word = (str: string, x: number, y: number, line: number, w = 20): Run => ({
  id: `1:${String(n++)}`,
  str,
  box: { x, y, w, h: 12.7 },
  flow: 0,
  line,
})
const icon = (x: number, y: number, w: number, h: number, shape?: Shape): IconPiece => ({
  box: { x, y, w, h },
  kind: 'vector',
  ...(shape && { shape }),
})
const page = (runs: Run[], icons: IconPiece[]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 842,
  runs,
  images: [],
  duplicates: [],
  hidden: [],
  icons,
})

const legendLine = [
  word('Vegetarian', 161.1, 764.7, 90, 37.6),
  word('Vegan', 218, 764.7, 90, 22.1),
  word('Dairy', 257.9, 764.7, 90, 18.7),
  word('Free', 279, 764.7, 90, 16),
  word('Contains', 312.3, 764.7, 90, 31.8),
  word('nuts', 346.1, 764.7, 90, 15.4),
  word('Please', 365.3, 764.7, 90, 22.3),
  word('ask', 389.5, 764.7, 90, 11),
  word('for', 402, 764.7, 90, 10),
  word('(', 414, 764.7, 90, 3),
]
const legendIcons = [
  icon(148.7, 765.9, 9.53, 9.55, V),
  icon(202.3, 766.5, 13.9, 8.9, LEAF),
  icon(245.2, 765.8, 9.99, 9.69, DAIRY),
  icon(298.3, 763.7, 8.48, 11.73, NUT),
]

test('legend icons alike in size are told apart by their drawing; a label running on ends at the next phrase', () => {
  const legend = legendOf([page(legendLine, legendIcons)])
  assert.deepEqual(
    legend.map((l) => l.label),
    ['vegetarian', 'vegan', 'dairy free', 'contains nuts'],
  )
})

test('an inline icon takes the name of the drawing it repeats at any size; a mark like none holds its page', () => {
  const legend = legendOf([page(legendLine, legendIcons)])
  // Each dish on its own line: the icon, then its name.
  const dish = (k: number): Run => word(`Dish${String(k)}`, 100, 100 + k * 30, k)
  const runs = [0, 1, 2, 3, 4].map(dish)
  const inline = [
    icon(80, 101, 9.53, 9.0, V),
    icon(80, 131, 10.0, 9.7, DAIRY),
    icon(80, 161, 12.5, 8.2, LEAF),
    icon(80, 191, 9.8, 9.8, LOBSTER),
    icon(80, 221, 30, 12, LOBSTER),
  ]
  const e = withIcons(page(runs, inline), legend)
  assert.deepEqual(
    e.runs.filter((r) => r.icon).map((r) => [r.str, r.line]),
    [
      ['vegetarian', 0],
      ['dairy free', 1],
      ['vegan', 2],
    ],
  )
  // The lobster disc the legend's size is unnamed; a wider drawing beyond the legend's heights is no icon of it.
  assert.deepEqual(
    e.icons?.map((i) => i.unnamed ?? false),
    [false, false, false, true, false],
  )
  const structure = parsePage(
    JSON.stringify({ lang: 'en', blocks: [{ kind: 'products', items: [{ name: { src: [[0, 4]] } }] }], dropped: [] }),
  )
  assert.deepEqual(
    validatePage(structure, e).review.filter((f) => f.path.startsWith('icon@')),
    [
      {
        path: 'icon@80,191',
        problem: `a mark the size of the legend's icons matches none of them, before "Dish3"`,
      },
    ],
  )
})

test("legend icons with one drawing and two labels name nothing (Cattlemen's arrows); no shapes fall back to size", () => {
  const arrows = [icon(148.7, 765.9, 9.5, 9.5, V), icon(245.2, 765.8, 9.5, 9.5, V)]
  const twoLabels = [word('Starters', 161, 764.7, 90, 30), word('Desserts', 258, 764.7, 90, 30)]
  assert.deepEqual(legendOf([page(twoLabels, arrows)]), [])
  const plain = legendIcons.map(({ box, kind }) => ({ box, kind }))
  assert.deepEqual(
    legendOf([page(legendLine, plain)]).map((l) => l.label),
    ['vegan', 'contains nuts'],
  )
})

test("an icon is measured against the word beside it, not a line read across columns (Howies' houmous leaf)", () => {
  // "[leaf][V] Homemade houmous 2.95" at 17.1 pt, and a 13.7 pt line of the next column 3.5 pt lower.
  const runs = [word('Homemade', 110, 486.6, 0, 55), word('houmous', 168, 486.6, 0, 40)]
  const other = { ...word('bacon', 671, 490.1, 0, 25), box: { x: 671, y: 490.1, w: 25, h: 18.3 } }
  const leaf = icon(81.1, 490.5, 12.5, 8.2, LEAF)
  const e = withIcons(page([...runs, other], [leaf]), legendOf([page(legendLine, legendIcons)]))
  assert.deepEqual(
    e.runs.filter((r) => r.icon).map((r) => r.str),
    ['vegan'],
  )
})
