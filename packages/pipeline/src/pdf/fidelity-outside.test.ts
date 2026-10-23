import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scoreOutside } from './fidelity-outside.ts'
import type { Image } from './fidelity-types.ts'

// A 16 x 16 white page with a 4 x 4 square of grey `v` at (4, 4): a letter's stroke at the size of a cell's corner.
const page = (v: number): Image => {
  const data = new Uint8ClampedArray(16 * 16 * 4).fill(255)
  for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) data.set([v, v, v, 255], (y * 16 + x) * 4)
  return { width: 16, height: 16, data }
}

test('a stroke drawn lighter in our sheet than in the PDF weighs less ink, in its band too; the same stroke as much', () => {
  const pdf = page(40)
  const same = scoreOutside({ p: pdf, s: page(40), kept: [], cellPx: 8 })
  assert.equal(same.ink.ours, same.ink.pdf)
  const faded = scoreOutside({ p: pdf, s: page(140), kept: [], cellPx: 8 })
  assert.ok(faded.ink.ours < faded.ink.pdf * 0.85)
  assert.ok((faded.bands[0]?.ours ?? 0) < (faded.bands[0]?.pdf ?? 0) * 0.85)
  // A fractional cell size (a sheet's scale) reads whole pixels all the same.
  assert.equal(scoreOutside({ p: pdf, s: page(40), kept: [], cellPx: 7.3 }).ink.pdf, same.ink.pdf)
})

test("light letters on a dark ground weigh as dark ones on a light ground (Carew's white on navy)", () => {
  const navy = (v: number): Image => {
    const data = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < data.length; i += 4) data.set([20, 30, 60, 255], i)
    for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) data.set([v, v, v, 255], (y * 16 + x) * 4)
    return { width: 16, height: 16, data }
  }
  const same = scoreOutside({ p: navy(250), s: navy(250), kept: [], cellPx: 8 })
  assert.ok(same.ink.pdf > 0)
  assert.equal(same.ink.ours, same.ink.pdf)
  const faded = scoreOutside({ p: navy(250), s: navy(120), kept: [], cellPx: 8 })
  assert.ok(faded.ink.ours < faded.ink.pdf * 0.85)
})
