import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Rgb } from './color.ts'
import type { Pixels } from '../pdf/pixels.ts'
import { divided, lineBetween, ruleBelow, signatureRules } from './rules.ts'

// A white page 600 x 400 px at 1 px per point with the given black horizontal segments [y, x0, x1].
function page(segments: [number, number, number][]): Pixels {
  return {
    width: 600,
    height: 400,
    at: (x, y): Rgb => (segments.some(([sy, x0, x1]) => y === sy && x >= x0 && x <= x1) ? [0, 0, 0] : [255, 255, 255]),
  }
}
const WHITE: Rgb = [255, 255, 255]

test('the rule under a heading is the one through its middle, not a neighbouring column at the same height', () => {
  const heading = { x: 100, y: 50, w: 100, h: 20 }
  const img = page([
    [76, 20, 280],
    [76, 320, 580],
  ])
  const rule = ruleBelow(img, 1, heading, 600, WHITE)
  assert.ok(rule)
  assert.ok(Math.abs(rule.width - 260 / 600) < 0.01)
  assert.ok(Math.abs(rule.center - 150 / 600) < 0.01)
  assert.equal(ruleBelow(page([[76, 320, 580]]), 1, heading, 600, WHITE), null)
})

test('text below a heading is no rule: a line is thin and at least half the heading wide', () => {
  const heading = { x: 100, y: 50, w: 100, h: 20 }
  assert.equal(ruleBelow(page([[76, 140, 160]]), 1, heading, 600, WHITE), null)
  const thick = page([76, 77, 78, 79, 80].map((y): [number, number, number] => [y, 50, 250]))
  assert.equal(ruleBelow(thick, 1, heading, 600, WHITE), null)
})

test('a hairline between two stacked dishes is found; an empty gap is not one', () => {
  const upper = { x: 50, y: 100, w: 200, h: 30 }
  const lower = { x: 50, y: 150, w: 200, h: 30 }
  assert.equal(lineBetween(page([[140, 50, 250]]), 1, upper, lower, WHITE), true)
  assert.equal(lineBetween(page([]), 1, upper, lower, WHITE), false)
})

test('a signature carries the rule most of its headings carry: full when it spans the column, centred over it', () => {
  const rule = { width: 0.41, center: 0.28, color: '#222222' }
  const found = [
    { sig: 0, rule, center: 0.28, width: 0.12 },
    { sig: 0, rule: { ...rule, color: '#ab021a' }, center: 0.28, width: 0.12 },
    { sig: 0, rule, center: 0.28, width: 0.12 },
    { sig: 1, rule: { width: 0.14, center: 0.5, color: '#000000' }, center: 0.5, width: 0.13 },
    { sig: 2, rule: null, center: 0.5, width: 0.2 },
    { sig: 2, rule: null, center: 0.5, width: 0.2 },
    { sig: 2, rule, center: 0.5, width: 0.2 },
  ]
  const [column, short, none] = signatureRules(found, 3)
  assert.deepEqual(column, { width: 0.41, full: true, centered: true, color: '#222222' })
  assert.deepEqual(short, { width: 0.14, full: false, centered: true, color: '#000000' })
  assert.equal(none, null)
  assert.equal(divided(10, 0), false)
  assert.equal(divided(10, 5), true)
  assert.equal(divided(0, 0), null)
})
