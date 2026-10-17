import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backdropSvg, inksOf, luminanceGrid } from './backdrop.ts'

const page = (defs: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="612pt" height="792pt" viewBox="0 0 612 792"><defs>${defs}</defs>${body}</svg>`
const glyphs = '<g id="glyph-0-1"><path d="M 0 0 L 5 0 L 5 -7 Z"/></g><g id="glyph-0-2"><path d="M 0 0 L 4 -7 Z"/></g>'
const ink = (x: number, y: number, id = '1'): string =>
  `<g fill="rgb(0%, 0%, 0%)"><use xlink:href="#glyph-0-${id}" x="${String(x)}" y="${String(y)}"/></g>`

test('the placed words lose their glyphs; their filled shadow, words we do not place, rules and pictures stay', () => {
  const placed = ink(100, 110) + ink(106, 110, '2')
  const unplaced = ink(300, 410)
  const shadow = '<path fill="rgb(50%, 50%, 50%)" d="M 101 101 L 112 101 L 108 111 L 101 111 Z"/>'
  const rule = '<path fill="none" stroke="rgb(0%, 0%, 0%)" stroke-width="1" d="M 95 113 L 140 113"/>'
  const defs = `${glyphs}<image id="source-7" width="10" height="10"/>`
  const svg = page(defs, placed + shadow + rule + unplaced + '<use xlink:href="#source-7"/>')
  const out = backdropSvg(svg, [{ x: 98, y: 100, w: 20, h: 12 }])
  assert.equal((out.match(/<use xlink:href="#glyph-/g) ?? []).length, 1)
  assert.match(out, /x="300" y="410"/)
  assert.match(out, /M 101 101/)
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

test("each cell keeps its darkest and lightest luminance (a black word's cell on white reads 0 to 1)", () => {
  const black = new Set(['3,2', '4,2'])
  const grid = luminanceGrid({
    width: 16,
    height: 8,
    at: (x, y) => (black.has(`${String(x)},${String(y)}`) ? [0, 0, 0] : [255, 255, 255]),
  })
  assert.deepEqual(grid, { cols: 2, rows: 1, min: [0, 1], max: [1, 1] })
})

test("a word's ink is its last glyph drawn: Kenny & Ziggy's yellow over a black shadow, not the text layer's black", () => {
  const shadow =
    '<g fill="rgb(13.7%, 12.2%, 12.5%)" fill-opacity="1"><use xlink:href="#glyph-0-1" x="100" y="112"/></g>'
  const fill = '<g fill="rgb(100%, 94.9%, 0%)" fill-opacity="1"><use xlink:href="#glyph-0-1" x="100" y="110"/></g>'
  const words = [
    { id: '1:0', box: { x: 98, y: 100, w: 20, h: 12 } },
    { id: '1:1', box: { x: 300, y: 400, w: 20, h: 12 } },
  ]
  assert.deepEqual(inksOf(page(glyphs, shadow + fill), words), { '1:0': '#fff200' })
})
