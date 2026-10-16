import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { test } from 'node:test'
import type { Rgb } from './color.ts'
import type { Pixels } from '../pdf/pixels.ts'
import { groupOrnaments, MAX_ORNAMENTS, ornamentBelow, ornamentMask, type Found } from './ornament.ts'

// A 600 x 400 px page at 1 px per point: `ink(x, y)` says where the drawing is.
const page = (
  ink: (x: number, y: number) => boolean,
  paper: Rgb = [255, 255, 255],
  color: Rgb = [34, 34, 34],
): Pixels => ({
  width: 600,
  height: 400,
  at: (x, y) => (ink(x, y) ? color : paper),
})
const WHITE: Rgb = [255, 255, 255]
const heading = { x: 250, y: 50, w: 100, h: 20 }
// A line from x 180 to 420 at y 80, arrow heads at both ends and a curl in the middle (the Kendells title).
const flourish = (x: number, y: number): boolean =>
  (y === 80 && x >= 180 && x <= 420) ||
  (Math.abs(y - 80) <= 3 && (x - 180 === Math.abs(y - 80) || 420 - x === Math.abs(y - 80))) ||
  (Math.abs(y - 80) <= 4 && x >= 290 && x <= 310 && (x + y) % 3 === 0)

test('a flourish under a heading is one ornament, centred under it', () => {
  const o = ornamentBelow(page(flourish), 1, heading, 600, [], WHITE)
  assert.ok(o)
  assert.ok(Math.abs(o.box.x - 178) <= 1 && Math.abs(o.box.w - 245) <= 2)
  assert.ok(o.box.h >= 9 && o.box.h <= 15)
  assert.equal(o.centered, true)
  assert.equal(o.color, '#222222')
})

test('a gap of a hairline still joins the curl to its line', () => {
  const split = (x: number, y: number): boolean => flourish(x, y) && !(y === 80 && (x === 289 || x === 311))
  assert.ok(ornamentBelow(page(split), 1, heading, 600, [], WHITE))
})

test('a plain rule, text right under the heading, a frame round words and a picture are no ornament', () => {
  assert.equal(
    ornamentBelow(
      page((x, y) => y === 80 && x >= 200 && x <= 400),
      1,
      heading,
      600,
      [],
      WHITE,
    ),
    null,
  )
  const text = { x: 260, y: 78, w: 60, h: 10 }
  assert.equal(
    ornamentBelow(
      page((x, y) => y >= 79 && y <= 86 && x >= 262 && x <= 318),
      1,
      heading,
      600,
      [text],
      WHITE,
    ),
    null,
  )
  const frame = (x: number, y: number): boolean =>
    x >= 100 && x <= 500 && y >= 76 && y <= 84 && (y === 76 || y === 84 || x === 100 || x === 500)
  assert.equal(ornamentBelow(page(frame), 1, heading, 600, [{ x: 150, y: 77, w: 300, h: 6 }], WHITE), null)
  assert.equal(
    ornamentBelow(
      page((x, y) => y >= 75 && y <= 300 && x >= 150 && x <= 450),
      1,
      heading,
      600,
      [],
      WHITE,
    ),
    null,
  )
})

test('a solid band is a panel, and a large sparse shape is rejected at the pixel limit, not cut to a part', () => {
  assert.equal(
    ornamentBelow(
      page((x, y) => y >= 75 && y <= 88),
      1,
      { ...heading, h: 30 },
      600,
      [],
      WHITE,
    ),
    null,
  )
  const sparse = (x: number, y: number): boolean => y >= 205 && y < 355 && x % 2 === 0 && y % 2 === 0
  assert.equal(ornamentBelow(page(sparse), 1, { ...heading, h: 150 }, 600, [], WHITE), null)
})

test('an ornament on a dark page is read against that page', () => {
  const navy: Rgb = [40, 40, 72]
  const o = ornamentBelow(page(flourish, navy, [248, 248, 248]), 1, heading, 600, [], navy)
  assert.equal(o?.color, '#f8f8f8')
})

test('the same drawing under several headings is one ornament; at most MAX_ORNAMENTS', () => {
  const at = (key: string, w: number): Found => ({
    key,
    page: 0,
    box: { x: 0, y: 0, w, h: 9 },
    color: '#222222',
    centered: true,
  })
  const groups = groupOrnaments([
    at('0:a', 219),
    at('0:b', 100),
    at('0:c', 220),
    ...[300, 400, 500, 600].map((w) => at(`1:${String(w)}`, w)),
  ])
  assert.equal(groups.length, MAX_ORNAMENTS)
  assert.deepEqual(groups[0]?.headings, ['0:a', '0:c'])
})

test('the mask is a grey-and-alpha PNG whose alpha is the ink, the paper transparent', () => {
  const png = Buffer.from(
    ornamentMask(
      page((x) => x === 1),
      WHITE,
      '#222222',
    ),
  )
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47])
  assert.equal(png.readUInt32BE(16), 600)
  assert.equal(png[25], 4)
  const idat = png.indexOf('IDAT')
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)))
  assert.deepEqual([raw[0], raw[2], raw[4]], [0, 0, 255])
})
