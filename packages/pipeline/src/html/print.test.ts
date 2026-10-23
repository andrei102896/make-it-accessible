import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backdropScale, printCss, printFloor, printFloorIn, printWidthIn } from './print.ts'

test('a large sheet prints from the window where its body text reads at 7 px, never below a tablet', () => {
  // La Segunda: 12 px body text needs 2030 px; 7 px is reached at 1998 × 7 / 12 + 32.
  assert.equal(printFloor(2030), 1198)
  assert.equal(printFloor(1688), 998)
  assert.equal(printFloor(1100), 800)
})

test('the rendered page carries both widths: fitting and checks read them back', () => {
  const css = printCss(2030)
  assert.equal(printWidthIn(css), 2030)
  assert.equal(printFloorIn(css), 1198)
  assert.equal(printWidthIn('<style></style>'), 0)
})

test('the backdrop is drawn at two device pixels per CSS pixel of the widest sheet, within a pixel budget', () => {
  // A4 (595 pt) in a 1024 px main: 992 CSS px of sheet, so 3.33 px/pt; an A1 sheet is held to 12 MP.
  assert.equal(backdropScale(900, { width: 595, height: 842 }).toFixed(2), '3.33')
  assert.equal(backdropScale(1400, { width: 842, height: 1191 }).toFixed(2), '3.25')
  assert.equal(backdropScale(1024, { width: 792, height: 1224 }).toFixed(2), '2.51')
  assert.equal(backdropScale(2030, { width: 1684, height: 2384 }).toFixed(2), '1.73')
})

test('the printed view leaves a translated page, a zoom past the backdrop, and a larger default text size', () => {
  const css = printCss(1100)
  assert.match(
    css,
    /@media screen and \(min-width: 50em\) and \(forced-colors: none\) and \(max-resolution: 2\.5dppx\)/,
  )
  assert.match(css, /:root:not\(\[class\*="translated-"\]\) body:has\(#view-print:checked\) \.backdrop/)
  assert.match(css, /color: transparent; letter-spacing: 0; word-spacing: 0; text-indent: 0;/)
})

test('the printed view draws nothing of ours over the print: no colour, shadow, outline or underline on placed text', () => {
  const css = printCss(1100)
  assert.doesNotMatch(
    css,
    /text-shadow: var|-webkit-text-stroke: var|color: var\(--c|text-decoration: underline|\.ink-/,
  )
  assert.match(css, /\[style\*="--x:"\] a \{ display: inline; padding: 0; margin: 0; text-decoration: none; \}/)
  // Weight spans take no weight in the box layer (it has none); italic, the print's, stays.
  assert.match(css, /\[class\*="fw-"\] \{ font-weight: inherit; \}/)
  assert.doesNotMatch(css, /font-style: inherit/)
})

test('each placed text is a box clipped at its printed rectangle, never a scroll container, its link ring on the box', () => {
  const css = printCss(1100)
  assert.match(css, /width: calc\(var\(--w\) \* 1cqw\); height: calc\(var\(--h\) \* 1cqw\); overflow: clip;/)
  assert.doesNotMatch(css, /overflow: hidden; display: block/)
  assert.match(
    css,
    /\[style\*="--x:"\]:has\(:focus-visible\) \{ outline: 3px solid var\(--focus\); outline-offset: 2px; \}/,
  )
  // No face, fit, baseline or tracking reaches the layer: its place is the print's on every OS.
  assert.doesNotMatch(css, /var\(--(ff|fw|fi|k|z|lx|ls|dy|ti|bl)\b/)
})
