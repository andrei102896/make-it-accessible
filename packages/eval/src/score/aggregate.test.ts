import assert from 'node:assert/strict'
import { test } from 'node:test'
import { poissonBound, regressions, zeroFailureBound } from './aggregate.ts'

test('bounds match the pre-registered formulas', () => {
  assert.ok(Math.abs((zeroFailureBound(52) ?? 0) - 0.056) < 0.0005)
  assert.ok(Math.abs((zeroFailureBound(300) ?? 0) - 0.00994) < 0.0001)
  assert.ok(Math.abs((poissonBound(0, 1) ?? 0) - 2.996) < 0.001)
  assert.ok(Math.abs((poissonBound(6, 12) ?? 0) - 11.84 / 12) < 0.01)
  assert.equal(zeroFailureBound(0), null)
})

test('a page that passed every run and now passes at most one is a regression', () => {
  const page = (passed: number) => ({
    doc: 'd',
    keyPage: 1,
    type: 'grid',
    passed,
    runs: 3,
    silentPriceErrors: 0,
    decisions: 0,
    failing: [],
  })
  assert.deepEqual(regressions([page(3)], [page(1)]), ['d p1'])
  assert.deepEqual(regressions([page(3)], [page(2)]), [])
  assert.deepEqual(regressions([page(2)], [page(0)]), [])
})
