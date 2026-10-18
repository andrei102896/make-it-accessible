import assert from 'node:assert/strict'
import { test } from 'node:test'
import { printCss, printFloor, printFloorIn, printWidthIn } from './print.ts'

test('a large sheet prints from the window where its body text reads at 7 px, never below a tablet', () => {
  // La Segunda: 12 px body text needs 2030 px; 7 px is reached at 1998 × 7 / 12 + 32.
  assert.equal(printFloor(2030), 1198)
  assert.equal(printFloor(1688), 998)
  assert.equal(printFloor(1100), 800)
})

test('the rendered page carries both widths: fitting and checks read them back', () => {
  const css = printCss(2030, [])
  assert.equal(printWidthIn(css), 2030)
  assert.equal(printFloorIn(css), 1198)
  assert.equal(printWidthIn('<style></style>'), 0)
})
