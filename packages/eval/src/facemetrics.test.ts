import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lettersIn, scalesOf, weightsOf } from './facemetrics.ts'

test('the x-height and cap-height ratios are kept apart, each within the measured range; neither known is no scale', () => {
  assert.deepEqual(scalesOf({ xh: 0.4, ch: 0.7 }, { xh: 0.525, ch: 0.7 }), { lower: 0.762, caps: 1 })
  assert.deepEqual(scalesOf({ xh: null, ch: 0.7 }, { xh: 0.525, ch: 0.7 }), { lower: null, caps: 1 })
  assert.deepEqual(scalesOf({ xh: 0.667, ch: 0.85 }, { xh: 0.407, ch: 0.715 }), { lower: null, caps: 1.189 })
  assert.equal(scalesOf({ xh: 0.3, ch: null }, { xh: 0.5, ch: 0.75 }), null)
})

test('a variable file offers its range in steps, a static file its one weight', () => {
  assert.deepEqual(weightsOf({ weight: '100 300' }), [100, 150, 200, 250, 300])
  assert.deepEqual(weightsOf({ weight: '700' }), [700])
})

test('the sample letters are those the printed subset holds', () => {
  assert.deepEqual(lettersIn('U+41-43, U+61-63, U+78'), { lower: 'abcx', caps: 'ABC' })
})
