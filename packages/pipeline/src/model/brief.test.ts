import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Swatch } from '../html/theme.ts'
import { classOf } from '../pdf/face.ts'
import { parseBrief } from './brief.ts'

const SWATCHES: Swatch[] = [
  { hex: '#282848', role: 'background', share: 0.9 },
  { hex: '#f8f8f8', role: 'text', share: 0.2 },
]
const answer = (extra: Record<string, unknown>): string =>
  `Here it is: ${JSON.stringify({ type: 'menu', title: 'The Carew Inn · Evening Menu', band: 0, accent: 1, headings: 'humanist', validity: null, ...extra })}`

test('a brief points only at measured swatches and quotes only printed dates', () => {
  assert.deepEqual(parseBrief(answer({}), SWATCHES, '', 2), {
    type: 'menu',
    title: 'The Carew Inn · Evening Menu',
    band: 0,
    accent: 1,
    headings: 'humanist',
    validity: null,
    details: [],
    logo: null,
  })
  assert.equal(parseBrief(answer({ band: 7 }), SWATCHES, '', 2).band, null)
  assert.equal(
    parseBrief(answer({ validity: 'Valid 8–14 Oct' }), SWATCHES, 'offers valid 8–14  oct', 2).validity,
    'Valid 8–14 Oct',
  )
  assert.equal(parseBrief(answer({ validity: 'Valid all year' }), SWATCHES, 'offers valid 8–14 oct', 2).validity, null)
  assert.throws(() => parseBrief(answer({ type: 'poster' }), SWATCHES, '', 2))
  assert.throws(() => parseBrief(answer({ css: 'body{}' }), SWATCHES, '', 2))
})

test('design details keep only printed words, at most 8, and an unknown kind is "other"', () => {
  const page = 'KENDELLS BISTRO Homemade bread with butter 4.90'
  const details = [
    { kind: 'ornament', near: 'Kendells Bistro' },
    { kind: 'frame', near: 'Homemade bread with butter' },
    { kind: 'icon', near: 'Vegan dishes' },
    { kind: 'box', near: 'x'.repeat(81) },
    ...Array.from({ length: 9 }, () => ({ kind: 'panel', near: 'BISTRO' })),
  ]
  const parsed = parseBrief(answer({ details }), SWATCHES, page, 2).details ?? []
  assert.deepEqual(parsed.slice(0, 2), [
    { kind: 'ornament', near: 'Kendells Bistro' },
    { kind: 'other', near: 'Homemade bread with butter' },
  ])
  assert.equal(parsed.length, 8)
  assert.equal(parseBrief(answer({}), SWATCHES, page, 2).details?.length, 0)
  assert.deepEqual(parseBrief(answer({ details: 'a curl under the title' }), SWATCHES, page, 2).details, [])
})

test('font names map to a heading class, subset prefix and style ignored', () => {
  assert.equal(classOf('NNMDLF+GillSans-SemiBoldItalic'), 'humanist')
  assert.equal(classOf('ABCDEF+Gotham-Bold'), 'geometric')
  assert.equal(classOf('Times-Roman'), 'transitional')
  assert.equal(classOf('XYZABC+DINPro-CondBold'), 'condensed')
  assert.equal(classOf('XYZABC+CenturyGothic'), 'geometric')
  assert.equal(classOf('XYZABC+Unknown'), null)
})

test("the logo is a page the brief saw and a box on it; anything else is no logo (La Segunda's mid-spread logo)", () => {
  const logo = { page: 1, box: [0.75, 0.73, 0.16, 0.11] }
  assert.deepEqual(parseBrief(answer({ logo }), SWATCHES, '', 2).logo, logo)
  assert.equal(parseBrief(answer({ logo: { page: 3, box: [0.1, 0.1, 0.2, 0.1] } }), SWATCHES, '', 2).logo, null)
  assert.equal(parseBrief(answer({ logo: { page: 1, box: [0.9, 0.1, 0.2, 0.1] } }), SWATCHES, '', 2).logo, null)
  assert.equal(parseBrief(answer({ logo: 'top left' }), SWATCHES, '', 2).logo, null)
  assert.equal(parseBrief(answer({ logo: null }), SWATCHES, '', 2).logo, null)
})
