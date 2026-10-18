import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import { printCss } from './print.ts'
import { asDrawn } from './printink.ts'
import type { HtmlPage } from './types.ts'

const blank: Grid = {
  version: 6,
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
  baselines: {},
  tracking: {},
  faces: {},
  fonts: {},
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
    backdrop: { src: 'b.jpg', grid: { ...blank, inks: { '8:0': '#bf1d23', '8:5': '#f9a72d' } } },
  }
  const drawn = asDrawn(page, new Set(['#bf1c23', '#f8a62c']))
  assert.deepEqual(
    drawn.extraction.runs.map((r) => r.color),
    ['#bf1c23', '#f8a62c', '#bf1c23'],
  )
  const unprinted = { ...page, backdrop: null }
  assert.equal(asDrawn(unprinted, new Set(['#bf1c23'])), unprinted)
})

test('the printed view sets each brand ink from its line, and nothing without one', () => {
  assert.doesNotMatch(printCss(1200, []), /ink-/)
  assert.match(
    printCss(1200, ['#c00000']),
    /\[style\*="--x:"\] \.ink-c00000 \{ color: var\(--ink-c00000, inherit\); \}/,
  )
})
