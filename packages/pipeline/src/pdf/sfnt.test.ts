import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webFont } from './ownfont.ts'
import type { PdfFont } from './pdfjs.ts'
import { caseFilled } from './ownfont.ts'
import { cmapOf, isSfnt, permitsEmbedding, tablesOf, withCmap } from './sfnt.ts'

// A TrueType program holding a head table (its magic number in place) and maxp (8 glyphs).
function bare(): Uint8Array {
  const out = new Uint8Array(12 + 32 + 56 + 8)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x00010000)
  v.setUint16(4, 2)
  const record = (at: number, tag: string, offset: number, length: number): void => {
    out.set(
      Array.from(tag, (c) => c.charCodeAt(0)),
      at,
    )
    v.setUint32(at + 8, offset)
    v.setUint32(at + 12, length)
  }
  record(12, 'head', 44, 54)
  record(28, 'maxp', 100, 6)
  v.setUint32(44 + 12, 0x5f0f3cf5)
  v.setUint32(100, 0x00005000)
  v.setUint16(104, 8)
  return out
}
const sum = (d: Uint8Array): number => {
  let s = 0
  for (let i = 0; i < d.length; i += 4) s = (s + new DataView(d.buffer, d.byteOffset).getUint32(i)) >>> 0
  return s
}

test('a rewritten character map reads back, its tables sorted and the whole font summing to the head magic', () => {
  const font = withCmap(
    bare(),
    new Map([
      [0x41, 1],
      [0x42, 2],
      [0xe000, 7],
    ]),
  )
  assert.ok(font && isSfnt(font))
  assert.deepEqual(
    tablesOf(font).map((t) => t.tag),
    ['cmap', 'head', 'maxp'],
  )
  assert.deepEqual(
    [...cmapOf(font)],
    [
      [0x41, 1],
      [0x42, 2],
      [0xe000, 7],
    ],
  )
  assert.equal(sum(font), 0xb1b0afba)
})

test('embedding is permitted when installable or editable, never restricted, preview-only or bitmap-only', () => {
  assert.deepEqual([0, 0x0008, 0x0002, 0x0004, 0x0208, 0x000a, null].map(permitsEmbedding), [
    true,
    true,
    false,
    false,
    false,
    false,
    false,
  ])
})

test("a PDF font's web font maps each one-letter ToUnicode to the glyph pdf.js draws for its code; a ligature, a code pdf.js does not draw, or a letter drawn two ways the page never uses is left out", () => {
  // pdf.js' program: its codes 0xE000–0xE002 draw A, h and the "Th" ligature; 0xE003 (B) is not in it; 0xE004 and
  // 0xE005 both draw "1" (two figure styles), 0xE006 and 0xE007 both draw "2"; 0xE008 names glyph 9, past maxp's 8.
  const data = withCmap(
    bare(),
    new Map([
      [0xe000, 1],
      [0xe001, 2],
      [0xe002, 3],
      [0xe004, 4],
      [0xe005, 5],
      [0xe006, 6],
      [0xe007, 7],
      [0xe008, 9],
    ]),
  )
  assert.ok(data)
  const map: (string | undefined)[] = [undefined, 'A', 'h', 'Th', 'B', '1', '1', '2', '2', 'C']
  const toFontChar = [undefined, 0xe000, 0xe001, 0xe002, 0xe003, 0xe004, 0xe005, 0xe006, 0xe007, 0xe008]
  const font: PdfFont = {
    loadedName: 'f1',
    isType3Font: false,
    defaultWidth: 0,
    widths: [],
    toUnicode: { _map: map },
    data,
    toFontChar,
  }
  // The page draws "1" with its second code; "2" never.
  const web = webFont(font, new Map([['1', 0xe005]]))
  assert.ok(web)
  assert.deepEqual(
    [...cmapOf(web.data)],
    [
      [0x31, 5],
      [0x41, 1],
      [0x68, 2],
    ],
  )
  assert.equal(web.range, 'U+31, U+41, U+68')
  assert.equal(webFont({ ...font, missingFile: true }, new Map()), null)
})

test("a face drawing capitals for lowercase answers to both cases: each letter's other case maps to the same glyph (Howies' Lulo)", () => {
  const data = withCmap(
    bare(),
    new Map([
      [0x74, 1],
      [0x57, 2],
      [0x31, 3],
    ]),
  )
  assert.ok(data)
  const filled = caseFilled(data)
  assert.ok(filled)
  assert.deepEqual(
    [...cmapOf(filled.data)].sort((a, b) => a[0] - b[0]),
    [
      [0x31, 3],
      [0x54, 1],
      [0x57, 2],
      [0x74, 1],
      [0x77, 2],
    ],
  )
  assert.equal(filled.range, 'U+31, U+54, U+57, U+74, U+77')
})
