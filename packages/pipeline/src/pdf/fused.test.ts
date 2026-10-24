import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitFused, withSplit } from './fused.ts'
import type { PdfItem } from './pdfjs.ts'
import { isLeader } from './runs.ts'
import type { Run } from './types.ts'

const view = [0, 0, 612, 792] as const
// Items 9 pt high on the baseline 110 pt from the top (the runs' box spans 100–112), unless `base` says otherwise.
const item = (str: string, x: number, width: number, base = 110): PdfItem => ({
  str,
  transform: [9, 0, 0, 9, x, 792 - base],
  width,
  fontName: 'f1',
})
const run = (id: number, str: string, x: number, w: number): Run => ({
  id: `1:${String(id)}`,
  str,
  box: { x, y: 100, w, h: 12 },
  flow: 0,
  line: 0,
  color: '#000000',
})
const words = (runs: readonly Run[]): string[] => runs.map((r) => r.str)

test("a word fused across a column gap splits at pdf.js' items, boxed at them (Eusebi's 250ml | btl)", () => {
  const { runs, pieces } = splitFused(
    [run(0, '8.25', 206.3, 17.6), run(1, '1131', 247.1, 29.3)],
    [item('8.25', 206.3, 17.6), item('11', 247.1, 5.2), item('31', 269.1, 7.3)],
    view,
    1,
  )
  assert.deepEqual(words(runs), ['8.25', '11', '31'])
  assert.deepEqual(
    runs.map((r) => [r.id, r.box.x, Math.round(r.box.w * 10) / 10, r.color]),
    [
      ['1:0', 206.3, 17.6, '#000000'],
      ['1:1', 247.1, 5.2, '#000000'],
      ['1:2', 269.1, 7.3, '#000000'],
    ],
  )
  assert.deepEqual(pieces.get('1:1'), ['1:1', '1:2'])
})

test("a leader parts a name from it and from the price after it, the name's item starting before the word (Bernie's)", () => {
  const { runs } = splitFused(
    [run(0, 'Baked', 72, 26), run(1, 'Clams . . . . . 7', 100.9, 403.4), run(2, 'for', 508, 9)],
    [item('Baked Clams', 72, 55.3), item('. . . . .', 132, 367.2), item('7', 500, 4.3), item('for', 508, 9)],
    view,
    1,
  )
  assert.deepEqual(words(runs), ['Baked', 'Clams', '. . . . .', '7', 'for'])
  assert.deepEqual(
    runs.map((r) => r.box.x),
    [72, 100.9, 132, 500, 508],
  )
  assert.equal(Math.round((runs[1]?.box.w ?? 0) * 10) / 10, 26.4)
})

test('a leader whose dots the readers count apart still parts the price (Bernie\'s "Wings": 64 dots, 66)', () => {
  const { runs } = splitFused(
    [run(0, 'Wings . . . . 6', 137, 367.2)],
    [item('Grilled Buffalo Wings', 72, 90.7), item('. . . . . .', 163.3, 336), item('6', 499.9, 4.3)],
    view,
    1,
  )
  assert.deepEqual(words(runs), ['Wings', '. . . .', '6'])
})

test('a word joined by tabs splits at its column (The Baring\'s "spritz<tabs>13")', () => {
  const { runs } = splitFused(
    [run(0, 'spritz        13', 72.2, 304)],
    [item('House spritz', 42, 54.3), item('13', 366.1, 10.1)],
    view,
    1,
  )
  assert.deepEqual(words(runs), ['spritz', '13'])
  assert.equal(runs[0]?.box.x, 72.2)
})

test('a kerning split, a dots-only word, another line and letters the items do not give keep the word whole', () => {
  const same = (r: Run, items: PdfItem[]): void => {
    const out = splitFused([r], items, view, 1)
    assert.deepEqual(words(out.runs), [r.str])
    assert.equal(out.pieces.size, 0)
  }
  same(run(0, 'Wine', 10, 20), [item('W', 10, 8), item('ine', 18.4, 12)])
  same(run(0, '..................', 10, 60), [item('..', 10, 5), item('................', 15, 55)])
  // A tall word's box holds the line above: its items on the nearer baseline only.
  same(run(0, 'Sundae', 10, 30), [item('Sundae', 10, 30), item('S', 30, 5, 101), item('P', 60, 5, 101)])
  same(run(0, 'Verte', 10, 166), [item('Salad Verte', 0, 40), item('16', 120, 9)])
})

test('a leader is dot marks only, three or more', () => {
  assert.ok(isLeader(' . . . . '))
  assert.ok(isLeader('……… '))
  assert.ok(!isLeader('..'))
  assert.ok(!isLeader('Clams . . .'))
  assert.ok(!isLeader('…7'))
})

test("a hidden or lost word's pieces are hidden or lost; duplicates are found again among the pieces", () => {
  const runs = [run(0, '1131', 247.1, 29.3), run(1, '11', 247.1, 5.2)]
  const split = splitFused(runs, [item('11', 247.1, 5.2), item('31', 269.1, 7.3)], view, 1)
  const e = { pdfPage: 1, width: 612, height: 792, runs, images: [], duplicates: [], hidden: ['1:0'], lost: ['1:0'] }
  const out = withSplit(e, split)
  assert.deepEqual(words(out.runs), ['11', '31', '11'])
  assert.deepEqual([out.hidden, out.lost, out.duplicates], [['1:0', '1:1'], ['1:0', '1:1'], ['1:2']])
  assert.equal(withSplit(e, { runs, pieces: new Map() }), e)
})
