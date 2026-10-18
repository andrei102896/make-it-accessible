import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Run } from '../pdf/types.ts'
import { NOTHING_DRAWN, spotOf } from './spots.ts'

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
  assert.deepEqual([line.lines, line.color, line.size, line.font?.key], [1, '#073b5a', 12, 'montserrat'])
})
