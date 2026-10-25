import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import { BACKDROP_VERSION, type Grid } from '../pdf/backdrop.ts'
import { asDrawn, printedReads } from './printink.ts'
import type { HtmlPage } from './types.ts'

const blank: Grid = {
  version: BACKDROP_VERSION,
  cell: 8,
  cols: 1,
  rows: 1,
  min: [1],
  max: [1],
  mean: ['#ffffff'],
  inks: {},
  alpha: {},
  shadows: {},
  strokes: {},
  undrawn: [],
  kept: [],
  ends: {},
  capsFaces: [],
  ground: null,
  fills: null,
}

test("each word takes its drawn colour, named by the brand ink it matches: the text layer's colour on the wrong letters moves (Kenny & Ziggy's CAKES & PIES)", () => {
  const font = { key: 'sans', size: 60, weight: 700, italic: false }
  const run = (id: string, str: string, color: string): HtmlPage['extraction']['runs'][number] => ({
    id,
    str,
    box: { x: 0, y: 0, w: 10, h: 10 },
    flow: 0,
    line: 0,
    color,
    font,
  })
  const page: HtmlPage = {
    keyPage: 1,
    structure: parsePage(
      JSON.stringify({ lang: 'en', blocks: [{ kind: 'paragraph', text: { seen: 'CAKES & PIES' } }] }),
    ),
    extraction: {
      pdfPage: 8,
      width: 612,
      height: 1008,
      runs: [run('8:0', 'C', '#f8a62c'), run('8:5', '&', '#231f20'), run('8:6', 'P', '#bf1c23')],
      images: [],
      duplicates: [],
      hidden: [],
    },
    flagged: [],
    imageSrc: () => undefined,
    backdrop: { src: 'b.webp', src2x: 'b2.webp', grid: { ...blank, inks: { '8:0': '#bf1d23', '8:5': '#f9a72d' } } },
  }
  const drawn = asDrawn(page, new Set(['#bf1c23', '#f8a62c']))
  assert.deepEqual(
    drawn.extraction.runs.map((r) => r.color),
    ['#bf1c23', '#f8a62c', '#bf1c23'],
  )
  const unprinted = { ...page, backdrop: null }
  assert.equal(asDrawn(unprinted, new Set(['#bf1c23'])), unprinted)
})

test("the cells under a word's letters decide, not the row its box shares with a QR code or the page below (BOOK NOW)", () => {
  // The box spans rows 1 and 2; its letters' bodies (inset a quarter top and bottom) lie in row 2 alone.
  const gold = { box: { x: 0, y: 8, w: 8, h: 17 }, color: '#d69f65', alpha: 1, shadow: null, stroke: null }
  const band: Grid = {
    ...blank,
    rows: 4,
    min: [1, 0, 0.38, 1],
    max: [1, 0, 1, 1],
    mean: ['#ffffff', '#000000', '#f0e6dc', '#ffffff'],
  }
  // Gold on its white row reads under 4.5:1; the black row above would have passed it.
  assert.equal(printedReads(gold, band, 4.5), false)
})

test("a printed line is counted under its target on the print's own ground, its letters in the cells beside it (Howies' gold)", () => {
  const word = { box: { x: 0, y: 0, w: 8, h: 8 }, alpha: 1, shadow: null, stroke: null }
  // The cell holds the gold letters (its darkest) and the white paper (its lightest).
  const cell: Grid = { ...blank, min: [0.38], max: [1], mean: ['#f0e6dc'] }
  assert.equal(printedReads({ ...word, color: '#d69f65' }, cell, 4.5), false)
  assert.equal(printedReads({ ...word, color: '#1a1a1a' }, { ...cell, min: [0.01] }, 4.5), true)
  assert.equal(printedReads({ ...word, color: '#1a1a1a' }, null, 4.5), null)
  // A printed outline is the letters' edge (WCAG 1.4.3): La Segunda's yellow outlined in red reads.
  const outlined = { ...word, color: '#ffe600', stroke: { color: '#b00000', width: 1 } }
  assert.equal(printedReads(outlined, { ...cell, min: [0.8] }, 4.5), true)
})
