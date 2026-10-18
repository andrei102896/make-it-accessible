import assert from 'node:assert/strict'
import { test } from 'node:test'
import { printedFace } from '../pdf/face.ts'
import { covers, ownFaceIn, printFaceOf, printFaces, withoutOwnFace } from './printface.ts'
import type { FontManifest } from './webfonts.ts'

const family = (key: string, weight = '100 900', category: 'text' | 'display' = 'text'): FontManifest => ({
  family: key,
  key,
  license: 'OFL',
  copyright: `© ${key}`,
  category,
  files: [{ file: `${key}-normal.woff2`, style: 'normal', weight, unicodeRange: 'U+0000-00FF' }],
})
const library = ['jost', 'lato', 'arimo', 'robotocondensed', 'robotoslab', 'montserrat'].map((k) => family(k))
library.push(family('yellowtail', '400', 'display'))
const face = (name: string, size = 12): ReturnType<typeof printFaceOf> =>
  printFaceOf({ ...printedFace(name, false, false), size }, library)

test("each printed family takes its lookalike or its class's stand-in; a family not told takes none (the role's face)", () => {
  assert.equal(face('CenturyGothic')?.family, "'print-jost', sans-serif")
  assert.equal(face('ITCKabelStd-Demi')?.family, "'print-jost', sans-serif")
  // Goudy Sans is a sans (not Goudy Old Style); SignPainter a brush script (not "Inter").
  assert.equal(face('GoudySansLT-Book')?.family, "'print-lato', sans-serif")
  assert.equal(face('SignPainter-HouseScript')?.family, "'print-yellowtail', cursive")
  assert.equal(face('FranklinGothicLTPro-CnBk')?.family, "'print-robotocondensed', sans-serif")
  assert.equal(face('ClarendonLTStd-Light')?.family, "'print-robotoslab', serif")
  assert.equal(face('Verlag-Black')?.weight, 900)
  assert.equal(face('Times-Roman')?.family, "'Times New Roman', Times, serif")
  assert.equal(face('FeelingPassionate-Regular'), null)
})

test('a face draws only the weights its file has; the files sit beside the page and load when used', () => {
  assert.equal(face('BrushScriptMT-Italic')?.weight, 400)
  const runs = [{ id: '1:0', str: 'Hi', box: { x: 0, y: 0, w: 9, h: 9 }, flow: 0, line: 0 }]
  const font = { ...printedFace('CenturyGothic', false, false), size: 12 }
  const e = {
    pdfPage: 1,
    width: 9,
    height: 9,
    runs: runs.map((r) => ({ ...r, font })),
    images: [],
    duplicates: [],
    hidden: [],
  }
  const css = printFaces([{ extraction: e, backdrop: { grid: { fonts: {} } } }, { extraction: e }], library)
  assert.equal(css.match(/@font-face/g)?.length, 1)
  assert.match(css, /font-family: "print-jost";.*font-display: block; src: url\(fonts\/jost-normal\.woff2\)/)
  assert.equal(printFaces([{ extraction: e }], library), '')
})

test("the PDF's own faces are declared for every weight and style, their notice unable to close the style", () => {
  const e = { pdfPage: 1, width: 9, height: 9, runs: [], images: [], duplicates: [], hidden: [] }
  const fonts = { 'pdf-0123456789ab': { range: 'U+41-5A', notice: 'Copyright */ </style><script>' } }
  const css = printFaces([{ extraction: e, backdrop: { grid: { fonts } } }], library)
  assert.match(css, /font-family: "pdf-0123456789ab"; font-weight: 1 1000; font-style: normal; font-display: block;/)
  assert.match(css, /src: url\(fonts\/pdf-0123456789ab\.otf\) format\("opentype"\); unicode-range: U\+41-5A;/)
  assert.doesNotMatch(css, /<\/style>|Copyright \*\//)
})

test("a line keeps the PDF's own face only where its range holds every letter shown; dropping it leaves the stand-in", () => {
  assert.equal(covers('U+41-5A, U+61', 'AB a'), true)
  assert.equal(covers('U+41-5A, U+61', 'Ab'), false)
  assert.equal(ownFaceIn(" 'pdf-0123456789ab', 'print-jost', sans-serif"), 'pdf-0123456789ab')
  assert.equal(ownFaceIn("'print-jost', sans-serif"), null)
  assert.equal(
    withoutOwnFace("--fi:normal;--ff:'pdf-0123456789ab', 'print-jost', sans-serif;--ls:0"),
    "--fi:normal;--ff:'print-jost', sans-serif;--ls:0",
  )
  assert.equal(withoutOwnFace(`--fi:normal;--ff:'pdf-0123456789ab';--ls:0"`), '--fi:normal;--ls:0"')
})
