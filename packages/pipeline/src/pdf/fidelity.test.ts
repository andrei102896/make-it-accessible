import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scorePage } from './fidelity.ts'
import { scoreOutside } from './fidelity-outside.ts'
import type { Image, LineInput } from './fidelity-types.ts'

// Pictures from rows: '.' paper, '#' black ink, 'g' grey, 'o' orange, 'R' a red ground, 'w' white ink on it.
const PIXEL: Record<string, [number, number, number]> = {
  '.': [255, 255, 255],
  '#': [0, 0, 0],
  g: [96, 96, 96],
  o: [206, 144, 86],
  R: [180, 20, 20],
  w: [255, 255, 255],
  f: [204, 204, 204],
}
const image = (rows: string[]): Image => {
  const width = rows[0]?.length ?? 0
  const data = new Uint8ClampedArray(width * rows.length * 4)
  rows.forEach((row, y) => {
    Array.from(row).forEach((ch, x) => {
      const [r, g, b] = PIXEL[ch] ?? [255, 255, 255]
      data.set([r, g, b, 255], (y * width + x) * 4)
    })
  })
  return { width, height: rows.length, data }
}
const paper = (w: number, h: number, ch = '.'): string[] => Array.from({ length: h }, () => ch.repeat(w))
// A stroke of `ch`, `len` wide and 2 tall, at (x, y) on a page of rows.
const stroke = (rows: string[], x: number, y: number, len: number, ch = '#'): string[] =>
  rows.map((row, i) => (i === y || i === y + 1 ? row.slice(0, x) + ch.repeat(len) + row.slice(x + len) : row))
const line = (box: LineInput['box'], text = 'word', extra: Partial<LineInput> = {}): LineInput => ({
  text,
  box,
  em: 10,
  ink: '#000000',
  wrapped: false,
  shadowed: false,
  effect: false,
  price: false,
  fit: { k: 1, lx: 0 },
  ...extra,
})
const score = (
  p: string[],
  s: string[],
  lines: LineInput[],
  kept: LineInput['box'][] = [],
  n: string[] | null = null,
) => {
  const input = {
    p: image(p),
    s: image(s),
    g: image(paper(p[0]?.length ?? 0, p.length)),
    n: n && image(n),
    lines,
    kept,
    cellPx: 8,
    ink: 0.15,
    pad: 0.25,
  }
  return { ...scorePage(input), ...scoreOutside(input) }
}

test('a line drawn twice in ours doubles its ink mass; the same line keeps the ratio near one', () => {
  const pdf = stroke(paper(40, 24), 8, 10, 20)
  const same = score(pdf, pdf, [line({ x: 6, y: 8, w: 24, h: 6 })])
  assert.equal(same.lines[0]?.mass.ours, same.lines[0]?.mass.pdf)
  const doubled = score(pdf, stroke(pdf, 8, 14, 20), [line({ x: 6, y: 8, w: 24, h: 6 })])
  const m = doubled.lines[0]?.mass
  assert.ok(m && m.ours / m.pdf > 1.7, JSON.stringify(m))
})

test('a grey band round the letters (a dark halo) adds mass and moves the colour; a gold word drawn black moves only the colour', () => {
  const pdf = stroke(paper(40, 24), 8, 10, 20, 'o')
  const haloed = stroke(stroke(stroke(pdf, 8, 8, 20, 'g'), 8, 12, 20, 'g'), 8, 10, 20, 'o')
  const gold = { ink: '#ce9056' }
  const halo = score(pdf, haloed, [line({ x: 6, y: 8, w: 24, h: 6 }, 'word', gold)]).lines[0]
  assert.ok(halo && halo.mass.ours / halo.mass.pdf > 1.5 && (halo.colour ?? 0) > 0.2, JSON.stringify(halo))
  const black = score(pdf, stroke(paper(40, 24), 8, 10, 20), [line({ x: 6, y: 8, w: 24, h: 6 })]).lines[0]
  assert.ok(
    black && Math.abs(black.mass.ours / black.mass.pdf - 1) < 0.2 && (black.colour ?? 0) > 0.5,
    JSON.stringify(black),
  )
})

test('a line narrower than printed shows in its span; a shifted one in its start; a wrapped block skips the span', () => {
  const pdf = stroke(paper(60, 24), 8, 10, 40)
  const narrow = score(pdf, stroke(paper(60, 24), 8, 10, 20), [line({ x: 8, y: 8, w: 40, h: 8 })]).lines[0]?.extent
  assert.ok(narrow?.ours && narrow.pdf)
  assert.ok((narrow.ours.end - narrow.ours.start) / (narrow.pdf.end - narrow.pdf.start) < 0.6)
  const shifted = score(pdf, stroke(paper(60, 24), 16, 10, 40), [line({ x: 8, y: 8, w: 40, h: 8 })]).lines[0]?.extent
  assert.ok(shifted?.ours && shifted.pdf && shifted.ours.start - shifted.pdf.start >= 0.9)
  const wrapped = score(pdf, pdf, [line({ x: 8, y: 8, w: 40, h: 8 }, 'block', { wrapped: true })]).lines[0]
  assert.equal(wrapped?.extent, null)
})

test('ink the PDF has outside every line and we lack is counted per cell; a cell under a word left printed is not', () => {
  // The missing stroke sits inside one 8 px cell, its one-pixel dilation included.
  const pdf = stroke(stroke(paper(48, 32), 4, 4, 8), 33, 20, 6)
  const ours = stroke(paper(48, 32), 4, 4, 8)
  const missing = score(pdf, ours, [], []).outside
  assert.equal(missing.pdfOnly, 1)
  assert.equal(missing.oursOnly, 0)
  const keptOver = score(pdf, ours, [], [{ x: 32, y: 16, w: 16, h: 8 }]).outside
  assert.equal(keptOver.pdfOnly, 0)
})

test('white letters on a red ground are ink in the light direction', () => {
  const red = paper(40, 24, 'R')
  const pdf = stroke(red, 8, 10, 20, 'w')
  const input = {
    p: image(pdf),
    s: image(pdf),
    g: image(red),
    lines: [line({ x: 6, y: 8, w: 24, h: 6 }, 'w', { ink: '#ffffff' })],
    kept: [],
    cellPx: 8,
    ink: 0.15,
    pad: 0.25,
  }
  const out = scorePage({ ...input, n: null })
  assert.ok((out.lines[0]?.mass.pdf ?? 0) > 0 && out.lines[0]?.mass.ours === out.lines[0]?.mass.pdf)
})

test('gold on paper is ink, and so is a dark glow round white letters on a light ground', () => {
  const pdf = stroke(paper(40, 24), 8, 10, 20, 'o')
  const gold = score(pdf, pdf, [line({ x: 6, y: 8, w: 24, h: 6 }, 'word', { ink: '#ce9056' })]).lines[0]
  assert.ok((gold?.mass.pdf ?? 0) > 0 && gold?.mass.ours === gold?.mass.pdf)
  const tan = paper(40, 24, 'o')
  const white = stroke(tan, 8, 10, 20, 'w')
  const glow = stroke(stroke(stroke(tan, 8, 8, 20), 8, 12, 20), 8, 10, 20, 'w')
  const out = scorePage({
    n: null,
    ...{ p: image(white), s: image(glow), g: image(tan), kept: [], cellPx: 8, ink: 0.15, pad: 0.25 },
    lines: [line({ x: 6, y: 8, w: 24, h: 6 }, 'w', { ink: '#ffffff' })],
  }).lines[0]
  assert.ok(out && out.mass.ours / out.mass.pdf > 1.5, JSON.stringify(out?.mass))
})

test("a line on a panel our backdrop lacks is measured against the PDF's own ground", () => {
  const pdf = stroke(paper(40, 24, 'o'), 8, 10, 20)
  const ours = stroke(paper(40, 24), 8, 10, 20)
  const out = score(pdf, ours, [line({ x: 6, y: 8, w: 24, h: 6 })]).lines[0]
  assert.ok(out && out.rim > 0.15, JSON.stringify(out))
  assert.ok(out.mass.pdf > 0 && Math.abs(out.mass.ours / out.mass.pdf - 1) < 0.2, JSON.stringify(out.mass))
})

test('cells the PDF draws and we lack are grouped when they touch: a dotted side is one group, stray marks are not', () => {
  const dotted = stroke(paper(48, 32), 9, 20, 22)
  const stray = stroke(stroke(paper(48, 32), 1, 4, 5), 33, 20, 5)
  assert.equal(score(dotted, paper(48, 32), []).outside.cluster, 3)
  assert.equal(score(stray, paper(48, 32), []).outside.cluster, 1)
})

test('a rule just above or below a line stays out of its own rows', () => {
  const pdf = stroke(stroke(paper(40, 32), 8, 16, 20), 4, 9, 32, 'g')
  const out = score(pdf, stroke(paper(40, 32), 8, 16, 20), [line({ x: 6, y: 12, w: 24, h: 12 })]).lines[0]
  assert.ok(out && out.mass.pdf > out.mass.ours && out.core.pdf === out.core.ours, JSON.stringify(out))
})

test('an effect inking past the print is excess; a shadow the print has, or one drifting with our letters, is not', () => {
  const box = { x: 6, y: 8, w: 28, h: 8 }
  const letters = stroke(paper(48, 24), 8, 10, 20)
  const fx = [line(box, 'word', { effect: true, shadowed: true })]
  // A copy 4 px down, where the print is blank.
  const copy = score(letters, stroke(letters, 8, 13, 20), fx, [], letters).lines[0]
  assert.ok((copy?.excess ?? 0) > 0.5 && (copy?.effect ?? 0) < 0, JSON.stringify(copy))
  // The print draws the same shadow: nothing in excess.
  const shadowed = stroke(letters, 8, 13, 20)
  const real = score(shadowed, shadowed, fx, [], letters).lines[0]
  assert.ok((real?.excess ?? 1) < 0.1 && (real?.effect ?? -1) > 0, JSON.stringify(real))
  // Our letters and their shadow both 3 px right of the print's: the drift is the letters', not the effect's.
  const ours = stroke(stroke(paper(48, 24), 11, 10, 20), 11, 13, 20)
  const drift = score(shadowed, ours, fx, [], stroke(paper(48, 24), 11, 10, 20)).lines[0]
  assert.ok((drift?.excess ?? 1) < 0.1, JSON.stringify(drift))
})

test('a halo in the ground colour on a grey ground adds nothing; ink at a fifth of its strength reads faint', () => {
  const grey = paper(48, 24, 'g')
  const pdf = stroke(grey, 8, 10, 20, 'w')
  const halo = stroke(stroke(stroke(grey, 8, 8, 20, 'g'), 8, 12, 20, 'g'), 8, 10, 20, 'w')
  const input = {
    p: image(pdf),
    s: image(halo),
    g: image(grey),
    n: image(pdf),
    kept: [],
    cellPx: 8,
    ink: 0.15,
    pad: 0.25,
  }
  const lines = [line({ x: 6, y: 8, w: 24, h: 6 }, 'w', { ink: '#ffffff', effect: true })]
  assert.equal(scorePage({ ...input, lines }).lines[0]?.excess, 0)
  // 20 % black on white: luminance 0.6 against the print's 0, a contrast near 0.4.
  const faint = score(stroke(paper(40, 24), 8, 10, 20), stroke(paper(40, 24), 8, 10, 20, 'f'), [
    line({ x: 6, y: 8, w: 24, h: 6 }),
  ])
  const c = faint.lines[0]?.contrast ?? 1
  assert.ok(c > 0.3 && c < 0.5, String(c))
})

test("a narrow line's padding inside a neighbour's box is the neighbour's for its own ink (Waterloo dinner's \"(\")", () => {
  // "day" ends at the bracket's left in the PDF; ours sets "day" 5 px further left. The bracket is one stroke.
  const bracket = { x: 23, y: 4, w: 2, h: 16 }
  const day = { x: 4, y: 4, w: 19, h: 16 }
  const word = (rows: string[], x: number): string[] => stroke(stroke(rows, x, 11, 14), x, 13, 14)
  const pdf = stroke(word(paper(40, 24), 9), 23, 11, 1)
  const ours = stroke(word(paper(40, 24), 4), 23, 11, 1)
  const [, b] = score(pdf, ours, [line(day, 'day'), line(bracket, '(')]).lines
  assert.ok(b && b.core.ours >= b.core.pdf * 0.5, JSON.stringify(b?.core))
  // Its own ink gone is still none; the window's mass still counts the neighbour's.
  const gone = score(pdf, word(paper(40, 24), 4), [line(day, 'day'), line(bracket, '(')]).lines[1]
  assert.equal(gone?.core.ours, 0)
  assert.ok(b.mass.pdf > b.core.pdf)
})
