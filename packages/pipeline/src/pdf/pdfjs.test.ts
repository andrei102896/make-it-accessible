import assert from 'node:assert/strict'
import { test } from 'node:test'
import { itemOf, type PdfItem } from './pdfjs.ts'
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
