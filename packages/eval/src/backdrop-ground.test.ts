import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groundHex } from './backdrop.ts'

test("a page's ground is kept from two thirds of the ring, never plain paper", () => {
  assert.equal(groundHex({ c: [33, 44, 70], share: 0.98 }), '#212c46')
  assert.equal(groundHex({ c: [33, 44, 70], share: 0.6 }), null)
  assert.equal(groundHex({ c: [252, 252, 252], share: 0.9 }), null)
  assert.equal(groundHex({ c: [248, 248, 232], share: 0.9 }), '#f8f8e8')
  assert.equal(groundHex(null), null)
})
