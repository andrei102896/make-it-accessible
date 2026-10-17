import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Rgb } from '../html/color.ts'
import { cropPicture, fillToImage, growToPicture, inkBox } from './crop.ts'
import type { Pixels } from './pixels.ts'
import type { Box } from './types.ts'

const WHITE: Rgb = [255, 255, 255]
const RED: Rgb = [200, 20, 20]
const GREEN: Rgb = [40, 140, 60]
const within = (x: number, y: number, b: Box): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
// A white page with a green product and red price digits painted where given.
const page = (product: Box, digits: readonly Box[]): Pixels => ({
  width: 300,
  height: 300,
  at: (x, y) => (digits.some((d) => within(x, y, d)) ? RED : within(x, y, product) ? GREEN : WHITE),
})

test("a word's painted extent, not its font box", () => {
  const img = page({ x: 0, y: 0, w: 0, h: 0 }, [{ x: 50, y: 80, w: 30, h: 20 }])
  assert.deepEqual(inkBox(img, { x: 40, y: 40, w: 50, h: 70 }), { x: 50, y: 80, w: 30, h: 20 })
  assert.equal(inkBox(img, { x: 200, y: 200, w: 20, h: 20 }), null)
})

test("the product's own price reaching out of its picture is taken in whole, along its line", () => {
  const price = { x: 130, y: 100, w: 40, h: 40 }
  const cents = { x: 172, y: 100, w: 15, h: 20 }
  const own = [price, cents].map((box) => ({ box, own: true }))
  assert.deepEqual(cropPicture({ x: 10, y: 10, w: 160, h: 120 }, own), { x: 10, y: 10, w: 180, h: 133 })
})

test("a word taken in that reaches another of the product's words takes that one in too", () => {
  const price = { box: { x: 80, y: 60, w: 30, h: 50 }, own: true }
  const unit = { box: { x: 5, y: 105, w: 60, h: 10 }, own: true }
  assert.deepEqual(cropPicture({ x: 0, y: 0, w: 100, h: 100 }, [price, unit]), { x: 0, y: 0, w: 113, h: 118 })
})

test("another offer's words are cut away within the edge band, never through the product's own words", () => {
  const picture = { x: 0, y: 0, w: 100, h: 100 }
  const neighbour = { box: { x: 85, y: 40, w: 30, h: 10 }, own: false }
  assert.deepEqual(cropPicture(picture, [neighbour]), { x: 0, y: 0, w: 85, h: 100 })
  const deep = { box: { x: 40, y: 40, w: 30, h: 10 }, own: false }
  assert.deepEqual(cropPicture(picture, [deep]), picture)
  const name = { box: { x: 70, y: 0, w: 30, h: 10 }, own: true }
  assert.deepEqual(cropPicture(picture, [neighbour, name]), { x: 0, y: -3, w: 103, h: 103 })
})

test('a box stopping inside a badge grows up to take it whole, never into another offer', () => {
  const badge = { x: 20, y: 5, w: 40, h: 40 }
  const img = page(badge, [])
  assert.deepEqual(growToPicture({ x: 10, y: 20, w: 100, h: 100 }, [], img), { x: 10, y: 5, w: 100, h: 115 })
  const neighbour = { box: { x: 30, y: 10, w: 10, h: 5 }, own: false }
  assert.deepEqual(growToPicture({ x: 10, y: 20, w: 100, h: 100 }, [neighbour], img), { x: 10, y: 15, w: 100, h: 105 })
})

test("a figure fills the image the PDF placed it in: the logo's arc the model's box cut off comes back", () => {
  // A green logo painted at 40..200 x 30..180 inside an image placed at 30..210 x 20..190; the model boxed 60..180.
  const img = page({ x: 40, y: 30, w: 160, h: 150 }, [])
  const limit = { x: 30, y: 20, w: 180, h: 170 }
  const filled = fillToImage({ x: 60, y: 60, w: 120, h: 100 }, limit, [], img)
  assert.deepEqual(filled, { x: 40, y: 30, w: 160, h: 150 })
  // A foreign word painted inside the image is left out of the fill.
  const word = { x: 40, y: 30, w: 160, h: 10 }
  const kept = fillToImage({ x: 60, y: 60, w: 120, h: 100 }, limit, [{ box: word, own: false }], img)
  assert.deepEqual(kept, { x: 40, y: 40, w: 160, h: 140 })
})
