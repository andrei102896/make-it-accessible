import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Swatch } from '../html/theme.ts'
import { classOf } from '../pdf/fonts.ts'
import { parseBrief } from './brief.ts'

const SWATCHES: Swatch[] = [
  { hex: '#282848', role: 'background', share: 0.9 },
  { hex: '#f8f8f8', role: 'text', share: 0.2 },
]
const answer = (extra: Record<string, unknown>): string =>
  `Here it is: ${JSON.stringify({ type: 'menu', title: 'The Carew Inn · Evening Menu', band: 0, accent: 1, headings: 'humanist', validity: null, ...extra })}`

test('a brief points only at measured swatches and quotes only printed dates', () => {
  assert.deepEqual(parseBrief(answer({}), SWATCHES, ''), {
    type: 'menu',
    title: 'The Carew Inn · Evening Menu',
    band: 0,
    accent: 1,
    headings: 'humanist',
    validity: null,
  })
  assert.equal(parseBrief(answer({ band: 7 }), SWATCHES, '').band, null)
  assert.equal(
    parseBrief(answer({ validity: 'Valid 8–14 Oct' }), SWATCHES, 'offers valid 8–14  oct').validity,
    'Valid 8–14 Oct',
  )
  assert.equal(parseBrief(answer({ validity: 'Valid all year' }), SWATCHES, 'offers valid 8–14 oct').validity, null)
  assert.throws(() => parseBrief(answer({ type: 'poster' }), SWATCHES, ''))
  assert.throws(() => parseBrief(answer({ css: 'body{}' }), SWATCHES, ''))
})

test('font names map to a heading class, subset prefix and style ignored', () => {
  assert.equal(classOf('NNMDLF+GillSans-SemiBoldItalic'), 'humanist')
  assert.equal(classOf('ABCDEF+Gotham-Bold'), 'geometric')
  assert.equal(classOf('Times-Roman'), 'transitional')
  assert.equal(classOf('XYZABC+DINPro-CondBold'), 'condensed')
  assert.equal(classOf('XYZABC+CenturyGothic'), 'geometric')
  assert.equal(classOf('XYZABC+Unknown'), null)
})
