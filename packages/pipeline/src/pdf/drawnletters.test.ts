import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lettersDrawnBeside } from './drawnletters.ts'
import type { Drawn, Glyph } from './svg.ts'
import type { Run } from './types.ts'

const RED = 'rgb(92.939758%, 10.978699%, 14.118958%)'
const rect = (x0: number, y0: number, x1: number, y1: number, fill = RED): Drawn => ({
  tag: `<path fill="${fill}" fill-opacity="1"/>`,
  subpaths: [
    {
      points: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      curved: false,
    },
  ],
  m: [1, 0, 0, 1, 0, 0],
  clip: null,
  masked: false,
  filtered: false,
  bound: null,
  range: [0, 0],
})
const word = (id: string, str: string, x: number, w: number): Run => ({
  id,
  str,
  box: { x, y: 806.55, w, h: 14.81 },
  flow: 0,
  line: 0,
  color: '#ed1b24',
})
const baseline = (x: number, w: number): Glyph[] =>
  [0.2, 0.5, 0.8].map((k) => ({ at: [x + w * k, 818.09], range: [0, 0], alpha: 1, id: 'glyph-0-1' }))

// Kenny & Ziggy's p05: "Hungarian" printed as three spaces, then "ungarian", the H drawn as two stems and a bar.
const H = [rect(84.93, 809.52, 87.93, 818.15), rect(90.36, 809.52, 93.36, 818.15), rect(86.93, 811.39, 92.4, 812.25)]
const ungarian = word('5:180', 'ungarian', 94.3, 52.81)

test('a letter drawn in the word\'s ink, on its baseline, against its edge marks the word (K&Z "ungarian")', () => {
  assert.deepEqual(lettersDrawnBeside(H, baseline(94.3, 52.81), [ungarian]), ['5:180'])
})

test("a shape off the baseline, in another ink, or a word space away marks nothing (K&Z's nav stars)", () => {
  const glyphs = baseline(94.3, 52.81)
  // An ornament centred on the x-height.
  assert.deepEqual(lettersDrawnBeside([rect(88, 806, 92, 814)], glyphs, [ungarian]), [])
  assert.deepEqual(lettersDrawnBeside([rect(90.36, 809.52, 93.36, 818.15, 'rgb(0%, 0%, 0%)')], glyphs, [ungarian]), [])
  // A star 0.2 of the line's height before the word.
  assert.deepEqual(lettersDrawnBeside([rect(84, 809.52, 91.3, 818.15)], glyphs, [ungarian]), [])
})
