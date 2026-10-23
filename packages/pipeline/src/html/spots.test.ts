import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { NOTHING_DRAWN, spotOf, spotsOf } from './spots.ts'

test("a leaf of icon words alone keeps one line and no ink of its own; a line's ink and size ignore icon words", () => {
  const font = { key: 'montserrat', size: 12, weight: 300, italic: false }
  const word = (id: string, str: string, x: number, icon?: true): Run => ({
    id,
    str,
    box: { x, y: 100, w: 20, h: 16 },
    flow: 0,
    line: 3,
    color: icon ? undefined : '#073b5a',
    font: icon ? undefined : font,
    ...(icon && { icon }),
  })
  const alone = spotOf({ x: 10, y: 100, w: 11, h: 11 }, [word('1:9', 'vegan', 10, true)], NOTHING_DRAWN, new Set())
  assert.equal(alone.lines, 1)
  assert.equal(alone.color, null)
  const line = spotOf(
    { x: 10, y: 100, w: 120, h: 16 },
    [
      word('1:9', 'gluten', 10, true),
      word('1:10', 'free', 10, true),
      word('1:1', 'Award', 40),
      word('1:2', 'winning', 70),
    ],
    NOTHING_DRAWN,
    new Set(),
  )
  assert.deepEqual([line.lines, line.color, line.size], [1, '#073b5a', 12])
})

test('a leaf ends where its letters end, not where a tab read into its last word did (Howies\' "2022\\t")', () => {
  const run = (id: string, str: string, x: number, w: number): Run => ({
    id,
    str,
    box: { x, y: 100, w, h: 9 },
    flow: 0,
    line: 0,
  })
  const e: Extraction = {
    pdfPage: 1,
    width: 600,
    height: 800,
    runs: [run('1:0', 'France,', 28, 31), run('1:1', '2022  ', 62, 230)],
    images: [],
    duplicates: [],
    hidden: [],
  }
  const blocks = parsePage(
    JSON.stringify({ lang: 'en', blocks: [{ kind: 'paragraph', text: { src: [[0, 1]] } }] }),
  ).blocks
  const spot = spotsOf(blocks, e, { ...NOTHING_DRAWN, ends: { '1:1': 84 } }).get('blocks[0]')
  assert.equal(spot?.box.w, 84 - 28)
})
