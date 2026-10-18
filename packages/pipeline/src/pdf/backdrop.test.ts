import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backdropSvg, luminanceGrid, printedOf } from './backdrop.ts'

const page = (defs: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="612pt" height="792pt" viewBox="0 0 612 792"><defs>${defs}</defs>${body}</svg>`
const glyphs = '<g id="glyph-0-1"><path d="M 0 0 L 5 0 L 5 -7 Z"/></g><g id="glyph-0-2"><path d="M 0 0 L 4 -7 Z"/></g>'
const ink = (x: number, y: number, id = '1'): string =>
  `<g fill="rgb(0%, 0%, 0%)"><use xlink:href="#glyph-0-${id}" x="${String(x)}" y="${String(y)}"/></g>`

test('the placed words lose their glyphs and the copy drawn under them; words we do not place, rules and pictures stay', () => {
  const placed = ink(100, 110) + ink(106, 110, '2')
  const unplaced = ink(300, 410)
  const shadow = '<path fill="rgb(50%, 50%, 50%)" d="M 101 101 L 112 101 L 108 111 L 101 111 Z"/>'
  const rule = '<path fill="none" stroke="rgb(0%, 0%, 0%)" stroke-width="1" d="M 95 113 L 140 113"/>'
  const defs = `${glyphs}<image id="source-7" width="10" height="10"/>`
  const svg = page(defs, placed + shadow + rule + unplaced + '<use xlink:href="#source-7"/>')
  const out = backdropSvg(svg, [{ x: 98, y: 100, w: 20, h: 12 }])
  assert.equal((out.match(/<use xlink:href="#glyph-/g) ?? []).length, 1)
  assert.match(out, /x="300" y="410"/)
  assert.doesNotMatch(out, /M 101 101/)
  assert.match(out, /M 95 113 L 140 113/)
  assert.match(out, /<use xlink:href="#source-7"\/>/)
  assert.match(out, /<g id="glyph-0-1">/)
})

test('a placed word drawn over a picture leaves the picture whole (Gigi’s band)', () => {
  const band = '<rect x="0" y="80" width="612" height="60" fill="rgb(80%, 20%, 20%)"/>'
  const out = backdropSvg(page(glyphs, band + ink(100, 110)), [{ x: 98, y: 100, w: 20, h: 12 }])
  assert.match(out, /<rect x="0" y="80"/)
  assert.doesNotMatch(out, /#glyph-0-1"/)
})

test("an outline round a line of placed words goes (Kenny & Ziggy's); an icon between them and a box behind them stay", () => {
  const words = [
    { x: 100, y: 100, w: 60, h: 12 },
    { x: 180, y: 100, w: 60, h: 12 },
  ]
  const outline =
    '<path fill="none" stroke-width="0.12" stroke="rgb(13%, 12%, 12%)" d="M 102 102 L 238 102 L 230 110 L 102 110 Z"/>'
  const chili = '<path fill="rgb(90%, 10%, 10%)" d="M 163 102 L 177 102 L 170 110 Z"/>'
  const strip = '<path fill="rgb(100%, 100%, 100%)" d="M 97 98 L 243 98 L 243 114 L 97 114 Z"/>'
  const out = backdropSvg(page(glyphs, strip + outline + chili), words)
  assert.doesNotMatch(out, /M 102 102/)
  assert.match(out, /M 163 102/)
  assert.match(out, /M 97 98/)
})

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

test("a stroke drawn round each placed letter is their printed outline: taken out and kept as the words' stroke (La Segunda)", () => {
  const word = { id: '1:0', box: { x: 98, y: 100, w: 20, h: 12 } }
  const letterI =
    '<path fill="none" stroke-width="3" stroke="rgb(93.4%, 26%, 18%)" d="M 100 101 L 104 101 L 104 111 L 100 111 Z"/>'
  const svg = page(glyphs, letterI + ink(100, 110))
  assert.doesNotMatch(backdropSvg(svg, [word.box]), /M 100 101/)
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

test("specks of an engraving inside a word's box are no copy of it: they stay printed and give it no shadow (Boater's THE MENU)", () => {
  const word = { id: '1:0', box: { x: 98, y: 100, w: 20, h: 30 } }
  const speck = '<path fill="rgb(95%, 39%, 48%)" d="M 104 110 C 105 110 105 111 104 112 Z"/>'
  const svg = page(glyphs, speck + ink(100, 125))
  assert.match(backdropSvg(svg, [word.box]), /M 104 110/)
  assert.deepEqual(printedOf(svg, [word]).shadows, {})
})
