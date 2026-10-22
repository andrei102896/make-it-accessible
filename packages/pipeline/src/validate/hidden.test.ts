import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

// Howies Waterloo dinner's fries: "dairy free" is an icon covered by what is painted after it (pdf/visibility.ts).
const e: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: ['Sea', 'fries', '4.95', 'dairy free'].map((str, i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x: 80 + i * 40, y: 100, w: 30, h: 10 },
    flow: 0,
    line: 0,
  })),
  images: [],
  duplicates: [],
  hidden: ['1:3'],
}

test('a range citing only words that draw nothing holds its text; a hidden word among shown ones does not', () => {
  const structure = (detail: [number, number][]) =>
    parsePage(
      JSON.stringify({
        lang: 'en',
        blocks: [
          {
            kind: 'products',
            items: [
              {
                name: { src: [[0, 1]] },
                prices: [{ src: [[2, 2]] }],
                details: [{ kind: 'paragraph', text: { src: detail } }],
              },
            ],
          },
        ],
        dropped: [],
      }),
    )
  const held = (s: ReturnType<typeof parsePage>): string[] =>
    validatePage(s, e)
      .review.filter((f) => f.problem.startsWith('cites words that draw nothing'))
      .map((f) => f.path)
  assert.deepEqual(held(structure([[3, 3]])), ['blocks[0].items[0].details[0]'])
  assert.deepEqual(held(structure([[1, 3]])), [])
  // Two such ranges in one text are one finding.
  assert.deepEqual(
    held(
      structure([
        [3, 3],
        [3, 3],
      ]),
    ),
    ['blocks[0].items[0].details[0]'],
  )
  // Dropping a word that draws nothing is right, not a claim to check.
  assert.deepEqual(
    validatePage({ ...structure([[1, 1]]), dropped: [[3, 3]] }, e).review.filter((f) => f.path === 'dropped'),
    [],
  )
})
