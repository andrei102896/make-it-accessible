import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatMoney } from '../text/money.ts'
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
  assert.deepEqual(amountOf([cents, euros]), { cents: 269, currency: null, fromBareDigits: false })
})

test('amountOf ignores labels cited with the amount', () => {
  const words = [run(0, 'UVP*', 0, 0, 20, 9), run(1, '€', 22, 0, 5, 9), run(2, '19,99', 29, 0, 20, 9)]
  assert.deepEqual(amountOf(words), { cents: 1999, currency: 'EUR', fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, '(1', 0, 0, 5, 9), run(1, 'kg', 6, 0, 8, 9), run(2, '22.34)', 15, 0, 20, 9)]), {
    cents: 2234,
    currency: null,
    fromBareDigits: false,
  })
})

test('amountOf flags bare digits and rejects non-amounts', () => {
  assert.deepEqual(amountOf([run(0, '399', 0, 0, 20, 30)]), { cents: 399, currency: null, fromBareDigits: true })
  assert.equal(amountOf([run(0, '-37%', 0, 0, 20, 9)]), null)
})

test('amountOf reads a currency sign printed on the digits', () => {
  assert.deepEqual(amountOf([run(0, '£1,040', 0, 0, 30, 9)]), { cents: 104000, currency: 'GBP', fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, '£7500', 0, 0, 30, 9)]), { cents: 750000, currency: 'GBP', fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, 'Suite:', 0, 0, 20, 9), run(1, '£200', 22, 0, 20, 9)]), {
    cents: 20000,
    currency: 'GBP',
    fromBareDigits: false,
  })
  assert.deepEqual(amountOf([run(0, '€', 0, 0, 5, 9), run(1, '399', 7, 0, 20, 9)]), {
    cents: 39900,
    currency: 'EUR',
    fromBareDigits: true,
  })
})

test('formatMoney', () => {
  assert.match(formatMoney(269, 'de-AT', 'EUR'), /2,69/)
  assert.match(formatMoney(269, 'de-AT', 'EUR'), /€/)
  assert.equal(formatMoney(1350, 'en-US', 'USD'), '$13.50')
})

test('amountOf joins a price set glyph by glyph, but not small cents or a footnote', () => {
  const pound = run(0, '£8.', 534, 60, 24, 22)
  assert.deepEqual(amountOf([run(1, '95', 558, 62, 16, 18.4), pound]), {
    cents: 895,
    currency: 'GBP',
    fromBareDigits: false,
  })
  const glyphs = [run(0, '1', 0, 0, 5, 10), run(1, '.1', 5, 0, 7, 10), run(2, '9', 12, 0, 5, 10)]
  assert.deepEqual(amountOf(glyphs, 'EUR'), { cents: 119, currency: 'EUR', fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, '1.99', 0, 0, 20, 10), run(1, '2', 20, 0, 5, 9)], 'GBP'), {
    cents: 199,
    currency: 'GBP',
    fromBareDigits: false,
  })
  assert.equal(amountOf([run(0, '£8', 0, 0, 16, 10), run(1, '95', 16, 0, 10, 10)]), null)
})

test('amountOf takes the currency the words print, else the page currency, else none', () => {
  assert.deepEqual(amountOf([run(0, '99p', 0, 0, 15, 9)]), { cents: 99, currency: 'GBP', fromBareDigits: false })
  assert.deepEqual(amountOf([run(0, '$5.29', 0, 0, 25, 9)], 'GBP'), {
    cents: 529,
    currency: 'USD',
    fromBareDigits: false,
  })
  assert.deepEqual(amountOf([run(0, '12.50', 0, 0, 25, 9)], 'GBP'), {
    cents: 1250,
    currency: 'GBP',
    fromBareDigits: false,
  })
  assert.deepEqual(amountOf([run(0, '12.50', 0, 0, 25, 9)]), { cents: 1250, currency: null, fromBareDigits: false })
  assert.equal(amountOf([run(0, '£5', 0, 0, 10, 9), run(1, '€6', 20, 0, 10, 9)]), null)
})
