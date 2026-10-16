import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '@make-it-accessible/pipeline/model/schema'
import type { Extraction, Run } from '@make-it-accessible/pipeline/pdf/types'
import { columnsPerPage, dietaryCodes, pricePlacement } from './wiki-facts.ts'

// Words at (x, y) on a 600 x 800 page; each is 10 pt high and 6 pt per character wide.
const page = (words: [string, number, number][]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, y], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y, w: str.length * 6, h: 10 },
    flow: 0,
    line: i,
  })),
  images: [],
  duplicates: [],
  hidden: [],
})
const lists = (groups: number[][][]) =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: groups.map((g) => ({
        kind: 'products',
        items: g.map(([n, p]) => ({ name: { src: [[n, n]] }, prices: [{ src: [[p, p]] }] })),
      })),
      dropped: [],
    }),
  )

test('lists side by side count as columns; a wide list is one full-width row', () => {
  const e = page([
    ['Soup', 20, 100],
    ['8', 250, 100],
    ['Steak', 320, 100],
    ['24', 560, 100],
    ['Dessert', 20, 400],
    ['6', 560, 400],
  ])
  const twoColumns = lists([[[0, 1]], [[2, 3]]])
  assert.deepEqual(columnsPerPage([{ structure: twoColumns, extraction: e }]), [2])
  const oneWide = lists([[[4, 5]]])
  assert.deepEqual(columnsPerPage([{ structure: oneWide, extraction: e }]), [1])
})

test('a price right after the name is inline; one at the column edge is right-aligned', () => {
  const e = page([
    ['Soup', 20, 100],
    ['8', 50, 100],
    ['Steak', 20, 130],
    ['24', 560, 130],
  ])
  const s = lists([
    [
      [0, 1],
      [2, 3],
    ],
  ])
  assert.deepEqual(pricePlacement([{ structure: s, extraction: e }]), { inline: 1, right: 1 })
})

test('dietary legends and coded lines are counted as printed', () => {
  const e = page([
    ['BREAD', 20, 100],
    ['7', 80, 100],
    ['(VO)', 100, 100],
    ['(V)', 400, 100],
    ['VEGAN', 430, 100],
    ['(GFO,', 20, 130],
    [')', 60, 130],
  ])
  assert.deepEqual(dietaryCodes([{ structure: lists([[[0, 1]]]), extraction: e }]), { legendEntries: 1, codedLines: 2 })
})
