import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage, type TextValue } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { inkedHtml, inkSegments, lineParts } from './segments.ts'
import { placedRuns, visibleText } from './source.ts'

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

test("an icon's words are tagged in both views, the tag carrying the drawing's place and width (Howies' gluten free)", () => {
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
      ['gluten free', { x: 29.857, w: 1.271 }],
      [' available)', null],
    ],
  )
  assert.equal(
    inkedHtml(segments, new Set(), (s) => s),
    '( <span class="diet icon" style="--iw:1.271;--ix:29.857"><span>gluten free</span></span> available)',
  )
})

test("words in a face that draws capitals for lowercase show in capitals, as printed (Howies' Lulo Clean 'dinner menu')", () => {
  const font = { key: 'lulocleanw01', size: 30, weight: 700, italic: false }
  const runs: Run[] = ['dinner', 'menu'].map((str, i) => ({
    id: `1:${String(i)}`,
    str,
    box: { x: i * 40, y: 0, w: 38, h: 30 },
    flow: 0,
    line: 0,
    font,
  }))
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const t: TextValue = { src: [[0, 1]], text: 'DINNER MENU' }
  assert.equal(visibleText(t, e), 'dinner menu')
  assert.equal(visibleText(t, e, false, new Set(['lulocleanw01:700:false'])), 'DINNER MENU')
  assert.equal(visibleText(t, e, false, new Set(['other:400:false'])), 'dinner menu')
})

test("the model's text shows only where the validator accepts it: a rejected text shows the cited words", () => {
  const runs: Run[] = [
    { id: '1:0', str: 'Truf', box: { x: 0, y: 0, w: 20, h: 10 }, flow: 0, line: 0 },
    { id: '1:1', str: 'e', box: { x: 26, y: 0, w: 5, h: 10 }, flow: 0, line: 0 },
  ]
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const text = (t: string): TextValue => ({ src: [[0, 1]], text: t })
  assert.equal(visibleText(text('Truffle'), e), 'Truffle')
  assert.equal(visibleText(text('Lobster'), e), 'Truf e')
})

test('a separator the model dropped from the printed words shows as printed, never in a small-caps role', () => {
  const runs: Run[] = [
    { id: '1:0', str: 'NEWBARNS', box: { x: 0, y: 0, w: 60, h: 10 }, flow: 0, line: 0 },
    { id: '1:1', str: 'STOUT,', box: { x: 64, y: 0, w: 40, h: 10 }, flow: 0, line: 0 },
  ]
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const text = (t: string): TextValue => ({ src: [[0, 1]], text: t })
  assert.equal(visibleText(text('NEWBARNS STOUT'), e), 'NEWBARNS STOUT,')
  assert.equal(visibleText(text('NEWBARNS STOUT'), e, true), 'NEWBARNS STOUT')
  assert.equal(visibleText(text('Newbarns Stout'), e), 'Newbarns Stout')
})

test('a text is cut where its cited words are printed apart on one line, never between neighbouring words', () => {
  const font = { key: 'brandon', size: 10, weight: 400, italic: false }
  const run = (id: string, str: string, x: number, w: number): Run => ({
    id,
    str,
    box: { x, y: 100, w, h: 12 },
    flow: 0,
    line: 4,
    font,
  })
  const e: Extraction = {
    pdfPage: 1,
    width: 600,
    height: 800,
    // "+ 5.95 supplement if part of offer": the label cites "+" and its words round the amount.
    runs: [
      run('1:0', '+', 100, 5),
      run('1:1', '5.95', 108, 18),
      run('1:2', 'supplement', 130, 45),
      run('1:3', 'if', 178, 6),
    ],
    images: [],
    duplicates: [],
    hidden: [],
  }
  const label: TextValue = {
    src: [
      [0, 0],
      [2, 3],
    ],
  }
  const parts = lineParts(label, e, '+ supplement if') ?? []
  assert.deepEqual(
    parts.map((p) => ('runs' in p ? p.text : `[${p.gap}]`)),
    ['+', '[ ]', 'supplement if'],
  )
  // Words a space apart stay one piece: nothing to cut.
  assert.equal(lineParts({ src: [[2, 3]] }, e, 'supplement if'), null)
})

test("only the words in another face than their placed element's are wrapped with it", () => {
  const run = (id: string, weight: number): Run => ({
    id,
    str: '',
    box: { x: 0, y: 0, w: 1, h: 1 },
    flow: 0,
    line: 0,
    font: { key: 'gotham', size: 9, weight, italic: false },
  })
  const [bold, plain] = [run('1:0', 700), run('1:1', 400)]
  const segments = [
    { text: 'GAELIC ', color: null, icon: null, run: bold },
    { text: '(Monkey Shoulder)', color: null, icon: null, run: plain },
  ]
  const face = (r: Run): string | null => (r === bold ? '--fw:700' : null)
  assert.equal(
    inkedHtml(segments, new Set(), (s) => s, face),
    '<span class="face" style="--fw:700">GAELIC </span>(Monkey Shoulder)',
  )
  // Without a placed element (no printed view), the text is as before.
  assert.equal(
    inkedHtml(segments, new Set(), (s) => s),
    'GAELIC (Monkey Shoulder)',
  )
})
