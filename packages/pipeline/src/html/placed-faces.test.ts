import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { placer } from './placed.ts'

const font = { key: 'gotham', size: 9, weight: 400, italic: false }
const run = (i: number, str: string, weight: number): Run => ({
  id: `1:${String(i)}`,
  str,
  box: { x: 60 + i * 40, y: 200, w: 35, h: 10 },
  flow: 0,
  line: 0,
  color: '#222222',
  font: { ...font, weight },
})
const runs = [run(0, 'GAELIC', 700), run(1, '(Monkey', 400), run(2, 'Shoulder,', 400), run(3, '40%)', 400)]
const extraction: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
const structure = parsePage(JSON.stringify({ lang: 'en', blocks: [{ kind: 'paragraph', text: { src: [[0, 3]] } }] }))
const grid: Grid = {
  version: 9,
  cell: 8,
  cols: 75,
  rows: 100,
  min: Array.from({ length: 7500 }, () => 1),
  max: Array.from({ length: 7500 }, () => 1),
  mean: Array.from({ length: 7500 }, () => '#ffffff'),
  inks: {},
  alpha: {},
  shadows: {},
  strokes: {},
  undrawn: [],
  kept: [],
  baselines: {},
  ends: {},
  tracking: {},
  faces: { '1:0': 'pdf-aaaaaaaaaaaa', '1:1': 'pdf-bbbbbbbbbbbb', '1:2': 'pdf-bbbbbbbbbbbb', '1:3': 'pdf-bbbbbbbbbbbb' },
  fonts: {},
  metrics: {},
  capsFaces: [],
}

test("a word printed in another weight or program of its line's family keeps its own (GAELIC bold before its note)", () => {
  const pl = placer(
    {
      keyPage: 1,
      structure,
      extraction,
      flagged: [],
      imageSrc: () => undefined,
      backdrop: { src: 'b.webp', src2x: 'b2.webp', grid },
    },
    { printPx: null, library: [], inks: new Set() },
  )
  // The line takes the program most of its letters use; GAELIC keeps its bold one.
  assert.match(pl.place('blocks[0]'), /--ff:'pdf-bbbbbbbbbbbb'/)
  const face = pl.faceOf('blocks[0]')
  assert.ok(face)
  const [gaelic, monkey] = runs
  assert.ok(gaelic && monkey)
  assert.equal(face(gaelic), "--ff:'pdf-aaaaaaaaaaaa';--fw:700;--fi:normal")
  assert.equal(face(monkey), null)
  // Another family's word keeps the line's face.
  assert.equal(face({ ...gaelic, font: { ...font, key: 'script' } }), null)
  // Most letters in no program of the PDF's own: the line takes none.
  const few: Grid = { ...grid, faces: { '1:0': 'pdf-aaaaaaaaaaaa' } }
  const other = placer(
    {
      keyPage: 1,
      structure,
      extraction,
      flagged: [],
      imageSrc: () => undefined,
      backdrop: { src: 'b.webp', src2x: 'b2.webp', grid: few },
    },
    { printPx: null, library: [], inks: new Set() },
  )
  assert.doesNotMatch(other.place('blocks[0]'), /--ff:/)
})
