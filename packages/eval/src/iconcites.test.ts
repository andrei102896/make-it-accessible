import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Run } from '@make-it-accessible/pipeline/pdf/types'
import { moveIconCites } from './iconcites.ts'

const run = (id: string, str: string, x: number, icon = false): Run => ({
  id,
  str,
  box: { x, y: 10, w: 10, h: 10 },
  flow: 0,
  line: 0,
  ...(icon ? { icon: true } : {}),
})
const text = [run('1:0', 'Salmon', 0), run('1:1', '12', 50)]

test('icon words saved two to a label (Howies, 2026-10-18) move to the one fresh run drawn at their place', () => {
  const saved = [
    ...text,
    run('1:2', 'gluten', 100, true),
    run('1:3', 'free', 100, true),
    run('1:4', 'vegan', 200, true),
  ]
  const fresh = [...text, run('1:2', 'vegan', 200, true), run('1:3', 'gluten free', 100, true)]
  const structure = {
    items: [
      { src: [[0, 0]] },
      {
        details: [
          {
            text: {
              src: [
                [2, 3],
                [4, 4],
              ],
            },
          },
        ],
      },
    ],
  }
  assert.equal(moveIconCites(structure, saved, fresh, 2), true)
  assert.deepEqual(structure, {
    items: [
      { src: [[0, 0]] },
      {
        details: [
          {
            text: {
              src: [
                [3, 3],
                [2, 2],
              ],
            },
          },
        ],
      },
    ],
  })
})

test('a cited icon word with no fresh icon at its place, or a range across the text layer, is refused', () => {
  const saved = [...text, run('1:2', 'gluten', 100, true)]
  assert.equal(moveIconCites({ src: [[2, 2]] }, saved, [...text, run('1:2', 'vegan', 200, true)], 2), false)
  assert.equal(moveIconCites({ src: [[1, 2]] }, saved, [...text, run('1:2', 'gluten', 100, true)], 2), false)
})
