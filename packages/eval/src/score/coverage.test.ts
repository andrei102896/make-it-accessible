import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Word } from '../words.ts'
import { coverage, pageTokens } from './coverage.ts'

const at = (str: string, x: number, line = 'a', h = 10): Word => ({ str, x, y: 0, w: str.length * 5, h, line })

test('tracked letters and line-end hyphens join; prices and slug text are left out', () => {
  const words = [
    at('E', 0),
    at('S', 7),
    at('M', 14),
    at('Bomber', 40),
    at('Hand­', 90),
    at('wäsche', 0, 'b'),
    at('2,99', 40, 'b'),
    at('€', 62, 'b'),
    at('PROOF', 0, 'c'),
  ]
  assert.deepEqual(pageTokens(words, ['PROOF']), ['esm', 'bomber', 'handwäsche'])
  assert.deepEqual(pageTokens([at('Bio-Erbsen', 0)], []), ['bio', 'erbsen'])
})

test('coverage counts words one to one', () => {
  const result = coverage(['alpha', 'beta', 'gamma', 'beta'], 'Gamma beta alpha')
  assert.equal(result.missing, 1)
  assert.deepEqual(result.sample, ['beta'])
})
