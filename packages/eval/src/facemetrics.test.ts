import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawsCapitals, lettersIn } from './facemetrics.ts'

test('the sample letters are those the printed subset holds', () => {
  assert.deepEqual(lettersIn('U+41-43, U+61-63, U+78'), { lower: 'abcx', caps: 'ABC' })
})

test("a face draws capitals for lowercase when its flat letters stand as tall as its capitals (Howies' Lulo); nothing measured is none", () => {
  assert.equal(drawsCapitals({ xh: 0.7, ch: 0.71 }), true)
  assert.equal(drawsCapitals({ xh: 0.52, ch: 0.71 }), false)
  assert.equal(drawsCapitals({ xh: 0, ch: 0 }), false)
  assert.equal(drawsCapitals({ xh: null, ch: 0.7 }), false)
})
