import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrast, fromHex, type Rgb } from './color.ts'
import { themeFromPixels, type Pixels } from './theme.ts'

const NAVY: Rgb = [40, 40, 72]
const CREAM: Rgb = [248, 244, 230]
const RED: Rgb = [200, 20, 30]
// A 100×40 page: a word box at (10,10,40,10) whose left half is ink; a photo fills x ≥ 60.
const page = (bg: Rgb, ink: Rgb): Pixels => ({
  width: 100,
  height: 40,
  at: (x, y) => (x >= 60 ? RED : x >= 10 && x < 30 && y >= 10 && y <= 20 ? ink : bg),
})
const word = [{ x: 10, y: 10, w: 40, h: 10 }]

test('the band takes the page colour around the words and the ink inside them, never the photo', () => {
  assert.deepEqual(themeFromPixels(page(NAVY, CREAM), word), {
    band: { bg: '#282848', fg: '#f8f8e8' },
    accent: { light: '#282848', dark: '#787a9f' },
  })
})

test('a plain white page has no band, and its accent must be readable on white', () => {
  assert.equal(themeFromPixels(page([255, 255, 255], [20, 20, 20]), word)?.band, null)
  const accent = themeFromPixels(page([255, 255, 255], [20, 20, 20]), word)?.accent
  if (!accent) throw new Error('no accent')
  assert.ok(contrast(fromHex(accent.light), [255, 255, 255]) >= 4.5)
  assert.ok(contrast(fromHex(accent.dark), [18, 18, 18]) >= 4.5)
})

test('no theme when the text does not stand out from its background', () => {
  assert.equal(themeFromPixels(page([200, 200, 200], [170, 170, 170]), word), null)
})
