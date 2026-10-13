import assert from 'node:assert/strict'
import { test } from 'node:test'
import { holds } from './conditions.ts'

test('a condition is a whole phrase of the qualifier and not negated', () => {
  assert.ok(holds('Lidl Plus', 'With Lidl Plus'))
  assert.ok(holds('1 kg', 'statt, 1 kg'))
  assert.ok(!holds('Lidl Plus', 'ohne Lidl Plus'))
  assert.ok(!holds('Lidl Plus', 'without Lidl Plus price'))
  assert.ok(holds('ohne Lidl Plus', 'ohne Lidl Plus'))
  assert.ok(!holds('was', 'wash'))
  assert.ok(!holds('2 for', '12 for'))
})
