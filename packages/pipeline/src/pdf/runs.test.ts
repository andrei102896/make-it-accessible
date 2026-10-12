import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currencyOf, formatMoney } from '../text/money.ts'
import { amountOf } from './runs.ts'
import type { Run } from './types.ts'

const run = (id: number, str: string, x: number, y: number, w: number, h: number): Run => ({
  id: `1:${String(id)}`,
  str,
  box: { x, y, w, h },
  flow: 0,
  line: 0,
})

test('amountOf pairs large euros with small cents, in any citation order', () => {
  const euros = run(0, '2', 100, 100, 32, 78)
  const cents = run(1, '69', 132, 109, 34, 40)
  assert.deepEqual(amountOf([cents, euros]), { cents: 269, fromBareDigits: false })
})

test('amountOf ignores labels cited with the amount', () => {
  const words = [run(0, 'UVP*', 0, 0, 20, 9), run(1, '€', 22, 0, 5, 9), run(2, '19,99', 29, 0, 20, 9)]
  assert.deepEqual(amountOf(words), { cents: 1999, fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, '(1', 0, 0, 5, 9), run(1, 'kg', 6, 0, 8, 9), run(2, '22.34)', 15, 0, 20, 9)]), {
    cents: 2234,
    fromBareDigits: false,
  })
})

test('amountOf flags bare digits and rejects non-amounts', () => {
  assert.deepEqual(amountOf([run(0, '399', 0, 0, 20, 30)]), { cents: 399, fromBareDigits: true })
  assert.equal(amountOf([run(0, '-37%', 0, 0, 20, 9)]), null)
})

test('amountOf reads a currency sign printed on the digits', () => {
  assert.deepEqual(amountOf([run(0, '£1,040', 0, 0, 30, 9)]), { cents: 104000, fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, '£7500', 0, 0, 30, 9)]), { cents: 750000, fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, 'Suite:', 0, 0, 20, 9), run(1, '£200', 22, 0, 20, 9)]), {
    cents: 20000,
    fromBareDigits: false,
  })
  assert.deepEqual(amountOf([run(0, '€', 0, 0, 5, 9), run(1, '399', 7, 0, 20, 9)]), {
    cents: 39900,
    fromBareDigits: true,
  })
})

test('formatMoney and currencyOf', () => {
  assert.match(formatMoney(269, 'de-AT', 'EUR'), /2,69/)
  assert.match(formatMoney(269, 'de-AT', 'EUR'), /€/)
  assert.equal(currencyOf('Package from £7,500'), 'GBP')
  assert.equal(currencyOf('ab 2 Pkg. je'), 'EUR')
})
