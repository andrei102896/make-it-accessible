import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Rgb } from '../html/color.ts'
import type { Pixels } from './pixels.ts'
import type { Box, Run } from './types.ts'
import { hiddenRuns } from './visibility.ts'

const NAVY: Rgb = [40, 40, 72]
const WHITE: Rgb = [255, 255, 255]
const run = (n: number, box: Box): Run => ({ id: `1:${String(n)}`, str: `w${String(n)}`, box, flow: 0, line: 0 })

// A navy page with white strokes (every third column) inside the given boxes.
function page(inked: readonly Box[]): Pixels {
  return {
    width: 400,
    height: 200,
    at: (x, y) =>
      inked.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h && x % 3 === 0) ? WHITE : NAVY,
  }
}

test('a word that draws nothing is hidden; a word with ink is not', () => {
  const visible = run(0, { x: 10, y: 10, w: 60, h: 20 })
  const covered = run(1, { x: 10, y: 60, w: 60, h: 20 })
  assert.deepEqual(
    hiddenRuns(
      [visible, covered, run(2, { x: 200, y: 10, w: 60, h: 20 })],
      page([visible.box, { x: 200, y: 10, w: 60, h: 20 }]),
      1,
    ),
    ['1:1'],
  )
})

test('a word too covered by neighbours to judge is hidden only when it continues a hidden word', () => {
  const hidden = run(0, { x: 10, y: 100, w: 40, h: 30 })
  const glued = run(1, { x: 52, y: 100, w: 40, h: 30 })
  const apart = run(2, { x: 250, y: 100, w: 40, h: 30 })
  // Visible words cover most of `glued` and `apart`, so neither can be judged on its own pixels.
  const coverGlued = run(3, { x: 50, y: 98, w: 44, h: 25 })
  const coverApart = run(4, { x: 248, y: 98, w: 44, h: 25 })
  const runs = [hidden, glued, apart, coverGlued, coverApart, run(5, { x: 300, y: 10, w: 40, h: 20 })]
  const ink = [coverGlued.box, coverApart.box, { x: 300, y: 10, w: 40, h: 20 }]
  assert.deepEqual(hiddenRuns(runs, page(ink), 1), ['1:0', '1:1'])
})

test("a display glyph's box reaching over a small word does not cover it: the word is judged on its own ink", () => {
  // A lowercase word inks only the lower half of its box; a 60 px script heading's box overlaps that half.
  const word = run(0, { x: 10, y: 10, w: 30, h: 20 })
  const heading = run(1, { x: 0, y: 20, w: 120, h: 60 })
  const runs = [word, heading, run(2, { x: 200, y: 10, w: 40, h: 20 }), run(3, { x: 300, y: 10, w: 40, h: 20 })]
  const ink = [
    { x: 10, y: 20, w: 30, h: 10 },
    { x: 0, y: 40, w: 120, h: 30 },
    { x: 200, y: 10, w: 40, h: 20 },
    { x: 300, y: 10, w: 40, h: 20 },
  ]
  assert.deepEqual(hiddenRuns(runs, page(ink), 1), [])
})

test('a page where most words show no ink is a render failure: nothing is hidden', () => {
  const runs = [run(0, { x: 10, y: 10, w: 40, h: 20 }), run(1, { x: 10, y: 50, w: 40, h: 20 })]
  assert.deepEqual(hiddenRuns(runs, page([]), 1), [])
})

test("a word drawn over another one does not inherit its neighbour's verdict", () => {
  // `over` is drawn on `under` (both too covered to judge); `tail` shows no ink and continues `under` side by side.
  const under = run(0, { x: 10, y: 150, w: 80, h: 20 })
  const over = run(1, { x: 10, y: 150, w: 84, h: 20 })
  const tail = run(2, { x: 92, y: 150, w: 12, h: 20 })
  const runs = [under, over, tail, run(3, { x: 300, y: 10, w: 40, h: 20 }), run(4, { x: 200, y: 10, w: 40, h: 20 })]
  const ink = [over.box, { x: 300, y: 10, w: 40, h: 20 }, { x: 200, y: 10, w: 40, h: 20 }]
  assert.deepEqual(hiddenRuns(runs, page(ink), 1), ['1:0', '1:2'])
})
