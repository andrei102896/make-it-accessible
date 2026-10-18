import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mostPrinted } from './printedfaces.ts'
import type { PdfItem } from './pdfjs.ts'
import type { Run } from './types.ts'

const font = { key: 'oswald', size: 10, weight: 400, italic: false }
const run = (id: string, str: string, x: number): Run => ({
  id,
  str,
  box: { x, y: 100, w: str.length * 5, h: 10 },
  flow: 0,
  line: 0,
  font,
})
// An item printing a run: level, on its baseline, spanning its box.
const item = (str: string, x: number, fontName: string): PdfItem => ({
  str,
  transform: [1, 0, 0, 1, x, 800 - 110],
  width: str.length * 5,
  fontName,
})

test('a face key is measured on the program printing most of its letters; a run no listed program prints counts for nothing', () => {
  const runs = [run('1:0', 'Light', 0), run('1:1', 'Regular', 50), run('1:2', 'Reg', 100), run('1:3', 'Ghost', 150)]
  const items = [
    item('Light', 0, 'g_f1'),
    item('Regular', 50, 'g_f2'),
    item('Reg', 100, 'g_f2'),
    item('Ghost', 150, 'g_f9'),
  ]
  const out = mostPrinted(runs, items, [0, 0, 600, 800], new Set(['g_f1', 'g_f2']))
  assert.deepEqual([...out], [['oswald:400:false', { font, name: 'g_f2' }]])
  assert.equal(
    mostPrinted(
      runs.map((r) => ({ ...r, font: undefined })),
      items,
      [0, 0, 600, 800],
      new Set(['g_f1']),
    ).size,
    0,
  )
})
