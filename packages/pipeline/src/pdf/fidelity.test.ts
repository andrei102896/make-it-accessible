import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scorePage, type Image, type LineInput } from './fidelity.ts'

// Pictures from rows: '.' paper, '#' black ink, 'g' grey, 'o' orange, 'R' a red ground, 'w' white ink on it.
const PIXEL: Record<string, [number, number, number]> = {
  '.': [255, 255, 255],
  '#': [0, 0, 0],
  g: [96, 96, 96],
  o: [206, 144, 86],
  R: [180, 20, 20],
  w: [255, 255, 255],
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
  wrapped: false,
  dark: true,
  shadowed: false,
  fit: { k: 1, lx: 0 },
  ...extra,
})
const score = (p: string[], s: string[], lines: LineInput[], kept: LineInput['box'][] = []) =>
  scorePage({
    p: image(p),
    s: image(s),
    g: image(paper(p[0]?.length ?? 0, p.length)),
    lines,
    kept,
    cellPx: 8,
    ink: 0.15,
    pad: 0.25,
  })

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
  const halo = score(pdf, haloed, [line({ x: 6, y: 8, w: 24, h: 6 })]).lines[0]
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
    lines: [line({ x: 6, y: 8, w: 24, h: 6 }, 'w', { dark: false })],
    kept: [],
    cellPx: 8,
    ink: 0.15,
    pad: 0.25,
  }
  const out = scorePage(input)
  assert.ok((out.lines[0]?.mass.pdf ?? 0) > 0 && out.lines[0]?.mass.ours === out.lines[0]?.mass.pdf)
})
