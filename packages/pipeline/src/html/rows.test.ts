import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rowStarts, type RowText } from './rows.ts'

// A one-line text printed at x..x+w on row y, ours `drawn` px wide where the print placed it.
const text = (x: number, y: number, w: number, drawn: number, extra: Partial<RowText> = {}): RowText => ({
  page: 0,
  printed: { x, y, w, h: 10 },
  drawn: { x: x + (w - drawn) / 2, w: drawn },
  em: 10,
  nowrap: true,
  icon: null,
  price: false,
  ...extra,
})

test('a left column of narrower stand-ins starts on its printed edge', () => {
  const wines = [text(50, 0, 200, 180), text(50, 12, 160, 150), text(50, 24, 220, 200)]
  assert.deepEqual(rowStarts(wines), [50, 50, 50])
})

test('a centred menu stays centred and a price column keeps its right edge', () => {
  const centred = [text(100, 0, 200, 180), text(150, 12, 100, 90)]
  assert.deepEqual(rowStarts(centred), [110, 155])
  const prices = [text(300, 0, 30, 24), text(310, 12, 20, 16)]
  assert.deepEqual(rowStarts(prices), [306, 314])
})

test('a name and its comma-led detail: the row on its column, the detail at its own box nearest the name', () => {
  const rows = [text(50, 0, 100, 90), text(153, 0, 80, 70), text(50, 12, 120, 110), text(173, 12, 50, 40)]
  assert.deepEqual(rowStarts(rows), [50, 153, 50, 173])
})

test('a lone line with no column stays centred where it was placed', () => {
  assert.deepEqual(rowStarts([text(100, 0, 200, 150)]), [125])
})

test('a row holding an icon meets the drawing the backdrop keeps, whatever its column', () => {
  const icon = { printed: 70, drawn: 65, end: { printed: 0, drawn: 0 } }
  const rows = [text(50, 0, 100, 90, { icon }), text(50, 12, 120, 90)]
  // Ours draws the icon 10 px into the text (65 - 55): the text starts 10 px before the drawing, inside its box.
  assert.deepEqual(rowStarts(rows), [60, 50])
  // Two drawings in one row: each piece meets its own, the words between flow from the one before.
  const two = [
    text(50, 0, 20, 20, { icon: { printed: 50, drawn: 50, end: { printed: 70, drawn: 70 } } }),
    text(73, 0, 60, 50),
    text(136, 0, 30, 30, { icon: { printed: 136, drawn: 136, end: { printed: 166, drawn: 166 } } }),
  ]
  assert.deepEqual(rowStarts(two), [50, 73, 136])
})

test('a price stays where it is placed; the name before it flows back from it, its bracket from the next icon', () => {
  // "haggis 8.75 / 14.25": the "/" is kept in the backdrop, so the prices round it must not move.
  const row = [text(50, 0, 100, 90), text(153, 0, 20, 20, { price: true })]
  assert.deepEqual(rowStarts(row), [60, 153])
  const soup = [
    text(20, 0, 20, 20, { icon: { printed: 20, drawn: 20, end: { printed: 40, drawn: 40 } } }),
    text(43, 0, 60, 50),
    text(106, 0, 5, 5),
    text(113, 0, 30, 30, { icon: { printed: 113, drawn: 113, end: { printed: 143, drawn: 143 } } }),
  ]
  // The name (narrower than printed) flows from the icon before it; its bracket from the icon after it, at 106, not 96.
  assert.deepEqual(rowStarts(soup), [20, 43, 106, 113])
})

test('a left column row ending on its price keeps both: the column edge and the price', () => {
  // "parsley butter. puff pastry 12.90" under a left column: ours narrower, the slack goes before the price.
  const rows = [text(50, 0, 150, 130), text(203, 0, 30, 30, { price: true }), text(50, 12, 200, 180)]
  assert.deepEqual(rowStarts(rows), [50, 203, 50])
})

test('a row after icons drawn wider apart than ours starts where the last drawing ends', () => {
  // Four drawings printed 0..80 px; our tags with their spaces draw 70 px: the name starts at 83, not 73.
  const icons = text(0, 0, 80, 70, { icon: { printed: 0, drawn: 5, end: { printed: 80, drawn: 75 } } })
  assert.deepEqual(rowStarts([icons, text(83, 0, 100, 90)]), [0, 83])
})

test('a text wider than its box stays where it is drawn', () => {
  const wide = { ...text(50, 0, 30, 31), drawn: { x: 50, w: 31 } }
  assert.deepEqual(rowStarts([wide, text(50, 12, 100, 90)]), [50, 50])
})

test('a wrapped text is a column for the others, never moved itself', () => {
  const para = { ...text(50, 30, 200, 200), nowrap: false }
  assert.deepEqual(rowStarts([text(50, 0, 150, 130), para]), [50, null])
})
