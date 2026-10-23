import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Grid } from '../pdf/backdrop.ts'
import type { Extraction } from '../pdf/types.ts'
import { renderDocument } from './document.ts'
import { placement, placer } from './placed.ts'
import { spotsOf, type Spot } from './spots.ts'
import { printWidth } from './print.ts'
import { inkedHtml } from './segments.ts'
import { visibleText } from './source.ts'

const font = { key: 'serif', size: 9, weight: 400, italic: false }
const words = ['MENU', 'Soup', 'of', 'the', 'day', '$9']
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map((str, i) => ({
    id: `1:${String(i)}`,
    str,
    box: i === 0 ? { x: 200, y: 40, w: 200, h: 30 } : { x: 60 + i * 30, y: 200, w: 25, h: 10 },
    flow: 0,
    line: i === 0 ? 0 : 1,
    color: i === 0 ? '#ffffff' : '#222222',
    font: i === 0 ? { ...font, size: 28, weight: 700 } : font,
  })),
  images: [],
  duplicates: [],
  hidden: [],
}
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 1, text: { src: [[0, 0]] } },
      { kind: 'paragraph', text: { seen: 'Est. 1962' } },
      { kind: 'products', items: [{ name: { src: [[1, 4]] }, prices: [{ src: [[5, 5]] }] }] },
    ],
  }),
)
// A page shown on `grid`'s backdrop.
const shown = (grid: Grid): { src: string; src2x: string; grid: Grid } => ({ src: 'b.webp', src2x: 'b2.webp', grid })
// White everywhere: the white title fails on it, the dark dish passes.
const white: Grid = {
  version: 10,
  cell: 8,
  cols: 75,
  rows: 100,
  min: Array.from({ length: 7500 }, () => 1),
  max: Array.from({ length: 7500 }, () => 1),
  mean: Array.from({ length: 7500 }, () => '#ffffff'),
  inks: { '1:0': '#fff100' },
  alpha: {},
  shadows: {},
  strokes: {},
  undrawn: [],
  kept: [],
  ends: {},
  capsFaces: [],
}

test('each leaf is a box at its printed place and size, its ink only counted; text read from a picture has no spot', () => {
  const spots = spotsOf(structure.blocks, extraction, white)
  assert.deepEqual(
    [...spots.keys()],
    ['blocks[0]', 'blocks[2].items[0].name', 'blocks[2].items[0].prices[0]', 'blocks[2].items[0].prices[0].amount'],
  )
  const title = spots.get('blocks[0]')
  assert.ok(title)
  assert.equal(
    placement(title, extraction.width, white, 2),
    // The yellow title reads under 4.5:1 on white as printed: counted (`--low`).
    ' style="--x:33.333;--y:6.667;--w:33.333;--h:5;--fs:4.667;--lh:5;--ws:nowrap;--ta:center;--low:1"',
  )
  const name = spots.get('blocks[2].items[0].name')
  assert.ok(name)
  // Nothing of a face, an ink or a fit: the box is the print's, whatever the reader's fonts (2026-10-23).
  assert.doesNotMatch(placement(name, extraction.width, white, 2), /--(c|ts|st|ff|fw|fi|ls|bl|k|lx|ti)[:-]|--ink-/)
})

test('a page with a backdrop renders both views from one document; without one, nothing of the printed view', () => {
  const page = { keyPage: 1, structure, extraction, flagged: [], imageSrc: () => undefined }
  const html = renderDocument({
    lang: 'en',
    title: 'T',
    pages: [{ ...page, backdrop: { src: 'p01/backdrop-1x.webp', src2x: 'p01/backdrop-2x.webp', grid: white } }],
  })
  assert.match(html, /<fieldset class="view">/)
  assert.match(html, /<section [^>]*style="--ar:600\/800">/)
  assert.match(
    html,
    /<img class="backdrop" src="p01\/backdrop-1x.webp" srcset="p01\/backdrop-1x.webp 1x, p01\/backdrop-2x.webp 2x" alt="" loading="lazy" decoding="async">/,
  )
  assert.match(html, /<p data-free>/)
  assert.match(html, /<div class="lead">/)
  const plain = renderDocument({ lang: 'en', title: 'T', pages: [page] })
  assert.doesNotMatch(plain, /--x:|class="view"|backdrop|class="lead"|view-print/)
})

test('the printed view needs a width that shows the body text at 12 px, never a phone; a cover has no body', () => {
  assert.equal(printWidth([{ extraction }]), null)
  // Most letters at 9 pt on a 600 pt page: 12 × 600 / 9 = 800 px, plus main's padding.
  assert.equal(printWidth([{ extraction, backdrop: {} }]), 832)
  const poster = { ...extraction, runs: extraction.runs.map((r) => ({ ...r, font: { ...font, size: 40 } })) }
  const cover = { ...extraction, runs: [] }
  assert.equal(
    printWidth([
      { extraction: cover, backdrop: {} },
      { extraction: poster, backdrop: {} },
    ]),
    800,
  )
  assert.equal(printWidth([{ extraction: cover, backdrop: {} }]), null)
})

test('a title printed as two lines in two faces is placed line by line, each with its own size and ink (Bannatyne)', () => {
  const runs = [
    { str: 'BANNATYNE', box: { x: 95, y: 46, w: 402, h: 73 }, line: 0, color: '#ffffff', size: 59 },
    { str: 'Wedding', box: { x: 20, y: 100, w: 250, h: 115 }, line: 1, color: '#785380', size: 68 },
    { str: 'Brochure', box: { x: 293, y: 100, w: 265, h: 115 }, line: 1, color: '#785380', size: 68 },
  ].map(({ size, ...r }, i) => ({ ...r, id: `1:${String(i)}`, flow: 0, font: { ...font, size } }))
  const e: Extraction = { ...extraction, runs }
  const title = parsePage(
    JSON.stringify({ lang: 'en', blocks: [{ kind: 'heading', level: 1, text: { src: [[0, 2]] } }] }),
  )
  const page = { keyPage: 1, structure: title, extraction: e, flagged: [], imageSrc: () => undefined }
  const lilac: Grid = { ...white, min: white.min.map(() => 0.45), max: white.max.map(() => 0.47), inks: {} }
  const html = renderDocument({ lang: 'en', title: 'T', pages: [{ ...page, backdrop: shown(lilac) }] })
  const heading = /<h3[^>]*>(.*?)<\/h3>/.exec(html)?.[1] ?? ''
  assert.match(html, /<h3 [^>]*data-pl>/)
  const lines = [...heading.matchAll(/<span class="pl" style="([^"]*)">([^<]*)<\/span>/g)]
  assert.deepEqual(
    lines.map((m) => m[2]),
    ['BANNATYNE', 'Wedding Brochure'],
  )
  assert.match(lines[0]?.[1] ?? '', /--fs:9\.833/)
  assert.match(lines[1]?.[1] ?? '', /--fs:11\.333/)
  assert.equal(heading.replace(/<[^>]*>/g, ''), 'BANNATYNE Wedding Brochure')
})

test("a price whose label is printed apart from its amount places each where it is printed (Carmine's Single 4)", () => {
  const runs = [
    { str: 'Coffee', box: { x: 60, y: 100, w: 60, h: 10 } },
    { str: 'Single', box: { x: 300, y: 80, w: 40, h: 10 } },
    { str: '4', box: { x: 310, y: 100, w: 8, h: 10 } },
  ].map((r, i) => ({ ...r, id: `1:${String(i)}`, flow: 0, line: i, color: '#222222', font }))
  const e: Extraction = { ...extraction, runs }
  const menu = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        {
          kind: 'products',
          items: [{ name: { src: [[0, 0]] }, prices: [{ src: [[2, 2]], qualifier: { src: [[1, 1]] } }] }],
        },
      ],
    }),
  )
  const page = { keyPage: 1, structure: menu, extraction: e, flagged: [], imageSrc: () => undefined }
  const html = renderDocument({ lang: 'en', title: 'T', pages: [{ ...page, backdrop: shown(white) }] })
  assert.match(html, /<span class="price[^"]*" data-role="current"[^>]* data-pl>/)
  assert.match(html, /<span class="qualifier" style="--x:50;--y:13\.333;/)
  assert.match(html, /<span class="amount" style="--x:51\.667;--y:16\.667;/)
})

test("a column head several prices share is placed once; the other prices read it beside their amount (Scotts' Bottle)", () => {
  const at = (str: string, x: number, y: number, w: number) => ({ str, box: { x, y, w, h: 10 } })
  const runs = [at('Bottle', 300, 80, 40), at('Zonin', 60, 100, 60), at('33', 310, 100, 14)]
    .concat([at('Delamotte', 60, 120, 60), at('64', 310, 120, 14)])
    .map((r, i) => ({ ...r, id: `1:${String(i)}`, flow: 0, line: i, color: '#222222', font }))
  const e: Extraction = { ...extraction, runs }
  const head = { qualifier: { src: [[0, 0]] } }
  const item = (n: number) => ({ name: { src: [[n, n]] }, prices: [{ src: [[n + 1, n + 1]], ...head }] })
  const menu = parsePage(JSON.stringify({ lang: 'en', blocks: [{ kind: 'products', items: [item(1), item(3)] }] }))
  const page = { keyPage: 1, structure: menu, extraction: e, flagged: [], imageSrc: () => undefined }
  const html = renderDocument({ lang: 'en', title: 'T', pages: [{ ...page, backdrop: shown(white) }] })
  assert.equal(html.match(/<span class="qualifier" style="--x:/g)?.length, 1)
  assert.match(html, /<span class="qualifier" data-free>Bottle<\/span>/)
  assert.equal(html.match(/<span class="amount" style="--x:51\.667;/g)?.length, 2)
})

test('a leaf the validator doubts is read, not placed: the backdrop keeps its printed words', () => {
  const page = { keyPage: 1, structure, extraction, flagged: ['blocks[0]'], imageSrc: () => undefined }
  const html = renderDocument({ lang: 'en', title: 'T', pages: [{ ...page, backdrop: shown(white) }] })
  assert.match(html, /<h3 [^>]*data-review data-free>/)
})

test("words printed inside a picture under an invisible text layer are not drawn again (Stone House's cover)", () => {
  const cover: Grid = { ...white, undrawn: ['1:0'] }
  const page = { keyPage: 1, structure, extraction, flagged: [], imageSrc: () => undefined }
  const html = renderDocument({ lang: 'en', title: 'T', pages: [{ ...page, backdrop: shown(cover) }] })
  assert.match(html, /<h3 [^>]*data-free>/)
  assert.ok(spotsOf(structure.blocks, extraction, cover).has('blocks[2].items[0].name'))
})

test('an ink printed at an opacity is weighed blended over its ground; a printed shadow that carries the contrast reads', () => {
  const olive: Grid = {
    ...white,
    mean: white.mean.map(() => '#aa9f62'),
    min: white.min.map(() => 0.3),
    max: white.max.map(() => 0.38),
    inks: { '1:0': '#ffffff' },
    alpha: { '1:0': 0.84 },
    shadows: {},
  }
  const title = spotsOf(structure.blocks, extraction, olive).get('blocks[0]')
  assert.ok(title)
  assert.match(placement(title, extraction.width, olive, 2), /--low:1/)
  const shadowed: Grid = { ...olive, alpha: {}, shadows: { '1:0': { color: '#231f20', dx: 0, dy: 2 } } }
  const lifted = spotsOf(structure.blocks, extraction, shadowed).get('blocks[0]')
  assert.ok(lifted)
  assert.doesNotMatch(placement(lifted, extraction.width, shadowed, 2), /--low/)
})

test("a line's ink is its unmarked words' (Almond's red Micky's before Ramen); its words keep their brand-ink spans, each printed line its own box", () => {
  const runs = [
    { str: "Micky's", box: { x: 60, y: 200, w: 40, h: 10 }, line: 0, color: '#c00000' },
    { str: 'Ramen', box: { x: 104, y: 200, w: 34, h: 10 }, line: 0, color: '#000000' },
    { str: 'pickled', box: { x: 60, y: 220, w: 40, h: 10 }, line: 1, color: '#000000' },
    { str: 'beets', box: { x: 104, y: 220, w: 30, h: 10 }, line: 1, color: '#000000' },
    { str: 'Farm', box: { x: 60, y: 232, w: 30, h: 10 }, line: 2, color: '#c00000' },
    { str: 'Sun', box: { x: 94, y: 232, w: 20, h: 10 }, line: 2, color: '#ffee00' },
    { str: 'grown', box: { x: 118, y: 232, w: 30, h: 10 }, line: 2, color: '#000000' },
    { str: 'SALADS', box: { x: 60, y: 260, w: 60, h: 14 }, line: 3, color: '#c00000' },
    { str: 'BAR', box: { x: 124, y: 260, w: 30, h: 14 }, line: 3, color: '#c00000' },
  ].map((r, i) => ({ ...r, id: `1:${String(i)}`, flow: 0, font }))
  const e: Extraction = { ...extraction, runs }
  const page = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'heading', level: 2, text: { src: [[0, 1]] } },
        { kind: 'paragraph', text: { src: [[2, 6]] } },
        { kind: 'heading', level: 2, text: { src: [[7, 8]] } },
      ],
    }),
  )
  const grid: Grid = { ...white, inks: Object.fromEntries(runs.map((r) => [r.id, r.color])) }
  const inks = new Set(['#c00000', '#ffee00'])
  const pl = placer(
    {
      keyPage: 1,
      structure: page,
      extraction: e,
      flagged: [],
      imageSrc: () => undefined,
      backdrop: { src: 'b.webp', src2x: 'b2.webp', grid },
    },
    { printPx: null, inks },
  )
  // Red on white reads; the line is weighed by its black words all the same.
  assert.doesNotMatch(pl.place('blocks[0]'), /--low|--c:|--ink-/)
  const text = page.blocks[1]?.kind === 'paragraph' ? page.blocks[1].text : { seen: '' }
  const lines = pl.lined('blocks[1]', text, visibleText(text, e), (s) => inkedHtml(s, inks, (x) => x)) ?? ''
  assert.match(lines, /<span class="pl" style="[^"]*"><span class="ink-c00000">Farm/)
  assert.doesNotMatch(lines, /--ink-/)
})

test('bold text from 18.66 px is large and reads at 3:1 as printed; at its regular weight it needs 4.5:1', () => {
  // Grey #888888 on white is 3.5:1; 10 pt at 2 px a point is 20 px.
  const spot = (weight: number): Spot => ({
    box: { x: 100, y: 100, w: 80, h: 12 },
    size: 10,
    lines: 1,
    align: 'left',
    color: '#888888',
    alpha: 1,
    shadow: null,
    stroke: null,
    weight,
  })
  assert.doesNotMatch(placement(spot(700), extraction.width, white, 2), /--low/)
  assert.match(placement(spot(400), extraction.width, white, 2), /--low:1/)
})
