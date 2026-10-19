import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTsv, readsAsScan, type OcrWord } from './ocr.ts'
import type { Extraction, Run } from './types.ts'

const HEAD = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'
const row = (level: number, block: number, line: number, x: number, text: string): string =>
  [level, 1, block, 1, line, 1, x, 100, 50, 25, 90, text].join('\t')

test('words come in PDF points, numbered by printed line across blocks; blanks and other levels are skipped', () => {
  const tsv = [
    HEAD,
    row(4, 1, 1, 0, ''),
    row(5, 1, 1, 300, 'Soup'),
    row(5, 1, 1, 400, '$9'),
    row(5, 1, 2, 300, ' '),
    row(5, 2, 1, 0, 'Fish'),
  ].join('\n')
  const words = parseTsv(tsv, 72 / 300)
  assert.deepEqual(
    words.map((w) => [w.str, w.block, w.line, w.box.x]),
    [
      ['Soup', 1, 0, 72],
      ['$9', 1, 0, 96],
      ['Fish', 2, 1, 0],
    ],
  )
  assert.equal(words[0]?.box.h, 6)
})

test('a page reads as a scan when its text layer holds under a third of the printed words, a stray slug included', () => {
  const run = (str: string, x: number): Run => ({
    id: `1:${String(x)}`,
    str,
    box: { x, y: 10, w: 20, h: 10 },
    flow: 0,
    line: 0,
  })
  const word = (str: string, x: number): OcrWord => ({ str, box: { x, y: 10, w: 20, h: 10 }, block: 1, line: 0 })
  const page = (runs: Run[]): Extraction => ({
    pdfPage: 1,
    width: 600,
    height: 800,
    runs,
    images: [],
    duplicates: [],
    hidden: [],
  })
  const printed = ['Breakfast', 'Porridge', 'Pancakes', 'Eggs', 'Toast', 'Juice', 'Coffee', 'Tea'].map((s, i) =>
    word(s, 100 + 30 * i),
  )
  const slug = [run('SK_2562.indd', 0)]
  assert.equal(readsAsScan(page(slug), [word('SK_2562.indd', 0), ...printed]), true)
  const layered = printed.map((w) => run(w.str, w.box.x))
  assert.equal(readsAsScan(page(layered), [...printed, word('LOGO', 500)]), false)
  assert.equal(readsAsScan(page([]), []), false)
})
