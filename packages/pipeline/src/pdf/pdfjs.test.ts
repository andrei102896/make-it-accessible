import assert from 'node:assert/strict'
import { test } from 'node:test'
import { itemOf, slanted, type PdfItem } from './pdfjs.ts'
import type { Run } from './types.ts'

const view = [0, 0, 612, 792] as const
const item = (str: string, x: number, width: number, fontName = 'f6'): PdfItem => ({
  str,
  transform: [11, 0, 0, 11, x, 792 - 110],
  width,
  fontName,
})
const run = (str: string, x: number, w: number, restored?: true): Run => ({
  id: '1:0',
  str,
  box: { x, y: 100, w, h: 12 },
  flow: 0,
  line: 0,
  ...(restored && { restored }),
})

test('a word sewn with its dropped ligature takes the item sharing most of its letters (Gigi "Order", "tta")', () => {
  const order = [item('Ord', 10, 20), item('er', 30, 12, 'f7'), item('Online!', 46, 40)]
  assert.equal(itemOf(run('Order', 10, 32, true), order, view)?.str, 'Ord')
  const pancetta = [item('with Pance', 0, 50), item('3', 50, 7), item('a (can omit)', 57, 60)]
  assert.equal(itemOf(run('tta', 50, 13, true), pancetta, view)?.str, 'a (can omit)')
  assert.equal(itemOf(run('tta', 50, 13), pancetta, view), undefined)
  assert.equal(itemOf(run('Pance', 25, 25), pancetta, view)?.str, 'with Pance')
})

test("a word its text matrix shears forward is slanted, set whole or letter by letter (Carmine's, Gargiulo's), only so", () => {
  // Baseline 110 pt from the top: the runs' box spans 100–112.
  const at = (str: string, x: number, width: number, [a, b, c, d]: [number, number, number, number]): PdfItem => ({
    str,
    transform: [a, b, c, d, x, 792 - 110],
    width,
    fontName: 'f1',
  })
  const shear: [number, number, number, number] = [10, 0, 1.763, 10]
  const ids = (runs: Run[], items: PdfItem[]): string[] => [...slanted(runs, items, view)]
  const r = (id: string, x: number, w: number): Run => ({ ...run('Served', x, w), id })
  assert.deepEqual(ids([r('a', 10, 40)], [at('Served With', 10, 60, shear)]), ['a'])
  // Letter by letter, overlapping: still most of the word.
  const letters = [
    at('Af', 10, 12, [10, 0, 3.3, 10]),
    at('t', 20, 6, [10, 0, 3.3, 10]),
    at('er', 25, 12, [10, 0, 3.3, 10]),
  ]
  assert.deepEqual(ids([r('b', 10, 27)], letters), ['b'])
  assert.deepEqual(ids([r('c', 10, 40)], [at('Served', 10, 60, [10, 0, 0, 10])]), [])
  // A back slant, a mirrored item and a rotated one are no italic.
  assert.deepEqual(ids([r('d', 10, 40)], [at('Served', 10, 60, [10, 0, -1.763, 10])]), [])
  assert.deepEqual(ids([r('e', 10, 40)], [at('Served', 10, 60, [10, 0, -1.763, -10])]), [])
  assert.deepEqual(ids([r('f', 10, 40)], [at('Served', 10, 60, [8.66, 5, 1, 8.66])]), [])
  // Level items covering more of the word win; a sheared line above a tall word's foot does not slant it.
  assert.deepEqual(ids([r('g', 10, 40)], [at('Se', 10, 8, shear), at('rved', 18, 32, [10, 0, 0, 10])]), [])
  const tall: Run = { ...run('Name', 10, 40), id: 'h', box: { x: 10, y: 95, w: 40, h: 17 } }
  const higher: PdfItem['transform'] = [10, 0, 1.763, 10, 10, 792 - 98]
  const above = { ...at('note', 10, 40, shear), transform: higher }
  assert.deepEqual(ids([tall], [above, at('Name', 10, 40, [10, 0, 0, 10])]), [])
})
