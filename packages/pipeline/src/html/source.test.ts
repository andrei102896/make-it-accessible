import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction } from '../pdf/types.ts'
import { placedRuns } from './source.ts'

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
