import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseVectors } from './vectors.ts'

// Fragments of pdftocairo's own output for the menus they come from.
const page = (body: string, defs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="792pt" height="1224pt" viewBox="0 0 792 1224"><defs>${defs}</defs>${body}</svg>`

test("a notched frame under a scaled matrix (Carmine's) is one frame, as wide as its larger axis", () => {
  const frame =
    '<path fill="none" stroke-width="2" stroke="rgb(66.667175%, 11.764526%, 18.03894%)" stroke-opacity="1" d="M -0.00102235 0.00122922 L -64.090866 0.00122922 L -64.090866 -67.400314 L 169.932571 -67.400314 L 169.932571 0.00122922 L 153.2 0.00122922" transform="matrix(1, 0, 0, -1.51442, 95.629929, 1027.66983)"/>'
  const vectors = parseVectors(page(frame)).boxes
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
  const [v] = parseVectors(page('<use xlink:href="#compositing-group-2"/>', defs)).boxes
  if (!v) throw new Error('no ring')
  assert.equal(v.kind, 'frame')
  assert.equal(v.color, '#ee3325')
  assert.ok(Math.abs(v.width - 5) < 0.01 && Math.abs(v.box.x - 7.74) < 0.01)
})

test('a panel is a filled rectangle; a white knock-out, a faint tint and a glyph-sized fill are not', () => {
  const panel = (fill: string, opacity = '1', w = 200) =>
    `<path fill="${fill}" fill-opacity="${opacity}" d="M 100 100 L ${String(100 + w)} 100 L ${String(100 + w)} 160 L 100 160 Z M 100 100"/>`
  const grey = parseVectors(page(panel('rgb(91.372681%, 91.372681%, 91.372681%)'))).boxes
  assert.deepEqual(
    grey.map((v) => [v.kind, v.color]),
    [['panel', '#e9e9e9']],
  )
  assert.equal(parseVectors(page(panel('rgb(100%, 100%, 100%)'))).boxes.length, 0)
  assert.equal(parseVectors(page(panel('rgb(0%, 0%, 0%)', '0.149994'))).boxes.length, 0)
  assert.equal(parseVectors(page(panel('rgb(0%, 0%, 0%)', '1', 10))).boxes.length, 0)
})

test("two frames a few points apart are one double rule (Rucola's 2 pt and 0.67 pt frames); caps-only strokes go", () => {
  const rect = (x: number, w: string) =>
    `<path fill="none" stroke-width="${w}" stroke="rgb(13.7%, 12.1%, 12.5%)" d="M ${String(x)} ${String(x)} L ${String(560 - x)} ${String(x)} L ${String(560 - x)} ${String(760 - x)} L ${String(x)} ${String(760 - x)} Z"/>`
  const caps =
    '<path fill="none" stroke-width="0.7" stroke="rgb(13.7%, 12.1%, 12.5%)" d="M 304 559 L 304 559 M 304 456 L 304 456"/>'
  const { boxes: vectors, rules } = parseVectors(page(rect(42, '2') + rect(45, '0.668') + caps))
  assert.equal(vectors.length, 1)
  assert.equal(rules.length, 0)
  const [v] = vectors
  if (!v) throw new Error('no frame')
  assert.equal(v.double, true)
  assert.ok(Math.abs(v.width - 2.668) < 0.01)
})

test("rules: Rucola's dotted line, Osteria's double, Kendells' thickness under a scaled matrix, a thin bar", () => {
  const ink = 'rgb(13.7%, 12.1%, 12.5%)'
  const dotted = `<path fill="none" stroke-width="0.7" stroke-linecap="round" stroke-dasharray="0 2.09" stroke="${ink}" d="M 54 609 L 554 609"/>`
  const red = 'rgb(63.35%, 18.8%, 13.9%)'
  const double = [528, 531].map(
    (y) => `<path fill="none" stroke-width="0.52" stroke="${red}" d="M 28 ${String(y)} L 132 ${String(y)}"/>`,
  )
  const scaled = `<path fill="none" stroke-width="1" stroke="${ink}" d="M 10 0 L 80 0" transform="matrix(4.81, 0, 0, 0.9, 0, 105)"/>`
  const bar = `<path fill="${red}" d="M 205 52 L 206.5 52 L 206.5 120 L 205 120 Z"/>`
  const curve = `<path fill="none" stroke="${ink}" d="M 10 300 C 50 300 90 300 130 300"/>`
  // Rucola's divider leans 1.5 pt over 135; a diagonal is no rule.
  const lean = `<path fill="none" stroke-width="0.7" stroke="${ink}" d="M 303.5 280 L 305 415"/>`
  const diagonal = `<path fill="none" stroke="${ink}" d="M 400 280 L 430 415"/>`
  const rules = parseVectors(page(dotted + double.join('') + scaled + bar + curve + lean + diagonal)).rules
  assert.deepEqual(
    rules.map((r) => [r.dash, r.double, r.color, Math.round(r.width * 100) / 100, r.box.w > 0]),
    [
      ['dotted', false, '#231f20', 0.7, true],
      ['solid', true, '#a23023', 3.52, true],
      ['solid', false, '#231f20', 0.9, true],
      ['solid', false, '#a23023', 1.5, false],
      ['solid', false, '#231f20', 0.7, false],
    ],
  )
  assert.ok(Math.abs((rules[1]?.box.y ?? 0) - 529.5) < 0.01 && Math.abs((rules[2]?.box.w ?? 0) - 336.7) < 0.01)
})

test("a stroked rectangle keeps its fill unless it is paper, dashed or the page's own (Howies' cream cards)", () => {
  const card = (fill: string, extra = '', w = 200) =>
    `<path fill="${fill}" fill-opacity="1" stroke-width="1" stroke="rgb(91.764706%, 80.784314%, 69.019608%)" stroke-opacity="1"${extra} d="M 100 100 L ${String(100 + w)} 100 L ${String(100 + w)} 160 L 100 160 Z"/>`
  const fills = (svg: string) => parseVectors(page(svg)).boxes.map((v) => [v.kind, v.color, v.fill])
  const cream = 'rgb(96.862745%, 92.54902%, 87.45098%)'
  assert.deepEqual(fills(card(cream)), [['frame', '#eaceb0', '#f7ecdf']])
  assert.deepEqual(fills(card('rgb(100%, 100%, 100%)')), [['frame', '#eaceb0', undefined]])
  assert.deepEqual(fills(card(cream, ' stroke-dasharray="2 2"')), [])
  const whole = `<path fill="${cream}" fill-opacity="1" stroke-width="1" stroke="rgb(0%, 0%, 0%)" stroke-opacity="1" d="M 1 1 L 791 1 L 791 1223 L 1 1223 Z"/>`
  assert.deepEqual(fills(whole), [['frame', '#000000', undefined]])
})

test('a double rule keeps the fill of the frame that has one', () => {
  const stroked = (x: number, fill: string) =>
    `<path fill="${fill}" fill-opacity="1" stroke-width="1" stroke="rgb(0%, 0%, 0%)" stroke-opacity="1" d="M ${String(x)} ${String(x)} L ${String(400 - x)} ${String(x)} L ${String(400 - x)} ${String(300 - x)} L ${String(x)} ${String(300 - x)} Z"/>`
  const [v] = parseVectors(page(stroked(100, 'none') + stroked(104, 'rgb(96.862745%, 92.54902%, 87.45098%)'))).boxes
  assert.deepEqual([v?.double, v?.fill], [true, '#f7ecdf'])
})
