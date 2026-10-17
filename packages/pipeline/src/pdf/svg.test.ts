import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawnElements } from './svg.ts'

// Fragments shaped like pdftocairo's output: placed content defined in <defs>, drawn by <use> under a clip.
const page = (defs: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="612pt" height="792pt" viewBox="0 0 612 792"><defs>${defs}</defs>${body}</svg>`
const red = 'fill="rgb(61.8%, 24.9%, 22.2%)"'

test("placed content counts where it is used, not where it is defined (Claudio's art at the foot)", () => {
  const defs = `<g id="source-5"><path ${red} d="M 0 0 L 100 0 L 100 40 L 0 40 Z"/></g>`
  const { drawn } = drawnElements(page(defs, '<use xlink:href="#source-5" transform="matrix(1, 0, 0, 1, 10, 700)"/>'))
  assert.equal(drawn.length, 1)
  assert.deepEqual(drawn[0]?.subpaths[0]?.points[0], [10, 700])
})

test('a page-sized fill clipped to a thin bar is that bar (Osteria): its geometry is the visible part', () => {
  const defs = `<clipPath id="clip-1"><path d="M 22 491 L 120 491 L 120 491.5 L 22 491.5 Z"/></clipPath>`
  const body = `<g clip-path="url(#clip-1)"><rect x="-156" y="-714" width="881" height="1451" ${red}/></g>`
  const [bar] = drawnElements(page(defs, body)).drawn
  const xs = bar?.subpaths[0]?.points.map((p) => p[0]) ?? []
  const ys = bar?.subpaths[0]?.points.map((p) => p[1]) ?? []
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [22, 120, 491, 491.5])
})

test('pictures are placed by their <use> with its clip; masks, glyphs and uses of compositing groups never draw', () => {
  const defs = [
    '<image id="source-7" x="0" y="0" width="200" height="100" xlink:href="data:image/png;base64,AAAA"/>',
    '<clipPath id="clip-2"><rect x="0" y="0" width="50" height="100"/></clipPath>',
    '<mask id="mask-0"><rect x="0" y="0" width="612" height="792" fill="rgb(100%, 100%, 100%)"/></mask>',
    `<g id="glyph-0-1"><path d="M 0 0 L 5 0 L 5 5 Z"/></g>`,
    `<g id="compositing-group-1"><path ${red} d="M 300 300 L 400 300 L 400 350 L 300 350 Z"/></g>`,
  ].join('')
  const body = [
    '<g clip-path="url(#clip-2)" transform="matrix(1, 0, 0, 1, 100, 200)"><use xlink:href="#source-7"/></g>',
    '<g mask="url(#mask-0)"><use xlink:href="#glyph-0-1" x="10" y="10"/></g>',
    '<use xlink:href="#compositing-group-1"/>',
  ].join('')
  const { drawn, placed } = drawnElements(page(defs, body))
  assert.deepEqual(placed, [{ box: { x: 100, y: 200, w: 200, h: 100 }, clip: { x: 100, y: 200, w: 50, h: 100 } }])
  // The compositing group draws once, in place (its use is the filter that shows it).
  assert.equal(drawn.length, 1)
})

test('a fill under a clip that is not a rectangle has an unknown visible shape (Osteria: its award badges)', () => {
  const defs = `<clipPath id="clip-9"><path d="M 360 860 C 380 850 400 850 420 860 L 420 930 L 360 930 Z"/></clipPath>`
  const body = `<g clip-path="url(#clip-9)"><rect x="0" y="0" width="612" height="1008" ${red}/></g>`
  const [fill] = drawnElements(page(defs, body)).drawn
  assert.equal(fill?.masked, true)
})

test('a shape other than a plain rectangle cut by a clip shows an unknown part (Bannatyne: frame lines, no panel)', () => {
  const defs = `<clipPath id="clip-3"><rect x="20" y="550" width="550" height="230"/></clipPath>`
  const lines = 'M 0 548 L 600 548 L 600 552 L 0 552 Z M 0 778 L 600 778 L 600 782 L 0 782 Z'
  const body = `<g clip-path="url(#clip-3)"><path ${red} d="${lines}"/></g>`
  const [frame] = drawnElements(page(defs, body)).drawn
  assert.equal(frame?.masked, true)
})

test('a glyph under a mask holding one plain rect draws at its opacity (Gigi’s title, white at 84 %)', () => {
  const defs =
    '<g id="glyph-0-1"><path d="M 0 0 L 5 0 L 5 -7 Z"/></g><mask id="mask-1"><g filter="url(#f)"><rect x="0" y="0" width="600" height="800" fill="rgb(0%, 0%, 0%)" fill-opacity="0.8379"/></g></mask><g id="source-14"><g fill="rgb(100%, 100%, 100%)"><use xlink:href="#glyph-0-1" x="10" y="60"/></g></g>'
  const body = '<g mask="url(#mask-1)"><use xlink:href="#source-14" transform="matrix(1, 0, 0, 1, 41, 36)"/></g>'
  const [glyph] = drawnElements(page(defs, body)).glyphs
  assert.ok(glyph)
  assert.equal(glyph.alpha, 0.8379)
  assert.deepEqual(glyph.at, [51, 96])
})
