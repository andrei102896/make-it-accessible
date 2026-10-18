import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ActualText } from './actualtext.ts'
import { restoreLigatures } from './ligatures.ts'
import { joinRuns } from './runs.ts'
import type { Run } from './types.ts'

const view = [0, 0, 612, 792] as const
const run = (id: string, str: string, x: number, w: number): Run => ({
  id,
  str,
  box: { x, y: 100, w, h: 12 },
  flow: 0,
  line: 0,
})
// Poppler's copy of a replacement text: at the page's edge, no height, at the text's Tm alone.
const copy = (id: string, str: string, x: number): Run => ({
  id,
  str,
  box: { x, y: 792, w: 0, h: 0 },
  flow: 1,
  line: 9,
})
// A pdf.js item at baseline 110 (top-down), size 11.
const item = (str: string, x: number, width: number): Parameters<typeof restoreLigatures>[1][number] => ({
  str,
  transform: [11, 0, 0, 11, x, 792 - 110],
  width,
  fontName: 'f1',
})
const at = (text: string, x: number, copyX = x - 10): ActualText => ({ text, x, y: 792 - 110, size: 11, copyX })

test("a dropped ligature's letters join its word from the PDF's replacement text: mid-word, word end, word start (Gigi)", () => {
  const runs = [
    run('1:0', 'Pance', 10, 40),
    run('1:1', 'a', 57.2, 6),
    run('1:2', 'Bisco', 100, 30),
    run('1:3', '3.5oz', 200, 30),
    run('1:4', 'lets)', 239, 25),
    copy('1:9', 'tt', 40),
    copy('1:10', 'tti', 120),
    copy('1:11', 'fi', 223),
  ]
  const items = [item('3', 50, 7.2), item('p', 130, 9.8), item('fi', 233, 6)]
  const texts = [at('tt', 50), at('tti', 130), at('fi', 233)]
  const restored = restoreLigatures(runs, items, texts, view)
  const words = restored.runs.slice(0, 5)
  assert.equal(joinRuns(words), 'Pancetta Biscotti 3.5oz filets)')
  assert.deepEqual(restored.hidden, ['1:9', '1:10', '1:11'])
  assert.deepEqual(restored.lost, [])
  assert.deepEqual(
    words.map((w) => w.restored ?? false),
    [false, true, true, false, true],
  )
  assert.deepEqual(restoreLigatures(restored.runs, items, texts, view).runs, restored.runs)
})

test('the letters grow their word to the glyph, never to the next word ("Puff pastry"); a glyph no text names is lost', () => {
  const runs = [run('1:0', 'Pu', 10, 12), run('1:1', 'pastry,', 30, 35), copy('1:5', 'ff', 12)]
  const puff = restoreLigatures(runs, [item('ff', 22, 6)], [at('ff', 22)], view)
  assert.equal(joinRuns(puff.runs.slice(0, 2)), 'Puff pastry,')
  const unnamed = restoreLigatures(runs, [item('3', 22, 6)], [], view)
  assert.deepEqual(unnamed.lost, ['1:0'])
  assert.equal(joinRuns(unnamed.runs.slice(0, 2)), 'Pu pastry,')
})

test("a replacement text whose copy is not this page's (another Tm) is not used; a page with no copies is left alone", () => {
  const runs = [run('1:0', 'Sword', 10, 30), run('1:1', 'sh', 46, 10)]
  const restored = restoreLigatures([...runs, copy('1:7', 'fi', 99)], [item('fi', 40, 6)], [at('fi', 40)], view)
  assert.deepEqual(restored.lost, ['1:1'])
  assert.equal(joinRuns(restored.runs.slice(0, 2)), 'Sword sh')
  assert.deepEqual(restoreLigatures(runs, [item('fi', 40, 6)], [at('fi', 40)], view), { runs, hidden: [], lost: [] })
})
