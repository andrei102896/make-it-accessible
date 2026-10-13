import assert from 'node:assert/strict'
import { test } from 'node:test'
import { provenAmounts } from './key-proof.ts'
import type { Word } from './words.ts'

const word = (str: string, x: number, y: number, h: number): Word => ({
  str,
  x,
  y,
  w: str.length * h * 0.5,
  h,
  line: 'l',
})

test('stage-0 amounts: single money words and small top-aligned cents right of the euros', () => {
  const amounts = provenAmounts([
    word('95', 121, 52, 18),
    word('Brot', 10, 10, 12),
    word('2', 100, 50, 40),
    word('1,39', 10, 80, 10),
  ])
  assert.deepEqual(
    [...amounts].sort((a, b) => a - b),
    [139, 295],
  )
  assert.deepEqual([...provenAmounts([word('12', 100, 50, 20), word('34', 121, 50, 20)])], [])
})
