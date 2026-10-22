import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pictureIn, piecesOf, picturesOf } from './art.ts'
import type { Run } from './types.ts'
import { parseVectors } from './vectors.ts'

// A 600 x 800 pt page of pdftocairo-shaped SVG.
const page = (body: string, defs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600pt" height="800pt" viewBox="0 0 600 800"><defs>${defs}</defs>${body}</svg>`
// A filled drawing (a notch on the right keeps it from reading as a panel).
const rect = (x: number, y: number, w: number, h: number, fill = 'rgb(20%, 30%, 60%)') =>
  `<path fill="${fill}" d="M ${String(x)} ${String(y)} L ${String(x + w)} ${String(y)} L ${String(x + w / 2)} ${String(y + h / 2)} L ${String(x + w)} ${String(y + h)} L ${String(x)} ${String(y + h)} Z"/>`
const pictures = (svg: string, words: Run[] = []) => {
  const { art, placed, width, height } = parseVectors(svg)
  return picturesOf(art, placed, words, width, height)
}
const word = (x: number, y: number, w: number, h: number): Run => ({
  id: '1:0',
  str: 'x',
  box: { x, y, w, h },
  flow: 0,
  line: 0,
})

test("a wordmark's letters are one picture (Nick & Toni's), ornaments apart stay apart", () => {
  const letters = [100, 126, 152, 178].map((x) => rect(x, 50, 20, 25)).join('')
  const ornaments = rect(100, 300, 30, 20) + rect(300, 300, 30, 20)
  const found = pictures(page(letters + ornaments))
  assert.equal(found.length, 3)
  assert.deepEqual(found[0]?.box, { x: 100, y: 50, w: 98, h: 25 })
})

test("a large fill stands alone with its colour (Kenny & Ziggy's curtain); paper and stacked twins are no pictures", () => {
  const curtain = '<rect x="0" y="0" width="600" height="800" fill="rgb(80%, 10%, 10%)"/>'
  const twin = '<rect x="0" y="0" width="600" height="790" fill="rgb(70%, 10%, 10%)"/>'
  const paper = '<rect x="0" y="0" width="600" height="800" fill="rgb(100%, 100%, 100%)"/>'
  const found = pictures(page(paper + curtain + twin + rect(280, 380, 40, 40)))
  assert.deepEqual(
    found.map((p) => [p.kind, p.color]),
    [
      ['vector', null],
      ['fill', '#b31a1a'],
    ],
  )
})

test('the page’s own words drawn as paths are text, not a picture; photos edge to edge stay apart (Carew)', () => {
  const outlined = rect(50, 600, 60, 12)
  const covered = pictures(page(outlined), [word(50, 600, 60, 12)])
  assert.equal(covered.length, 0)
  const defs = '<image id="source-1" x="0" y="0" width="100" height="40" xlink:href="data:image/png;base64,AAAA"/>'
  const strips = [0, 40, 80].map(
    (y) => `<use xlink:href="#source-1" transform="matrix(1, 0, 0, 1, 50, ${String(y + 100)})"/>`,
  )
  const raster = pictures(page(strips.join(''), defs))
  assert.deepEqual(
    raster.map((p) => [p.kind, p.box]),
    [0, 40, 80].map((y) => ['raster', { x: 50, y: y + 100, w: 100, h: 40 }]),
  )
})

test('a page-sized rect painted transparent is no picture (La Segunda\'s fill-opacity="0" canvas)', () => {
  const canvas = '<rect x="0" y="0" width="600" height="800" fill="rgb(0%, 0%, 0%)" fill-opacity="0"/>'
  assert.equal(pictures(page(canvas)).length, 0)
})

test("a loose box names the pictures mostly inside it (Moosewood's logo in the brief's box); a background never", () => {
  const found = [
    { box: { x: 100, y: 40, w: 235, h: 32 }, kind: 'raster' as const, color: null },
    { box: { x: 0, y: 0, w: 600, h: 800 }, kind: 'fill' as const, color: '#b31a1a' },
    { box: { x: 400, y: 300, w: 50, h: 50 }, kind: 'vector' as const, color: null },
  ]
  assert.deepEqual(pictureIn({ x: 90, y: 20, w: 263, h: 111 }, found, 600, 800), found[0]?.box)
  assert.equal(pictureIn({ x: 10, y: 600, w: 50, h: 50 }, found, 600, 800), null)
})

test("of several pictures in a model's box, the one or the union that fits it best (Carew's room vs 2nd Ave's strips)", () => {
  const photo = (x: number, y: number) => ({ box: { x, y, w: 200, h: 150 }, kind: 'raster' as const, color: null })
  const grid = [photo(0, 0), photo(200, 0), photo(0, 150), photo(200, 150)]
  assert.deepEqual(pictureIn({ x: 0, y: 0, w: 230, h: 170 }, grid, 600, 800), grid[0]?.box)
  const strips = [0, 40, 80].map((y) => ({
    box: { x: 50, y: y + 100, w: 100, h: 40 },
    kind: 'raster' as const,
    color: null,
  }))
  assert.deepEqual(pictureIn({ x: 45, y: 95, w: 110, h: 130 }, strips, 600, 800), { x: 50, y: 100, w: 100, h: 120 })
})

test('a watermark is no icon piece: a wheat touching the fish drawn through a 5 % mask stays its own size (Howies group)', () => {
  const mask =
    '<mask id="m"><rect x="0" y="0" width="600" height="800" fill="rgb(0%, 0%, 0%)" fill-opacity="0.05"/></mask>'
  const fish = `<g mask="url(#m)">${rect(107, 55, 16, 11)}</g>`
  const { art, placed, width, height } = parseVectors(page(rect(100, 50, 7, 10) + fish, mask))
  assert.deepEqual(
    piecesOf(art, placed, [], width, height).map((p) => [p.box.x, p.box.w]),
    [[100, 7]],
  )
  const alone = parseVectors(page(fish, mask))
  assert.deepEqual(piecesOf(alone.art, alone.placed, [], alone.width, alone.height), [])
})

test('piecesOf keeps neighbouring drawings apart where picturesOf groups them (two icons before one dish)', () => {
  const { art, placed, width, height } = parseVectors(page(rect(100, 50, 10, 13) + rect(114, 50, 13, 13)))
  assert.equal(picturesOf(art, placed, [], width, height).length, 1)
  assert.deepEqual(
    piecesOf(art, placed, [], width, height).map((p) => [p.kind, p.box.x, p.box.w]),
    [
      ['vector', 100, 10],
      ['vector', 114, 13],
    ],
  )
})
