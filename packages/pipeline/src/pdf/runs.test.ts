import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatMoney } from '../text/money.ts'
import { amountOf, asPrinted, printedAmount, printsFusedCents } from './runs.ts'
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

test('digits of one price split at the separator join across a word gap; separate numbers and years do not', () => {
  // Almond "21.9" + "5" at 0.10 h, Gargiulo "18." + "50" at 0.27 h (measured on the first US menus).
  assert.deepEqual(amountOf([run(0, '21.9', 943, 47, 24, 13), run(1, '5', 968.6, 47, 6, 13)]), {
    cents: 2195,
    currency: null,
    fromBareDigits: false,
  })
  assert.deepEqual(amountOf([run(0, '18.', 539.4, 690, 13.56, 10.97), run(1, '50', 555.96, 690, 11.27, 10.97)]), {
    cents: 1850,
    currency: null,
    fromBareDigits: false,
  })
  // Past the near gap the separator still joins: a decimal separator cannot end a price (price grammar, 2026-10-19).
  assert.equal(amountOf([run(0, '18.', 539.4, 690, 13.56, 10.97), run(1, '50', 557, 690, 11.27, 10.97)])?.cents, 1850)
  assert.equal(amountOf([run(0, '2', 0, 0, 5, 10), run(1, '8', 5, 0, 5, 10)]), null)
  // A third decimal is never joined: "£8.95" stays the amount and the "12" beside it is another word.
  assert.deepEqual(amountOf([run(0, '£8.95', 0, 0, 25, 10), run(1, '12', 27, 0, 10, 10)]), {
    cents: 895,
    currency: 'GBP',
    fromBareDigits: false,
  })
  assert.equal(amountOf([run(0, '18,', 0, 0, 15, 10), run(1, '1917,', 16.5, 0, 25, 10)]), null)
  assert.deepEqual(amountOf([run(0, '20,', 0, 0, 15, 10)]), { cents: 20, currency: null, fromBareDigits: true })
})

test('printed amounts keep the citation order and join split digits; as-printed words are market and two-size prices', () => {
  const split = [run(0, '21.9', 943, 47, 24, 13), run(1, '5', 968.6, 47, 6, 13)]
  assert.equal(printedAmount(split), '21.95')
  assert.equal(printedAmount([run(1, 'each', 30, 0, 20, 10), run(0, '12', 0, 0, 10, 10)]), 'each 12')
  assert.equal(asPrinted([run(0, 'MP', 0, 0, 10, 10)]), 'MP')
  assert.equal(asPrinted([run(0, '22/32', 0, 0, 25, 10)]), '22/32')
  assert.equal(asPrinted([run(0, '18.9', 0, 0, 20, 10)]), '18.9')
  assert.equal(asPrinted([run(0, '-37%', 0, 0, 20, 10)]), null)
  assert.equal(asPrinted([run(0, '26,9', 0, 0, 20, 10)]), null)
})

test('a page prints fused cents only when a euro number has small cents beside it', () => {
  assert.equal(printsFusedCents([run(0, '2', 100, 100, 32, 78), run(1, '69', 132, 109, 34, 40)]), true)
  assert.equal(printsFusedCents([run(0, 'Crudo', 0, 0, 30, 10), run(1, '19', 100, 0, 10, 10)]), false)
})

test('price grammar, not layout: tracked cents join, fused leaders and words drop, invisible characters go', () => {
  // A separator cannot end a price: "$9." and "30" are one amount even 0.6 of a line apart.
  assert.equal(amountOf([run(0, '$9.', 100, 0, 12, 10), run(1, '30', 118, 0, 9, 10)])?.cents, 930)
  assert.equal(amountOf([run(0, 'roll....$7.95', 100, 0, 50, 10)])?.cents, 795)
  assert.deepEqual(amountOf([run(0, 'Egg…12', 100, 0, 30, 10)]), amountOf([run(0, '12', 100, 0, 10, 10)]))
  assert.equal(amountOf([run(0, 'sauce17.49', 100, 0, 40, 10)])?.cents, 1749)
  assert.equal(amountOf([run(0, '£31.50​', 100, 0, 30, 10)])?.cents, 3150)
  // No separator between the digits: "$1 6" may be one price or two; it stays unread.
  assert.equal(amountOf([run(0, '$1', 100, 0, 8, 10), run(1, '6', 115, 0, 5, 10)]), null)
  // Leader dots before a leading zero are garbled text, not an amount.
  assert.equal(amountOf([run(0, '.....044', 100, 0, 30, 10)]), null)
})

test('small raised cents that print their separator join whole digits before them (Bernie\'s "$13" + ".95")', () => {
  // Bernie's: "$" 8.9 high, "13" 12.5, ".95" 8.9 top-aligned, touching.
  const bernies = [
    run(0, '$', 520.4, 133.6, 3.1, 8.9),
    run(1, '13', 523, 133.3, 8.8, 12.5),
    run(2, '.95', 532.4, 133.6, 7.6, 8.9),
  ]
  assert.equal(amountOf(bernies)?.cents, 1395)
  assert.equal(printedAmount(bernies), '$ 13.95')
  assert.equal(amountOf([run(0, '$24', 10, 100, 15, 12.5), run(1, '.95', 25.5, 100, 7.6, 8.9)])?.cents, 2495)
  // Never a second decimal, never far, taller or tiny.
  assert.equal(printedAmount([run(0, '9.99', 10, 100, 20, 12.5), run(1, '.50', 30.5, 100, 7, 8.9)]), '9.99 .50')
  assert.equal(printedAmount([run(0, '13', 10, 100, 9, 12.5), run(1, '.95', 40, 100, 7, 8.9)]), '13 .95')
  assert.equal(printedAmount([run(0, '13', 10, 100, 9, 8.9), run(1, '.95', 19.5, 100, 7, 12.5)]), '13 .95')
  assert.equal(printedAmount([run(0, '13', 10, 100, 9, 12.5), run(1, '.95', 19.5, 100, 2, 2)]), '13 .95')
  // A leaflet's small cents that print a comma join too (they were bare euros before).
  assert.deepEqual(amountOf([run(0, '2', 10, 100, 6, 12.5), run(1, ',69', 16.5, 100, 7, 8)], 'EUR'), {
    cents: 269,
    currency: 'EUR',
    fromBareDigits: false,
  })
})
