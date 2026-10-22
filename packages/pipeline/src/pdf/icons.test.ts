import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconsOn, legendOf, withIcons, type IconPiece } from './icons.ts'
import type { Extraction, Run } from './types.ts'

// Howies' legend line (p2, y 959.6) and its inline icons (p1), to the tenth of a point.
let n = 0
const word = (str: string, x: number, y: number, w: number, line = 0, flow = 0): Run => ({
  id: `1:${String(n++)}`,
  str,
  box: { x, y, w, h: 16.9 },
  flow,
  line,
})
const piece = (x: number, y: number, w: number, h: number, kind: IconPiece['kind'] = 'vector'): IconPiece => ({
  box: { x, y, w, h },
  kind,
})
const legendRuns = [
  word('Gluten', 472.6, 959.6, 32.6, 77),
  word('free', 507.8, 959.6, 18.8, 77),
  word('Dairy', 561.2, 959.6, 26.1, 80),
  word('free', 589.9, 959.6, 18.8, 80),
  word('Contains', 643.3, 959.6, 42, 81),
  word('nuts', 688, 959.6, 20.1, 81),
  word('Vegetarian', 533.4, 974.5, 50.2, 82),
  word('Vegan', 618.2, 974.5, 29, 83),
  word('With', 203.8, 949.6, 22.8, 74),
  word('house', 229.3, 949.6, 27.7, 74),
]
const legendPieces = [
  piece(459.5, 961.4, 10.4, 13.6),
  // The dairy drop inside its circle, and the nut in two strokes: pieces of one drawing each.
  piece(544.8, 960.6, 13, 13),
  piece(549, 963, 3.8, 9),
  piece(630.3, 961.4, 8.1, 5.5),
  piece(630.3, 967.4, 8.1, 5.5),
  piece(519, 976.6, 11.3, 11.6),
  piece(599, 976.8, 16.9, 11.4),
]
const page = (runs: Run[], icons: IconPiece[], pdfPage = 1): Extraction => ({
  pdfPage,
  width: 842,
  height: 1191,
  runs,
  images: [],
  duplicates: [],
  hidden: [],
  icons,
})

test("a legend line's icons each take the label after them; pieces of one drawing count once (Howies p2)", () => {
  const icons = iconsOn(legendPieces, legendRuns)
  assert.equal(icons.length, 5)
  const legend = legendOf([page(legendRuns, icons, 2)])
  assert.deepEqual(
    legend.map((l) => l.label),
    ['gluten free', 'dairy free', 'contains nuts', 'vegetarian', 'vegan'],
  )
  const nuts = legend[2]?.box
  assert.deepEqual([nuts?.x, nuts?.y, nuts && Math.round(nuts.w * 10) / 10, nuts?.h], [630.3, 961.4, 8.1, 11.5])
})

test('a dish line is no legend: its words carry a price; two legend icons of one size name nothing', () => {
  const dish = [word('Affogato', 170, 300, 50), word('7.50', 230, 300, 24)]
  assert.deepEqual(legendOf([page(dish, [piece(155, 301.5, 10.4, 13.6)])]), [])
  const twins = [piece(459.5, 961.4, 10.4, 13.6), piece(544.8, 960.6, 10.9, 13.2), piece(630.3, 961.4, 8.1, 11.5)]
  assert.deepEqual(
    legendOf([page(legendRuns.slice(0, 6), twins, 2)]).map((l) => l.label),
    ['contains nuts'],
  )
})

test('inline icons the legend names become words at their box, on the line of the word beside them', () => {
  const legend = legendOf([page(legendRuns, iconsOn(legendPieces, legendRuns), 2)])
  const runs = [
    word('Cullen', 180, 257.4, 40, 12, 3),
    word('skink', 224, 257.4, 18, 12, 3),
    word('(', 243, 257.4, 4.1, 12, 3),
    word('available)', 265.4, 257.4, 42.7, 12, 3),
    word('Award', 150, 311, 40, 15, 3),
  ]
  const inline = [piece(251.4, 259.2, 10.7, 13.6), piece(130.4, 311.9, 13.4, 13), piece(400, 600, 30, 30)]
  const e = withIcons(page(runs, iconsOn(inline, runs)), legend)
  assert.deepEqual(
    e.runs.slice(5).map((r) => [r.id, r.str, r.line, r.icon]),
    [
      ['1:5', 'gluten free', 12, true],
      ['1:6', 'dairy free', 15, true],
    ],
  )
  assert.deepEqual(e.runs[5]?.box, inline[0]?.box)
  assert.equal(withIcons(page(runs, []), legend).runs.length, 5)
  // The legend printed on two pages lists each label twice: one label is still one name.
  const twice = legendOf([
    page(legendRuns, iconsOn(legendPieces, legendRuns), 2),
    page(legendRuns, iconsOn(legendPieces, legendRuns), 3),
  ])
  assert.equal(twice.length, 10)
  assert.equal(withIcons(page(runs, iconsOn(inline, runs)), twice).runs.length, 7)
})

test("a line is anchored on its first word: the left column's lines do not chain the right column's into one tall band (Howies' salmon line)", () => {
  const runs = [
    word('Scottish', 119.7, 271.8, 38.6, 1),
    word('chowder', 352.9, 271.8, 40, 1),
    word('Served', 153.3, 286.2, 32.4, 2),
    word('focaccia', 320.4, 286.2, 38.8, 2),
    word('(', 529.5, 276.6, 4.1, 3, 1),
    word('available)', 567.5, 276.6, 42.7, 3, 1),
    word('Homemade', 489.6, 291, 55.3, 4, 1),
    word('soda', 547.5, 291, 21.3, 4, 1),
  ]
  const icons = iconsOn([piece(535.4, 279.5, 10.7, 13.6), piece(550.6, 279.1, 13.4, 13)], runs)
  assert.deepEqual(
    icons.map((i) => i.box.x),
    [535.4, 550.6],
  )
})

test('a legend that restates the phrase its icon is used in names the icon without it (Howies group "NGCI")', () => {
  // "[leaf] Vegan … ( [wheat] NGCI available )" and two dishes printing "( [wheat] available)".
  const legend = [
    word('Vegan', 263, 800, 23, 90),
    word('(', 463, 800, 2, 90),
    word('NGCI', 477, 800, 22, 90),
    word('available', 501, 800, 30, 90),
    word(')', 532, 800, 2, 90),
  ]
  const dish = (y: number, line: number): Run[] => [
    word('(', 310.7, y, 3.2, line),
    word('available)', 324.3, y, 41.4, line),
  ]
  const icons = [
    piece(246.9, 802.1, 13.9, 8.9),
    piece(466.9, 800.4, 7.3, 9.7),
    piece(314, 240, 7.3, 9.7),
    piece(314, 400, 7.3, 9.7),
  ]
  const named = legendOf([page([...legend, ...dish(237.5, 10), ...dish(397.5, 20)], icons)])
  assert.deepEqual(
    named.map((l) => l.label),
    ['vegan', 'NGCI'],
  )
})
