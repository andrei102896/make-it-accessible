import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { fitScale } from '../pdf/raster.ts'
import { assemble, bandsOf, segmentsOf } from './layout.ts'

// A 600 x 800 pt page; words at (x, y) with a font size; 6 pt per character wide.
const page = (words: [string, number, number, number][]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, y, size], i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x, y, w: str.length * 6, h: size },
    flow: 0,
    line: i,
    font: { key: 'oswald', weight: 400, italic: false, size },
  })),
  images: [],
  duplicates: [],
  hidden: [],
})
// The model image is fitScale(600, 800) pixels wide; the logo box is given in those pixels.
const extraction = page([
  ['EST.', 270, 60, 9],
  ['1948', 300, 60, 9],
  ['APPETIZERS', 40, 120, 16],
  ['Shrimp', 40, 150, 10],
  ['18', 500, 150, 10],
  ['Consuming', 40, 760, 7],
  ['raw', 100, 760, 7],
])
// The logo is centred on the page, 450 model pixels wide.
const logoX = Math.round((300 * fitScale(600, 800).width) / 600 - 225)
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'figure', image: { ref: 'img1:0', box: [logoX, 60, 450, 300], alt: "Carmine's Restaurant logo" } },
      { kind: 'paragraph', text: { src: [[0, 1]] } },
      { kind: 'heading', level: 2, text: { src: [[2, 2]] } },
      { kind: 'products', items: [{ name: { src: [[3, 3]] }, prices: [{ src: [[4, 4]] }] }] },
      { kind: 'paragraph', text: { src: [[5, 6]] } },
    ],
    dropped: [],
  }),
)

test('the header is the logo and its tagline before the first section; small print at the foot is the tail', () => {
  const s = segmentsOf({ structure, extraction }, true, 10, "Carmine's Restaurant & Bar")
  assert.deepEqual([...s.header], [0, 1])
  assert.deepEqual([...s.tail], [4])
  assert.equal(s.title, null)
  assert.equal(s.centered, true)
  assert.ok(s.logoShare !== null && Math.abs(s.logoShare - 450 / fitScale(600, 800).width) < 0.001)
})

test('a heading that names the place, or one twice the body, is the title; later pages have no header', () => {
  const named = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [{ kind: 'heading', level: 1, text: { src: [[2, 2]] } }, ...structure.blocks.slice(3)],
      dropped: [],
    }),
  )
  assert.equal(segmentsOf({ structure: named, extraction }, true, 10, 'Appetizers Bistro').title, 0)
  assert.equal(segmentsOf({ structure: named, extraction }, true, 8, 'Bistro').title, 0)
  assert.equal(segmentsOf({ structure: named, extraction }, true, 10, 'Bistro').title, null)
  assert.equal(segmentsOf({ structure, extraction }, false, 10, "Carmine's").header.size, 0)
  // Once the header holds the name, a big heading under it is the first section (Moosewood's script "shared").
  const bigUnderName = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'heading', level: 1, text: { src: [[2, 2]] } },
        { kind: 'heading', level: 2, text: { src: [[0, 1]] } },
        ...structure.blocks.slice(3),
      ],
      dropped: [],
    }),
  )
  const big = {
    ...extraction,
    runs: extraction.runs.map((r, i) =>
      i <= 1 ? { ...r, font: { key: 'oswald', weight: 400, italic: false, size: 32 } } : r,
    ),
  }
  assert.deepEqual(
    [...segmentsOf({ structure: bigUnderName, extraction: big }, true, 10, 'Appetizers Bistro').header],
    [0],
  )
  // A heading that opens no list is a header line beside the logo ("TO GO DINNER", hours, phone); lines alone,
  // without a logo or the name, make no header.
  const infoFirst = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        { kind: 'heading', level: 2, text: { src: [[0, 1]] } },
        { kind: 'paragraph', text: { src: [[0, 1]] } },
        structure.blocks[0],
        ...structure.blocks.slice(2),
      ],
      dropped: [],
    }),
  )
  assert.deepEqual([...segmentsOf({ structure: infoFirst, extraction }, true, 10, "Carmine's").header], [0, 1, 2])
  const linesOnly = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [{ kind: 'paragraph', text: { src: [[0, 1]] } }, ...structure.blocks.slice(2)],
      dropped: [],
    }),
  )
  assert.equal(segmentsOf({ structure: linesOnly, extraction }, true, 10, "Carmine's").header.size, 0)
  // A plain section heading right under the logo is content, not a tagline.
  const boxed = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        structure.blocks[0],
        { kind: 'heading', level: 2, text: { src: [[2, 2]] } },
        { kind: 'paragraph', text: { src: [[0, 1]] } },
        ...structure.blocks.slice(3),
      ],
      dropped: [],
    }),
  )
  assert.deepEqual([...segmentsOf({ structure: boxed, extraction }, true, 10, "Carmine's").header], [0])
})

test('narrow sections side by side form columns in print order; a full-width section is a row of its own', () => {
  // Two sections in a left column (x 0–45%), one in a right column (x 55–95%), then a wide section.
  const e = page([
    ['STARTERS', 20, 100, 16],
    ['Soup', 20, 130, 10],
    ['8', 240, 130, 10],
    ['MAINS', 20, 300, 16],
    ['Steak', 20, 330, 10],
    ['24', 240, 330, 10],
    ['SIDES', 340, 100, 16],
    ['Fries', 340, 130, 10],
    ['6', 560, 130, 10],
    ['NOTES', 20, 600, 16],
    ['Service', 20, 630, 10],
    ['included', 500, 630, 10],
  ])
  const section = (h: number, n: number, p: number) => [
    { kind: 'heading', level: 2, text: { src: [[h, h]] } },
    { kind: 'products', items: [{ name: { src: [[n, n]] }, prices: [{ src: [[p, p]] }] }] },
  ]
  const s = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        ...section(0, 1, 2),
        ...section(3, 4, 5),
        ...section(6, 7, 8),
        { kind: 'heading', level: 2, text: { src: [[9, 9]] } },
        { kind: 'paragraph', text: { src: [[10, 11]] } },
      ],
      dropped: [],
    }),
  )
  const bands = bandsOf({ structure: s, extraction: e }, new Set(), new Set())
  assert.deepEqual(
    bands.map((b) => b.columns),
    [
      [
        [0, 1, 2, 3],
        [4, 5],
      ],
    ],
  )
  const parts = s.blocks.map((_, at) => ({ at, html: `<b${String(at)}>` }))
  const layout = {
    header: new Set<number>(),
    tail: new Set<number>([7]),
    title: null,
    centered: false,
    logoShare: null,
    bands,
    shapes: new Map(),
    boxes: { pageFrame: null, boxes: [] },
    align: new Map(),
  }
  assert.deepEqual(assemble(parts, layout), [
    '<div class="cols cols-2">\n<div class="col">\n<b0>\n<b1>\n<b2>\n<b3>\n</div>\n<div class="col">\n<b4>\n<b5>\n</div>\n</div>',
    '<b6>',
    '<footer class="small-print">\n<b7>\n</footer>',
  ])
})

test('a narrow column beside lists that flow across the rest of the page is a side band', () => {
  const e = page([
    ['RAW BAR', 20, 100, 16],
    ['Mussels', 20, 130, 10],
    ['19', 150, 130, 10],
    ['APPETIZERS', 220, 100, 16],
    ['Crudo', 220, 130, 10],
    ['22', 580, 130, 10],
    ['ENTREES', 220, 400, 16],
    ['Steak', 220, 430, 10],
    ['48', 580, 430, 10],
  ])
  const section = (h: number, n: number, p: number) => [
    { kind: 'heading', level: 2, text: { src: [[h, h]] } },
    { kind: 'products', items: [{ name: { src: [[n, n]] }, prices: [{ src: [[p, p]] }] }] },
  ]
  const s = parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [...section(0, 1, 2), ...section(3, 4, 5), ...section(6, 7, 8)],
      dropped: [],
    }),
  )
  assert.deepEqual(bandsOf({ structure: s, extraction: e }, new Set(), new Set()), [
    {
      columns: [
        [0, 1],
        [2, 3, 4, 5],
      ],
      side: true,
    },
  ])
  // A list printed one dish per line is a row whatever its names and prices span (Moosewood's salads under a
  // narrow dressings note): no band forms around it.
  const wide = new Map([[1, { wide: true, runOn: true }]])
  assert.deepEqual(bandsOf({ structure: s, extraction: e }, new Set(), new Set(), wide), [])
})
