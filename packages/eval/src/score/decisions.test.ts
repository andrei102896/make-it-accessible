import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decisions } from './decisions.ts'

const at = (...paths: string[]): { path: string; problem: string }[] => paths.map((path) => ({ path, problem: '' }))

test('decisions count products, rows and blocks once, plus one for the page', () => {
  assert.equal(decisions({ errors: [], review: [] }), 0)
  assert.equal(
    decisions({
      errors: at('blocks[2].items[0].prices[1]'),
      review: at('blocks[2].items[0].details[1]', 'blocks[2].items[0]', 'blocks[2].items[1].name'),
    }),
    2,
  )
  assert.equal(decisions({ errors: at('blocks[4].rows[1][2].prices[0]', 'blocks[4].rows[1][0]'), review: [] }), 1)
  assert.equal(decisions({ errors: [], review: at('blocks[0]', 'blocks[0].caption', 'page', 'dropped') }), 2)
})
