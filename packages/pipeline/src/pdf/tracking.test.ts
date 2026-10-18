import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PdfFont, PdfItem } from './pdfjs.ts'
import { trackingOf } from './tracking.ts'
import type { Run } from './types.ts'

// Codes 1–3 draw A, B, C at 500 units; 4 is a ligature "fi", which no single letter maps to.
const map: (string | undefined)[] = []
map[1] = 'A'
map[2] = 'B'
map[3] = 'C'
map[4] = 'fi'
const widths: (number | undefined)[] = []
widths[1] = 500
widths[2] = 500
const font: PdfFont = { loadedName: 'f1', isType3Font: false, defaultWidth: 500, widths, toUnicode: { _map: map } }
// One line at 20 pt on its baseline at y 100 of a 200 pt page: x 10 to 210.
const item: PdfItem = { str: 'ABC CBA', transform: [20, 0, 0, 20, 10, 100], width: 200, fontName: 'f1' }
const run = (id: string, str: string, x: number, w: number): Run => ({
  id,
  str,
  box: { x, y: 85, w, h: 20 },
  flow: 0,
  line: 0,
})

test("a word wider than its letters' advances is tracked by the difference shared by its letters (Bannatyne)", () => {
  // Natural width 3 × 500 × 20 / 1000 = 30 pt; printed 36 pt: 3 pt in each of the 2 gaps, 0.15 em.
  const spaced = run('1:0', 'ABC', 10, 36)
  const set = run('1:1', 'CBA', 60, 30.2)
  assert.deepEqual(trackingOf([spaced, set], [item], [font], [0, 0, 300, 200]), { '1:0': 0.15 })
})

test('a word with a letter its font cannot encode, or outside any text item, is not measured', () => {
  const lig = run('1:0', 'Afi', 10, 50)
  const away = run('1:1', 'ABC', 300, 50)
  assert.deepEqual(trackingOf([lig, away], [item], [font], [0, 0, 300, 200]), {})
})

test('horizontal scaling narrows the advances, not the tracking; standard fonts list widths by code', () => {
  // Tz 50: advances 10 pt wide at size 20, so "ABC" is 15 pt natural and 15 pt printed.
  const squeezed: PdfItem = { ...item, transform: [10, 0, 0, 20, 10, 100] }
  const standard: PdfFont = { ...font, widths: { '1': 500, '2': 500, '3': 500 } }
  assert.deepEqual(trackingOf([run('1:0', 'ABC', 10, 15)], [squeezed], [standard], [0, 0, 300, 200]), {})
  assert.deepEqual(trackingOf([run('1:0', 'ABC', 10, 21)], [squeezed], [standard], [0, 0, 300, 200]), { '1:0': 0.15 })
})

test("a word is measured in the item that prints it, not one whose baseline falls in its tall box (Bannatyne's script); pdf.js spaces tracked letters out", () => {
  // A 20 pt line of "XYZ" whose baseline (y 100) falls inside the tall box of "ABC" printed below it.
  const above: PdfItem = { str: 'X Y Z', transform: [20, 0, 0, 20, 10, 100], width: 200, fontName: 'f1' }
  const below: PdfItem = { ...item, str: 'A B C', transform: [20, 0, 0, 20, 10, 60] }
  const tall = { ...run('1:0', 'ABC', 10, 36), box: { x: 10, y: 85, w: 36, h: 60 } }
  assert.deepEqual(trackingOf([tall], [above, below], [font], [0, 0, 300, 200]), { '1:0': 0.15 })
})
