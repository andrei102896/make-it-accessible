import assert from 'node:assert/strict'
import { test } from 'node:test'
import { luminanceGrid, printedOf, tiltedOf } from './backdrop.ts'

const page = (defs: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="612pt" height="792pt" viewBox="0 0 612 792"><defs>${defs}</defs>${body}</svg>`
const glyphs = '<g id="glyph-0-1"><path d="M 0 0 L 5 0 L 5 -7 Z"/></g><g id="glyph-0-2"><path d="M 0 0 L 4 -7 Z"/></g>'
const ink = (x: number, y: number, id = '1'): string =>
  `<g fill="rgb(0%, 0%, 0%)"><use xlink:href="#glyph-0-${id}" x="${String(x)}" y="${String(y)}"/></g>`

test("each cell keeps its darkest and lightest luminance and its mean colour (a black word's cell on white)", () => {
  const black = new Set(['3,2', '4,2'])
  const grid = luminanceGrid({
    width: 16,
    height: 8,
    at: (x, y) => (black.has(`${String(x)},${String(y)}`) ? [0, 0, 0] : [255, 255, 255]),
  })
  assert.deepEqual(grid, { cols: 2, rows: 1, min: [0, 1], max: [1, 1], mean: ['#f7f7f7', '#ffffff'] })
})

test("a word's ink is its last glyph drawn, the black copy under it its shadow (Kenny & Ziggy's); a word with no glyph is undrawn", () => {
  const at = (fill: string, x: number, y: number): string =>
    `<g fill="${fill}" fill-opacity="1"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const shadow = at('rgb(13.7%, 12.2%, 12.5%)', 100, 112) + at('rgb(13.7%, 12.2%, 12.5%)', 106, 112)
  const fill = at('rgb(100%, 94.9%, 0%)', 100, 110) + at('rgb(100%, 94.9%, 0%)', 106, 110)
  const words = [
    { id: '1:0', box: { x: 98, y: 100, w: 20, h: 12 } },
    { id: '1:1', box: { x: 300, y: 400, w: 20, h: 12 } },
  ]
  const printed = printedOf(page(glyphs, shadow + fill), words)
  assert.deepEqual(printed.inks, { '1:0': '#fff200' })
  assert.deepEqual(printed.shadows, { '1:0': { color: '#231f20', dx: 0, dy: 2 } })
  assert.deepEqual(printed.undrawn, ['1:1'])
})

test("another font's glyphs under a word at one offset are no shadow (Howies' fish under 154 words)", () => {
  const at = (fill: string, glyph: string, x: number, y: number): string =>
    `<g fill="${fill}" fill-opacity="1"><use xlink:href="#${glyph}" x="${String(x)}" y="${String(y)}"/></g>`
  const fish = at('rgb(11%, 29%, 40%)', 'glyph-19-3', 92, 115) + at('rgb(11%, 29%, 40%)', 'glyph-19-3', 98, 115)
  const word = at('rgb(0%, 0%, 0%)', 'glyph-0-1', 100, 110) + at('rgb(0%, 0%, 0%)', 'glyph-0-1', 106, 110)
  const printed = printedOf(page(glyphs, fish + word), [{ id: '1:0', box: { x: 98, y: 100, w: 20, h: 12 } }])
  assert.deepEqual(printed.inks, { '1:0': '#000000' })
  assert.deepEqual(printed.shadows, {})
})

test("a drawing spanning lines of text under the words is no shadow of theirs (the fish under Howies' group menu)", () => {
  const at = (x: number, y: number): string =>
    `<g fill="rgb(0%, 0%, 0%)" fill-opacity="1"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const lines = [100, 120, 140].flatMap((y) => [at(100, y), at(106, y)]).join('')
  // Inside the words' zones and mostly under their boxes, as a fill copying them would be; only its height tells.
  const fish = '<path fill="rgb(11%, 29%, 40%)" fill-opacity="1" d="M 99 89 L 117 90 L 116 143 L 100 142 L 98 118 Z"/>'
  const words = [100, 120, 140].map((y, i) => ({ id: `1:${String(i)}`, box: { x: 98, y: y - 10, w: 20, h: 12 } }))
  const printed = printedOf(page(glyphs, fish + lines), words)
  assert.deepEqual(printed.shadows, {})
  assert.deepEqual(printed.undrawn, [])
  // A sliver of the drawing inside one line's boxes copies nothing either.
  const scale = '<path fill="rgb(11%, 29%, 40%)" fill-opacity="1" d="M 101 94 L 115 93 L 116 96 L 100 97 Z"/>'
  assert.deepEqual(printedOf(page(glyphs, scale + lines), words).shadows, {})
})

test("a stroke drawn round each placed letter is their printed outline, kept as the words' stroke (La Segunda)", () => {
  const word = { id: '1:0', box: { x: 98, y: 100, w: 20, h: 12 } }
  const letterI =
    '<path fill="none" stroke-width="3" stroke="rgb(93.4%, 26%, 18%)" d="M 100 101 L 104 101 L 104 111 L 100 111 Z"/>'
  const svg = page(glyphs, letterI + ink(100, 110))
  assert.deepEqual(printedOf(svg, [word]).strokes, { '1:0': { color: '#ee422e', width: 3 } })
})

test("a shadow is measured glyph by glyph: the next tight line in the zone does not drag it a line down (Kenny & Ziggy's)", () => {
  const black = (x: number, y: number): string =>
    `<g fill="rgb(13.7%, 12.2%, 12.5%)"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const white = (x: number, y: number): string =>
    `<g fill="rgb(100%, 100%, 100%)"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const line = (y: number): string => [100, 106, 112].map((x) => black(x + 1, y + 1) + white(x, y)).join('')
  const word = { id: '1:0', box: { x: 98, y: 100, w: 20, h: 12 } }
  const printed = printedOf(page(glyphs, line(110) + line(122)), [word])
  assert.deepEqual(printed.shadows, { '1:0': { color: '#231f20', dx: 1, dy: 1 } })
})

test("a neighbour's glyph reaching into a word's zone is no shadow of it (Lexington's grey price after Mozzarella)", () => {
  const ink = (fill: string, x: number): string =>
    `<g fill="${fill}"><use xlink:href="#glyph-0-1" x="${String(x)}" y="110"/></g>`
  const word = [100, 104, 108, 112, 116].map((x) => ink('rgb(13.7%, 12.2%, 12.5%)', x)).join('')
  const price = ink('rgb(39.6%, 40.4%, 41.2%)', 122)
  const printed = printedOf(page(glyphs, word + price), [{ id: '1:0', box: { x: 98, y: 100, w: 22, h: 12 } }])
  assert.deepEqual(printed.shadows, {})
})

test("a neighbour word's glyphs are never a word's ink or copy, even inside its zone (Ferrara's black asterisks beside the red SYRUPS)", () => {
  const glyph = (fill: string, x: number): string =>
    `<g fill="${fill}"><use xlink:href="#glyph-0-1" x="${String(x)}" y="110"/></g>`
  const red = 'rgb(60%, 0%, 0%)'
  const black = 'rgb(0%, 0%, 0%)'
  const svg = page(
    glyphs,
    glyph(black, 92) + [100, 104, 108, 112].map((x) => glyph(red, x)).join('') + glyph(black, 116),
  )
  const printed = printedOf(svg, [
    { id: '1:0', box: { x: 92, y: 100, w: 8, h: 12 } },
    { id: '1:1', box: { x: 100, y: 100, w: 16, h: 12 } },
    { id: '1:2', box: { x: 116, y: 100, w: 8, h: 12 } },
  ])
  assert.deepEqual(printed.inks, { '1:0': '#000000', '1:1': '#990000', '1:2': '#000000' })
  assert.deepEqual(printed.shadows, {})
})

test("specks of an engraving inside a word's box are no copy of it and give it no shadow (Boater's THE MENU)", () => {
  const word = { id: '1:0', box: { x: 98, y: 100, w: 20, h: 30 } }
  const speck = '<path fill="rgb(95%, 39%, 48%)" d="M 104 110 C 105 110 105 111 104 112 Z"/>'
  const svg = page(glyphs, speck + ink(100, 125))
  assert.deepEqual(printedOf(svg, [word]).shadows, {})
})

test("a word whose glyphs rise along one line is set at an angle (Fig's rubber stamp); a raised letter is no tilt", () => {
  const at = (x: number, y: number): string => `<use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/>`
  const stamp = at(22.3, 750.7) + at(29.4, 750.2) + at(36.5, 749.8) + at(43.6, 749.4)
  const first = at(60, 750) + at(66, 747) + at(70, 747)
  const level = at(80, 750) + at(86, 750)
  const tilted = tiltedOf(page(glyphs, `<g fill="rgb(0%, 0%, 0%)">${stamp + first + level}</g>`), [
    { id: 'OCT', box: { x: 22.34, y: 740.56, w: 28, h: 14.15 } },
    { id: '1st', box: { x: 60, y: 740, w: 14, h: 14 } },
    { id: 'Date', box: { x: 80, y: 740, w: 12, h: 14 } },
  ])
  assert.deepEqual([...tilted], ['OCT'])
})

test("each word's ink is its own glyphs', on tight lines too: the line above's glyphs at its box's top are not its own (Kenny & Ziggy's)", () => {
  const at = (fill: string, x: number, y: number): string =>
    `<g fill="${fill}"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const upper = at('rgb(100%, 0%, 0%)', 100, 110) + at('rgb(100%, 0%, 0%)', 106, 110)
  const lower = at('rgb(0%, 0%, 100%)', 104, 125) + at('rgb(0%, 0%, 100%)', 110, 125)
  const printed = printedOf(page(glyphs, upper + lower), [
    { id: 'YOUR', box: { x: 98, y: 96, w: 16, h: 18 } },
    { id: '11.95', box: { x: 102, y: 110, w: 14, h: 18 } },
  ])
  assert.deepEqual(printed.inks, { YOUR: '#ff0000', '11.95': '#0000ff' })
})

test("a glyph in two words' boxes belongs to the word of its line starting last before it, never to a tall script box over that line (Kenny & Ziggy's CAKES, Moosewood's entrees)", () => {
  const at = (fill: string, x: number, y: number): string =>
    `<g fill="${fill}"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const letters = printedOf(page(glyphs, at('rgb(100%, 0%, 0%)', 100, 160) + at('rgb(100%, 0%, 0%)', 136, 160)), [
    { id: 'C', box: { x: 100, y: 100, w: 40, h: 80 } },
    { id: 'A', box: { x: 136, y: 100, w: 44, h: 80 } },
  ])
  assert.deepEqual(letters.inks, { C: '#ff0000', A: '#ff0000' })
  const script = at('rgb(0%, 0%, 0%)', 36, 287) + at('rgb(0%, 0%, 0%)', 44, 287)
  const dish = at('rgb(0%, 0%, 100%)', 36, 308) + at('rgb(0%, 0%, 100%)', 44, 308)
  const menu = printedOf(page(glyphs, script + dish), [
    { id: 'entrees', box: { x: 36, y: 244, w: 93, h: 76 } },
    { id: 'MOOSEWOOD', box: { x: 36, y: 294, w: 76, h: 19 } },
  ])
  assert.deepEqual(menu.inks, { entrees: '#000000', MOOSEWOOD: '#0000ff' })
})

test("a word's ink is its first letter's: the ink over a copy drawn under it, where the box starts on the copy (Kenny & Ziggy's NEVER), not the dish line in a script's tall box (Moosewood's soups)", () => {
  const at = (fill: string, x: number, y: number): string =>
    `<g fill="${fill}"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const copy = at('rgb(0%, 0%, 0%)', 100, 111) + at('rgb(0%, 0%, 0%)', 106, 111)
  const ink = at('rgb(100%, 0%, 0%)', 100.02, 110) + at('rgb(100%, 0%, 0%)', 106.02, 110)
  const shadowed = printedOf(page(glyphs, copy + ink), [{ id: 'FAMOUS', box: { x: 100, y: 96, w: 20, h: 18 } }])
  assert.deepEqual(shadowed.inks, { FAMOUS: '#ff0000' })
  const script = at('rgb(0%, 0%, 0%)', 200, 287) + at('rgb(0%, 0%, 0%)', 208, 287)
  const dish = [180, 188, 196, 200, 212, 220, 228].map((x) => at('rgb(0%, 0%, 100%)', x, 308)).join('')
  const stray = at('rgb(0%, 0%, 100%)', 199.6, 316)
  const menu = printedOf(page(glyphs, script + dish + stray), [
    { id: 'soups', box: { x: 200, y: 244, w: 60, h: 76 } },
    { id: 'CAULIFLOWER', box: { x: 178, y: 294, w: 30, h: 19 } },
  ])
  assert.deepEqual(menu.inks, { soups: '#000000', CAULIFLOWER: '#0000ff' })
})

test("a word's ink is its first letter's: a glyph drawn after its letters in another ink does not set it (Kenny & Ziggy's gold &)", () => {
  const at = (fill: string, x: number, y: number): string =>
    `<g fill="${fill}"><use xlink:href="#glyph-0-1" x="${String(x)}" y="${String(y)}"/></g>`
  const gold = at('rgb(97.6%, 65.5%, 17.6%)', 100, 110) + at('rgb(97.6%, 65.5%, 17.6%)', 106, 110)
  const space = at('rgb(100%, 100%, 100%)', 112, 110)
  const printed = printedOf(page(glyphs, gold + space), [{ id: '&', box: { x: 100, y: 96, w: 18, h: 18 } }])
  assert.deepEqual(printed.inks, { '&': '#f9a72d' })
})

test('a word whose layer box runs past its letters (a tab read into it) ends one step past its last letter', () => {
  const box = { x: 100, y: 100, w: 200, h: 12 }
  const space = '<g id="glyph-0-3">\n</g>'
  const svg = page(glyphs + space, ink(100, 110) + ink(106, 110) + ink(112, 110) + ink(118, 110) + ink(290, 110, '3'))
  assert.deepEqual(printedOf(svg, [{ id: '1:0', box, str: '2022  ' }]).ends, { '1:0': 124 })
  assert.deepEqual(printedOf(svg, [{ id: '1:0', box, str: '2022' }]).ends, {})
})
