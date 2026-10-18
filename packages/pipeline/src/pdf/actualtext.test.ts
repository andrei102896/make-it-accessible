import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actualTextsOf } from './actualtext.ts'

const span = (text: string, before = ''): string =>
  `/Span << /ActualText ${text} >> BDC ${before}q 1 0 0 1 68.58994 730.602\ncm BT 17 0 0 17 61.39258 0 Tm /TT3 1 Tf (*) Tj ET Q EMC`

test("a ligature's replacement text sits at its glyph's origin, cm and Tm composed (Gigi's festive)", () => {
  assert.deepEqual(actualTextsOf(`BT (fes) Tj ET ${span('(ti)')} q BT (ve) Tj ET Q`), [
    { text: 'ti', x: 68.58994 + 61.39258, y: 730.602, size: 17, copyX: 61.39258 },
  ])
  assert.deepEqual(
    actualTextsOf(span('(tt)', '0.2 0.1 0.1 sc ')).map((a) => a.text),
    ['tt'],
  )
})

test('hex UTF-16 and escaped literals are decoded; tabs and spans inside a running text block are left out', () => {
  assert.deepEqual(
    actualTextsOf(span('<FEFF00660069>') + span(String.raw`(\050x\051)`)).map((a) => a.text),
    ['fi', '(x)'],
  )
  assert.deepEqual(actualTextsOf(span('( )') + span(String.raw`(\t)`)), [])
  assert.deepEqual(actualTextsOf('BT /T1_0 1 Tf /Span << /ActualText (er) >> BDC 3 0 Td (e)Tj EMC ET'), [])
})
