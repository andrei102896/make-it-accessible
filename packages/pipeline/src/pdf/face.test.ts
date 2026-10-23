import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bodySize, classOf, lineAt, printedFace, segmentFonts, textLines } from './face.ts'
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
  // Short forms of width and weight (Lexington's Franklin Gothic, Kenny & Ziggy's Kabel).
  assert.deepEqual(printedFace('FranklinGothicLTPro-CnBk', false, false), {
    key: 'franklingothicltprocondensed',
    weight: 400,
    italic: false,
  })
  assert.deepEqual(printedFace('ITCFranklinGothicStd-DmCd', false, false), {
    key: 'itcfranklingothicstdcondensed',
    weight: 600,
    italic: false,
  })
  assert.equal(printedFace('ITCKabelStd-Demi', false, false).weight, 600)
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

test("a line in two styles keeps each piece's face: Le Dive's bold name and italic price, nested and untagged pieces", () => {
  const xml = `<fontspec id="1" size="12" family="MZBFIU+Louize" color="#661721"/>
<text top="104" left="104" width="101" height="16" font="1"><b>Radishes &amp; Butter </b><i>9</i><b> </b></text>
<text top="116" left="118" width="70" height="16" font="1">warm baguette</text>
<text top="130" left="10" width="70" height="16" font="1"><i><b>Val</b> Non-Dosé</i> NV</text>
<text top="140" left="238" width="39" height="16" font="1">16 / 64<b> </b></text>
<text top="150" left="10" width="70" height="16" font="1"><a href="x">Caf&#233; </a><i>&#x2014; Gelato&#9999999;</i></text>`
  const [name, desc, wine, price, link] = textLines(xml)
  const face = (weight: number, italic: boolean): unknown => ({ key: 'louize', weight, italic, size: 12 })
  assert.deepEqual(price?.font, face(400, false))
  // A link's words kept, entities decoded, one out of range left as written (PDF bytes are untrusted).
  assert.deepEqual(
    link?.segments?.map((s) => s.text),
    ['Café ', '— Gelato&#9999999;'],
  )
  // The line's face is most of its letters' (a tag round a space alone counts for nothing); pieces where styles differ.
  assert.deepEqual(name?.font, face(700, false))
  assert.deepEqual(wine?.font, face(400, true))
  assert.deepEqual(name?.segments, [
    { text: 'Radishes & Butter ', font: face(700, false) },
    { text: '9', font: face(400, true) },
  ])
  assert.equal(desc?.segments, undefined)
  assert.deepEqual(
    wine?.segments?.map((s) => [s.text, s.font.weight, s.font.italic]),
    [
      ['Val', 700, true],
      [' Non-Dosé', 400, true],
      [' NV', 400, false],
    ],
  )
  assert.ok(name.font && name.segments)
  const words = ['Radishes', '&', 'Butter', '9'].map((str) => ({ str }))
  assert.deepEqual(
    segmentFonts({ font: name.font, segments: name.segments }, words)?.map((f) => f.italic),
    [false, false, false, true],
  )
  // Letters that are not the line's (a word another line took): every word keeps the line's face.
  assert.equal(segmentFonts({ font: name.font, segments: name.segments }, words.slice(1)), null)
})

test('a word printed across two pieces takes the face holding most of its letters, the first on a tie', () => {
  const font = (italic: boolean) => ({ key: 'f', weight: 400, italic, size: 10 })
  const segments = [
    { text: 'ab', font: font(false) },
    { text: 'cdef', font: font(true) },
    { text: 'g', font: font(false) },
  ]
  const fonts = segmentFonts({ font: font(true), segments }, [{ str: 'abc' }, { str: 'defg' }])
  assert.deepEqual(
    fonts?.map((f) => f.italic),
    [false, true],
  )
  assert.equal(segmentFonts({ font: font(true), segments }, [{ str: 'abcd' }, { str: 'efg' }])?.[0]?.italic, false)
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

test("a brush script embedded as Type 1C is a script face: kept as printed when no face stands in (Claudio's Haystack)", () => {
  assert.equal(classOf('haystack'), 'script')
  assert.equal(classOf('haystackregular'), 'script')
})

test("a page's body size is the printed size half its letters are at or under; a page without sized runs has none", () => {
  const at = (
    str: string,
    size: number,
  ): { str: string; font: { key: string; size: number; weight: number; italic: boolean } } => ({
    str,
    font: { key: 'kabel', size, weight: 400, italic: false },
  })
  assert.equal(
    bodySize([at('DESSERTS', 24), at('pink strawberry cake', 11), at('red velvet cake', 11), at('12.95', 11)]),
    11,
  )
  assert.equal(bodySize([{ str: 'x' }]), 0)
})
