import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTsv } from './ocr.ts'

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
