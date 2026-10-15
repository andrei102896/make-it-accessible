import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lineAt, printedFace, textLines } from './face.ts'
import { parseExtraction } from './types.ts'

test('a printed face: subset prefix dropped, weight from the name before <b>, italic from name or <i>', () => {
  assert.deepEqual(printedFace('PXAAAC+JosefinSans-SemiBold', true, false), {
    key: 'josefinsans',
    weight: 600,
    italic: false,
  })
  // pdftohtml strips "-Bold" from some names and marks the line with <b> instead.
  assert.deepEqual(printedFace('PXAAAE+StardosStencil', true, false), {
    key: 'stardosstencil',
    weight: 700,
    italic: false,
  })
  assert.deepEqual(printedFace('PXAAAB+Oswald', false, false), { key: 'oswald', weight: 400, italic: false })
  assert.deepEqual(printedFace('MyriadPro-BlackIt', false, false), { key: 'myriadpro', weight: 900, italic: true })
  assert.deepEqual(printedFace('HelveticaNeueLTStd-Bd', false, false), {
    key: 'helveticaneueltstd',
    weight: 700,
    italic: false,
  })
  assert.equal(printedFace('EBGaramond-Italic', false, false).key, 'ebgaramond')
  assert.equal(printedFace('Helvetica', false, true).italic, true)
  assert.deepEqual(printedFace('ABCDEF+Arial,BoldItalic', false, false), { key: 'arial', weight: 700, italic: true })
  assert.deepEqual(printedFace('OswaldLight', false, false), { key: 'oswald', weight: 300, italic: false })
  assert.deepEqual(printedFace('Roboto Light', false, false), { key: 'roboto', weight: 300, italic: false })
  assert.equal(printedFace('Helvetica-Narrow-Bold', false, false).key, 'helveticanarrow')
  assert.deepEqual(printedFace('Futura-CondensedMedium', false, false), {
    key: 'futuracondensed',
    weight: 500,
    italic: false,
  })
})

test('pdftohtml lines carry their fontspec colour and face; bold and italic from the line tags', () => {
  const xml = `<fontspec id="0" size="17" family="PXAAAB+Oswald" color="#000000"/>
<fontspec id="5" size="23" family="PXAAAE+StardosStencil" color="#DD2931"/>
<text top="5" left="346" width="150" height="23" font="0">KENDELLS BISTRO</text>
<text top="614" left="360" width="111" height="31" font="5"><b><i>POISSONS</i></b></text>`
  const [title, section] = textLines(xml)
  assert.deepEqual(title, {
    box: { x: 346, y: 5, w: 150, h: 23 },
    color: '#000000',
    font: { key: 'oswald', weight: 400, italic: false, size: 17 },
  })
  assert.ok(section)
  assert.deepEqual(section.font, { key: 'stardosstencil', weight: 700, italic: true, size: 23 })
  assert.equal(section.color, '#dd2931')
})

test('a word takes the smallest text line containing its centre, never the first one listed', () => {
  const page = { box: { x: 0, y: 0, w: 500, h: 40 }, id: 'wide' }
  const own = { box: { x: 100, y: 10, w: 80, h: 12 }, id: 'own' }
  assert.equal(lineAt([page, own], { x: 120, y: 12, w: 20, h: 8 })?.id, 'own')
  assert.equal(lineAt([page, own], { x: 600, y: 12, w: 20, h: 8 }), undefined)
})

test('a saved extraction without fonts still parses', () => {
  const saved = {
    pdfPage: 1,
    width: 10,
    height: 10,
    runs: [{ id: '1:0', str: 'a', box: { x: 0, y: 0, w: 1, h: 1 }, flow: 0, line: 0 }],
    images: [],
    duplicates: [],
  }
  assert.equal(parseExtraction(JSON.stringify(saved)).runs[0]?.font, undefined)
})
