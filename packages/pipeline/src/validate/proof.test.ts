import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageStructure } from '../model/schema.ts'
import type { OcrWord } from '../pdf/ocr.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { digitsIn, printedHead, readTwice, separatorOnly, wordsOfPicture } from './proof.ts'
import { unverified, validatePage } from './validate.ts'

const run = (i: number, str: string, x: number, y: number, w: number, line: number): Run => ({
  id: `1:${String(i)}`,
  str,
  box: { x, y, w, h: 9 },
  flow: 0,
  line,
  font: { key: 'gotham', size: 9, weight: 400, italic: false },
})
const word = (str: string, x: number, y: number, block = 1): OcrWord => ({
  str,
  box: { x, y, w: 30, h: 9 },
  block,
  line: 0,
})

test('a separator between words is no word of its own; "&", "+", "*", "%" and signs are', () => {
  for (const s of ['–', '/', '|', '...', '•', '·', '_', '—']) assert.ok(separatorOnly(run(0, s, 0, 0, 5, 0)), s)
  for (const s of ['&', '+', '*', '%', '£', 'a', '1', 'Ⓥ', '....---+++->'])
    assert.ok(!separatorOnly(run(0, s, 0, 0, 5, 0)), s)
})

// Howies' wines: "175ml 250ml Bottle" printed once over three price columns, two rows of prices below.
const heads = [run(0, '175ml', 285, 52, 24, 0), run(1, '250ml', 323, 52, 27, 0), run(2, 'Bottle', 360, 52, 26, 0)]
const rows = [
  [run(3, '6.40', 292, 66, 19, 1), run(4, '9.75', 329, 66, 17, 1), run(5, '26.50', 365, 66, 24, 1)],
  [run(6, '6.60', 292, 102, 19, 2), run(7, '9.95', 329, 102, 18, 2), run(8, '27.50', 366, 102, 23, 2)],
]
const layer = [...heads, ...rows.flat()]
const amounts = new Set(rows.flat().map((r) => r.id))

test("a price's label is its column's head: above it, other amounts aside, alone over the column", () => {
  const second = rows[1] ?? []
  const at = (i: number): Run[] => second.slice(i, i + 1)
  assert.ok(printedHead(at(0), '175ml', layer, { amounts, headings: [] }))
  assert.ok(printedHead(at(2), 'bottle', layer, { amounts, headings: [] }))
  // Another column's head, or a heading printed between head and amount, is no proof.
  assert.ok(!printedHead(at(0), '250ml', layer, { amounts, headings: [] }))
  const between = { x: 0, y: 80, w: 400, h: 12 }
  assert.ok(!printedHead(at(0), '175ml', layer, { amounts, headings: [between] }))
  // Heads printed closer than a word gap read as one line ("175ml 250ml"): neither alone is a column's.
  const tight = [run(0, '175ml', 285, 52, 24, 0), run(1, '250ml', 312, 52, 27, 0), ...rows.flat()]
  assert.ok(!printedHead(at(0), '175ml', tight, { amounts, headings: [] }))
})

test('text read from the image is confirmed by OCR as one sequence in one block, never by a word the layer has', () => {
  const logo = [word('HOWIES', 150, 100), word('—', 170, 120), word('RESTAURANT', 180, 120)]
  assert.ok(readTwice('HOWIES RESTAURANT', logo, []))
  // A logo's lines are OCR blocks of their own: the line just below, under it, continues; one elsewhere does not.
  assert.ok(readTwice('HOWIES RESTAURANT', [word('HOWIES', 150, 100), word('RESTAURANT', 160, 115, 2)], []))
  assert.ok(!readTwice('HOWIES RESTAURANT', [word('HOWIES', 150, 100), word('RESTAURANT', 400, 115, 2)], []))
  assert.ok(!readTwice('HOWIES RESTAURANT', [word('HOWIES', 150, 100), word('RESTAURANT', 160, 300, 2)], []))
  assert.ok(!readTwice('GF', [word('GF', 10, 10)], []))
  // OCR reading a word the layer prints confirms nothing read from the image: the model should have cited it.
  assert.ok(!readTwice('HOWIES RESTAURANT', logo, [run(0, 'HOWIES', 150, 100, 30, 0)]))
})

test("an alt's digits are printed for it when OCR reads them inside its picture", () => {
  const badge = { x: 28, y: 41, w: 62, h: 62 }
  assert.ok(digitsIn('2025', badge, [word('2025', 40, 80)]))
  assert.ok(!digitsIn('2025', badge, [word('2025', 300, 80)]))
})

test('the validator holds neither a label printed as its column head nor a separator; it holds the rest', () => {
  const e: Extraction = {
    pdfPage: 1,
    width: 600,
    height: 800,
    runs: [...layer, run(9, 'Rioja', 20, 66, 30, 1), run(10, '–', 60, 66, 5, 1), run(11, 'Malbec', 20, 102, 30, 2)],
    images: [],
    duplicates: [],
    hidden: [],
  }
  // Malbec's middle price is given the first column's label: that one is held.
  const item = (
    name: number,
    from: number,
    labels: readonly string[],
  ): PageStructure['blocks'][number] & {
    kind: 'products'
  } => ({
    kind: 'products',
    items: [
      {
        name: { src: [[name, name]] },
        prices: labels.map((label, i) => ({
          src: [[from + i, from + i]],
          role: 'current' as const,
          qualifier: { seen: label },
        })),
        details: [],
      },
    ],
  })
  const page: PageStructure = {
    lang: 'en',
    dropped: [[0, 2]],
    blocks: [item(9, 3, ['175ml', '250ml', 'Bottle']), item(11, 6, ['175ml', '175ml', 'Bottle'])],
  }
  const v = validatePage(page, e)
  assert.deepEqual(
    unverified(v).map((f) => f.path),
    ['blocks[1].items[0].prices[1].qualifier'],
  )
  assert.deepEqual(v.uncovered, [])
})

test("a picture's own lettering is the words inside it its alt names each piece of; others are printed over it", () => {
  const logo = { x: 150, y: 480, w: 120, h: 60 }
  const runs = [
    run(0, 'EST-1990', 195, 484, 30, 0),
    run(1, 'HOWIES', 151, 502, 116, 1),
    run(2, 'Brunch', 160, 520, 40, 2),
  ]
  const e = { runs: [...runs, run(3, 'HOWIES', 151, 700, 116, 3)], pictures: [], width: 420, height: 595 }
  assert.deepEqual(
    wordsOfPicture(logo, 'Howies Restaurant logo, est. 1990', e).map((r) => r.str),
    ['EST-1990', 'HOWIES'],
  )
})
