import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import { printCss } from './print.ts'
import { asDrawn, inkOn, inlineInk } from './printink.ts'
import type { HtmlPage } from './types.ts'

const blank: Grid = {
  version: 7,
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
  metrics: {},
  capsFaces: [],
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

test('a hairline or a panel edge inside a cell leaves the ground flat: the ink stays as printed, with no halo', () => {
  const gold = { box: { x: 0, y: 0, w: 16, h: 8 }, color: '#d69f65', alpha: 1, shadow: null, stroke: null }
  const framed: Grid = { ...blank, cols: 2, min: [0.775, 1], max: [1, 1], mean: ['#fefbf9', '#ffffff'] }
  const u = (v: number): string => String(v)
  assert.equal(inkOn(gold, framed, 4.5, u).shadow, 'none')
  assert.deepEqual(inkOn(gold, framed, 4.5, u), { color: '#d69f65', shadow: 'none' })
  const photo: Grid = { ...blank, cols: 2, min: [0.05, 0.9], max: [0.3, 1], mean: ['#333333', '#f0f0f0'] }
  // On a busy ground the halo is the ground's own colour (the cells' mean), never one moved dark to a target.
  assert.equal(inkOn(gold, photo, 4.5, u).shadow, '0 0 .04em #929292, 0 0 .08em #929292, 0 0 .3em #929292')
  // A word in its own brand ink inside a line keeps it on a flat ground, as the line would (Howies' gold gins).
  assert.equal(inlineInk(gold, framed, 4.5), '#d69f65')
  assert.equal(inlineInk(gold, photo, 4.5), null)
})

test("the cells under a word's letters decide, not the row its box shares with a QR code or the page below (BOOK NOW)", () => {
  const gold = { box: { x: 0, y: 8, w: 8, h: 17 }, color: '#d69f65', alpha: 1, shadow: null, stroke: null }
  const band: Grid = {
    ...blank,
    rows: 4,
    min: [1, 0.04, 0.04, 0.04],
    max: [1, 1, 0.04, 1],
    mean: ['#ffffff', '#0f1a24', '#073b5a', '#8a9099'],
  }
  const u = (v: number): string => String(v)
  assert.deepEqual(inkOn(gold, band, 4.5, u), { color: '#d69f65', shadow: 'none' })
})
