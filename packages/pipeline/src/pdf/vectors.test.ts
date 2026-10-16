import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseVectors } from './vectors.ts'

// Fragments of pdftocairo's own output for the menus they come from.
const page = (body: string, defs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="792pt" height="1224pt" viewBox="0 0 792 1224"><defs>${defs}</defs>${body}</svg>`

test("a notched frame under a scaled matrix (Carmine's) is one frame, as wide as its larger axis", () => {
  const frame =
    '<path fill="none" stroke-width="2" stroke="rgb(66.667175%, 11.764526%, 18.03894%)" stroke-opacity="1" d="M -0.00102235 0.00122922 L -64.090866 0.00122922 L -64.090866 -67.400314 L 169.932571 -67.400314 L 169.932571 0.00122922 L 153.2 0.00122922" transform="matrix(1, 0, 0, -1.51442, 95.629929, 1027.66983)"/>'
  const vectors = parseVectors(page(frame))
  assert.equal(vectors.length, 1)
  const [v] = vectors
  if (!v) throw new Error('no frame')
  assert.equal(v.kind, 'frame')
  assert.equal(v.color, '#aa1e2e')
  assert.ok(Math.abs(v.width - 3.03) < 0.01)
  assert.ok(Math.abs(v.box.x - 31.54) < 0.01 && Math.abs(v.box.h - 102.07) < 0.1)
})

test("a filled ring is a frame (Sarge's border), drawn in a compositing group kept in the definitions", () => {
  const ring =
    '<path fill-rule="nonzero" fill="rgb(93.415833%, 20.036316%, 14.476013%)" fill-opacity="1" d="M 784.54 8.17 L 7.74 8.17 L 7.74 1216.4 L 784.54 1216.4 Z M 779.54 1211.4 L 12.74 1211.4 L 12.74 13.17 L 779.54 13.17 Z M 779.54 1211.4 "/>'
  const defs = `<g id="glyph-0-0"><path d="M 1 1 L 30 1 L 30 20 L 1 20 Z"/></g><g id="compositing-group-2" transform="translate(79.2, 122.4)">${ring}</g>`
  const [v] = parseVectors(page('<use xlink:href="#compositing-group-2"/>', defs))
  if (!v) throw new Error('no ring')
  assert.equal(v.kind, 'frame')
  assert.equal(v.color, '#ee3325')
  assert.ok(Math.abs(v.width - 5) < 0.01 && Math.abs(v.box.x - 7.74) < 0.01)
})

test('a panel is a filled rectangle; a white knock-out, a faint tint and a glyph-sized fill are not', () => {
  const panel = (fill: string, opacity = '1', w = 200) =>
    `<path fill="${fill}" fill-opacity="${opacity}" d="M 100 100 L ${String(100 + w)} 100 L ${String(100 + w)} 160 L 100 160 Z M 100 100"/>`
  const grey = parseVectors(page(panel('rgb(91.372681%, 91.372681%, 91.372681%)')))
  assert.deepEqual(
    grey.map((v) => [v.kind, v.color]),
    [['panel', '#e9e9e9']],
  )
  assert.equal(parseVectors(page(panel('rgb(100%, 100%, 100%)'))).length, 0)
  assert.equal(parseVectors(page(panel('rgb(0%, 0%, 0%)', '0.149994'))).length, 0)
  assert.equal(parseVectors(page(panel('rgb(0%, 0%, 0%)', '1', 10))).length, 0)
})

test("two frames a few points apart are one double rule (Rucola's 2 pt and 0.67 pt frames); caps-only strokes go", () => {
  const rect = (x: number, w: string) =>
    `<path fill="none" stroke-width="${w}" stroke="rgb(13.7%, 12.1%, 12.5%)" d="M ${String(x)} ${String(x)} L ${String(560 - x)} ${String(x)} L ${String(560 - x)} ${String(760 - x)} L ${String(x)} ${String(760 - x)} Z"/>`
  const caps =
    '<path fill="none" stroke-width="0.7" stroke="rgb(13.7%, 12.1%, 12.5%)" d="M 304 559 L 304 559 M 304 456 L 304 456"/>'
  const vectors = parseVectors(page(rect(42, '2') + rect(45, '0.668') + caps))
  assert.equal(vectors.length, 1)
  const [v] = vectors
  if (!v) throw new Error('no frame')
  assert.equal(v.double, true)
  assert.ok(Math.abs(v.width - 2.668) < 0.01)
})
