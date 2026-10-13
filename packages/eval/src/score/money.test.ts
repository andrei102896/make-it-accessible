import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAmount, moneyInText, readMoney } from './money.ts'

test('readMoney reads rendered and printed prices', () => {
  const cases: [string, number, string | null][] = [
    ['2,99\u00a0€', 299, 'EUR'],
    ['£7,500.00', 750000, 'GBP'],
    ['£7500', 750000, 'GBP'],
    ['£10,000', 1000000, 'GBP'],
    ['CHF 4.95', 495, 'CHF'],
    ['Fr. 12.–', 1200, 'CHF'],
    ['99p', 99, 'GBP'],
    ['$4.99', 499, 'USD'],
    ['12,50€', 1250, 'EUR'],
    ['12.5', 1250, null],
    ['-,99', 99, null],
    ['\u22120,10\u00a0€', -10, 'EUR'],
    ['€ 222,-', 22200, 'EUR'],
    ['-€1.40', -140, 'EUR'],
    ['-1,40\u00a0€', -140, 'EUR'],
    ['1.299,00 €', 129900, 'EUR'],
    ['1.299 €', 129900, 'EUR'],
    ['statt 3,99\u00a0€', 399, 'EUR'],
  ]
  for (const [text, cents, currency] of cases) assert.deepEqual(readMoney(text), { cents, currency }, text)
  assert.equal(readMoney('Aktion'), null)
  assert.equal(readMoney('UVP* € 19,99 € 13,95'), null)
  assert.equal(readMoney('ab 18 Stück à 0,55 €'), null)
})

test('moneyInText finds prices in running text and leaves other numbers alone', () => {
  assert.deepEqual(
    moneyInText('Deposit of £200 per person, 2 courses £25, 3 for 2, 10% off, sizes 36-42').map((m) => m.cents),
    [20000, 2500],
  )
  assert.deepEqual(
    moneyInText('UVP* 79,99 €, jetzt 29,99').map((m) => [m.cents, m.currency]),
    [
      [7999, 'EUR'],
      [2999, null],
    ],
  )
})

test('isAmount accepts bare amounts only', () => {
  for (const s of ['13.45', '-,65', '£7500', '2,99 €', '99p', '€ 222,-']) assert.ok(isAmount(s), s)
  for (const s of ['2 € billiger', 'per Kilo', 'ab 18 Stück à -,55', 'UVP* 79,99']) assert.ok(!isAmount(s), s)
})
