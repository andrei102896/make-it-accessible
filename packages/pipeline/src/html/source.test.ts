import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { inkedHtml, inkSegments, placedRuns } from './source.ts'

test('the placed words are every shown word a text cites, prices and nested names too; dropped ones are not', () => {
  const runs = ['MENU', 'ghost', 'Soup', '$9', 'p.2'].map((str, i) => ({
    id: `1:${String(i)}`,
    str,
    box: { x: i * 10, y: 0, w: 8, h: 10 },
    flow: 0,
    line: 0,
  }))
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: ['1:1'] }
  const page = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'heading', level: 2, text: { src: [[0, 1]] } },
        { kind: 'products', items: [{ name: { src: [[2, 2]] }, prices: [{ src: [[3, 3]] }] }] },
      ],
      dropped: [[4, 4]],
    }),
  )
  assert.deepEqual(
    placedRuns(page, e).map((r) => r.str),
    ['MENU', 'Soup', '$9'],
  )
})

test("text set on its side is not placed: it stays printed in the backdrop (Michael's vertical tagline)", () => {
  const runs = [
    { str: 'adjective', box: { x: 560, y: 100, w: 10, h: 60 } },
    { str: 'Raw', box: { x: 60, y: 100, w: 30, h: 12 } },
  ].map((r, i) => ({ ...r, id: `1:${String(i)}`, flow: 0, line: i }))
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const page = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'paragraph', text: { src: [[0, 0]] } },
        { kind: 'heading', level: 2, text: { src: [[1, 1]] } },
      ],
    }),
  )
  assert.deepEqual(
    placedRuns(page, e).map((r) => r.str),
    ['Raw'],
  )
})

test('text the validator doubts is not placed: the print shows it right (Carmine’s subtitle citing far-apart words)', () => {
  const runs = ['FAMOUS', 'BREAD'].map((str, i) => ({
    id: `1:${String(i)}`,
    str,
    box: { x: i * 300, y: 50, w: 60, h: 12 },
    flow: 0,
    line: i,
  }))
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const page = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'paragraph', text: { src: [[0, 0]] } },
        { kind: 'heading', level: 2, text: { src: [[1, 1]] } },
      ],
    }),
  )
  assert.deepEqual(
    placedRuns(page, e, ['blocks[0]']).map((r) => r.str),
    ['BREAD'],
  )
})

test("an icon's words are tagged in both views, the tag carrying the drawing's width (Howies' gluten free)", () => {
  const run = (id: string, str: string, x: number, w: number, icon?: true): Run => ({
    id,
    str,
    box: { x, y: 257, w, h: 16.5 },
    flow: 0,
    line: 12,
    ...(icon && { icon }),
  })
  const e: Extraction = {
    pdfPage: 1,
    width: 842,
    height: 1191,
    runs: [
      run('1:0', '(', 243, 4.1),
      run('1:1', 'available)', 265.4, 42.7),
      run('1:2', 'gluten', 251.4, 10.7, true),
      run('1:3', 'free', 251.4, 10.7, true),
    ],
    images: [],
    duplicates: [],
    hidden: [],
  }
  const segments = inkSegments(
    {
      src: [
        [0, 0],
        [2, 3],
        [1, 1],
      ],
    },
    e,
    '( gluten free available)',
  )
  assert.deepEqual(
    segments.map((s) => [s.text, s.icon]),
    [
      ['( ', null],
      ['gluten free', 1.271],
      [' available)', null],
    ],
  )
  assert.equal(
    inkedHtml(segments, new Set(), (s) => s),
    '( <span class="diet icon" style="--iw:1.271"><span>gluten free</span></span> available)',
  )
})
