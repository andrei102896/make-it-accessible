import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { validatePage } from './validate.ts'

// The Marksman's wines: "Wine By The Glass 125ml/500ml/750ml" over prices of three sizes, one not served ("-").
const word = (str: string, x: number, y: number, i: number): Run => ({
  id: `1:${String(i)}`,
  str,
  box: { x, y, w: str.length * 5, h: 10 },
  flow: 0,
  line: y,
})
const page = (words: [string, number, number][]): Extraction => ({
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map(([str, x, y], i) => word(str, x, y, i)),
  images: [],
  duplicates: [],
  hidden: [],
})
// Words 0 and 1 a heading and a paragraph when `read`, `more` read too; then a dish name and its price per pair.
const answer = (dishes: number[], read: boolean, more: [number, number][] = []): ReturnType<typeof parsePage> =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        ...(read
          ? [
              { kind: 'heading', level: 2, text: { src: [[0, 0]] } },
              { kind: 'paragraph', text: { src: [[1, 1]] } },
              ...more.map((src) => ({ kind: 'paragraph', text: { src: [src] } })),
            ]
          : []),
        {
          kind: 'products',
          items: dishes.map((n) => ({ name: { src: [[n, n]] }, prices: [{ src: [[n + 1, n + 1]] }] })),
        },
      ],
      dropped: read ? [] : [[0, 1]],
    }),
  )
const sized = (v: ReturnType<typeof validatePage>): string[] =>
  [...v.errors, ...v.review].map((f) => f.problem).filter((p) => /price|sizes/.test(p))

test('sizes printed in one word above the prices name them; a dash is a size not served', () => {
  const e = page([
    ['Glass', 28, 240],
    ['125ml/500ml/750ml', 80, 240],
    ['Vermentino', 28, 300],
    ['£7.5/26/38', 120, 300],
    ['Frizzante', 300, 300],
    ['£10/-/54', 400, 300],
    ['Antidote', 300, 400],
    ['£7.5/42', 400, 400],
  ])
  // Two sizes are not the label's three: the Antidote stays held.
  assert.deepEqual(sized(validatePage(answer([2, 4, 6], true), e)), [
    'prices of several sizes with no size label: "£7.5/42"',
  ])
})

test('a size label the answer drops, printed below, or one of two names nothing', () => {
  const words: [string, number, number][] = [
    ['Glass', 28, 240],
    ['125ml/500ml/750ml', 80, 240],
    ['Vermentino', 28, 300],
    ['£7.5/26/38', 120, 300],
  ]
  const held = ['prices of several sizes with no size label: "£7.5/26/38"']
  assert.deepEqual(sized(validatePage(answer([2], false), page(words))), held)
  const below = words.map(([s, x, y]): [string, number, number] => [s, x, y < 300 ? 500 : y])
  assert.deepEqual(sized(validatePage(answer([2], true), page(below))), held)
  const two = page([...words, ['Carafe', 28, 260], ['175ml/250ml/1l', 80, 260]])
  assert.deepEqual(sized(validatePage(answer([2], true, [[4, 5]]), two)), held)
})
