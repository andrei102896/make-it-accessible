import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseReview } from './review.ts'

test('a review is parsed loosely, majors first, and a major difference means "fix first"', () => {
  const raw = `Here: ${JSON.stringify({
    verdict: 'ready',
    character: 'Italian-American, red frames, small caps',
    differences: [
      { category: 'colour', severity: 'minor', note: 'Sub-headings are navy, the PDF prints them red.' },
      { category: 'layout', severity: 'major', note: 'Sections stack; the PDF prints three framed columns.' },
      { category: 'smell', severity: 'huge', note: 'x'.repeat(300) },
    ],
  })}`
  const r = parseReview(raw)
  assert.equal(r.verdict, 'fix first')
  assert.equal(r.differences[0]?.severity, 'major')
  assert.deepEqual(r.differences[2], { category: 'layout', severity: 'minor', note: 'x'.repeat(240) })
  assert.throws(() => parseReview('{"verdict":"maybe","character":"x","differences":[]}'))
})
