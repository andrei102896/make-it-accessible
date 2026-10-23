import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Grid } from '../pdf/backdrop.ts'
import { placement } from './placed.ts'
import type { Spot } from './spots.ts'
import type { FontManifest } from './webfonts.ts'

const grid = (metrics: Grid['metrics']): Grid => ({
  version: 9,
  cell: 8,
  cols: 1,
  rows: 1,
  min: [1],
  max: [1],
  mean: ['#ffffff'],
  inks: {},
  alpha: {},
  shadows: {},
  strokes: {},
  undrawn: [],
  baselines: {},
  ends: {},
  kept: [],
  tracking: {},
  faces: {},
  fonts: {},
  metrics,
  capsFaces: [],
})
const montserrat: FontManifest = {
  family: 'Montserrat',
  key: 'montserrat',
  license: 'OFL',
  copyright: '©',
  category: 'text',
  files: [{ file: 'montserrat-normal-100-900.woff2', style: 'normal', weight: '100 900', unicodeRange: 'U+0000-00FF' }],
}
const spot = (over: Partial<Spot> = {}): Spot => ({
  box: { x: 10, y: 10, w: 100, h: 12 },
  size: 10,
  lines: 1,
  align: 'left',
  color: null,
  alpha: 1,
  shadow: null,
  stroke: null,
  weight: 300,
  italic: false,
  font: { key: 'brandongrotesque', size: 10, weight: 300, italic: false },
  tracking: 0.1,
  lowercase: 0.5,
  own: null,
  baseline: null,
  inline: [],
  ...over,
})
const metrics = { 'brandongrotesque:300:false': { lower: 0.762, caps: 1, weight: 350 } }

test("a lookalike line takes the measured scale and weight: the size scaled, tracking kept in printed points (Howies' Brandon → Montserrat)", () => {
  const style = placement(spot(), 200, grid(metrics), 1, [montserrat])
  assert.match(style, /--fs:4\.365;/)
  assert.match(style, /--fw:350;/)
  assert.match(style, /--ls:0\.115"$/)
  assert.match(placement(spot({ lowercase: 1 }), 200, grid(metrics), 1, [montserrat]), /--fs:3\.81;/)
  assert.match(placement(spot({ lowercase: 0 }), 200, grid(metrics), 1, [montserrat]), /--fs:5;/)
  assert.match(style, /--ff:'print-montserrat', sans-serif/)
})

test('without metrics, or in the PDF’s own face, the printed size and weight stand', () => {
  assert.match(placement(spot(), 200, grid({}), 1, [montserrat]), /--fs:5;.*--fw:300;.*--ls:0\.1"$/)
  const own = placement(spot({ own: 'pdf-0123456789ab' }), 200, grid(metrics), 1, [montserrat])
  assert.match(own, /--fs:5;.*--fw:300;/)
  assert.match(own, /--ff:'pdf-0123456789ab', 'print-montserrat'/)
})

test('a matched weight under 300 is raised to 300 on small text, kept on large', () => {
  const thin = { 'brandongrotesque:300:false': { lower: 1, caps: 1, weight: 200 } }
  assert.match(placement(spot(), 200, grid(thin), 1, [montserrat]), /--fw:300;/)
  assert.match(placement(spot({ size: 30 }), 200, grid(thin), 1, [montserrat]), /--fw:200;/)
})
