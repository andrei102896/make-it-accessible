import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearOfText } from './geometry.ts'

test('a picture box is cut back from a headline above it and a price at its edge', () => {
  const picture = { x: 0, y: 0, w: 100, h: 100 }
  const headline = { x: 10, y: 0, w: 80, h: 10 }
  const price = { x: 85, y: 60, w: 30, h: 30 }
  assert.deepEqual(clearOfText(picture, [headline, price, { x: 200, y: 200, w: 10, h: 10 }]), {
    x: 0,
    y: 10,
    w: 85,
    h: 90,
  })
})

test('words well inside the picture are its own; no cut that keeps enough of it: null', () => {
  const picture = { x: 0, y: 0, w: 100, h: 100 }
  assert.deepEqual(clearOfText(picture, [{ x: 30, y: 40, w: 40, h: 10 }]), picture)
  assert.equal(clearOfText(picture, [{ x: 0, y: 30, w: 70, h: 40 }]), null)
  assert.deepEqual(clearOfText({ x: 0, y: 0, w: 10, h: 10 }, []), { x: 0, y: 0, w: 10, h: 10 })
})
