import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageScore } from './fidelity-types.ts'
import { judgePage } from './fidelity-verdict.ts'

const page = (bands: [number, number][]): PageScore => {
  const ink = bands.reduce((t, [pdf, ours]) => ({ pdf: t.pdf + pdf, ours: t.ours + ours }), { pdf: 0, ours: 0 })
  return { size: { w: 600, h: 800 }, ink, bands: bands.map(([pdf, ours]) => ({ pdf, ours })) }
}

test("a page drawn lighter than its PDF reads faded (Brawn's Wremena Light by Poppler, 0.81 of pdf.js' ink)", () => {
  assert.deepEqual(
    judgePage(
      page([
        [500, 325],
        [500, 325],
      ]),
    ),
    [{ kind: 'lighter' }],
  )
  assert.deepEqual(
    judgePage(
      page([
        [500, 490],
        [500, 510],
      ]),
    ),
    [],
  )
})

test("a strip of the page left blank is found by its band (La Segunda's last 70 px), a near-empty margin is not", () => {
  assert.deepEqual(
    judgePage(
      page([
        [900, 900],
        [900, 900],
        [200, 20],
      ]),
    ),
    [{ kind: 'lighter' }],
  )
  assert.deepEqual(
    judgePage(
      page([
        [1000, 1000],
        [1000, 1000],
        [10, 0],
      ]),
    ),
    [],
  )
})
