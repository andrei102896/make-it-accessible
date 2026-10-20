import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currenciesIn, moneyFromParts, pageCurrency, parseMoney, signAround } from './money.ts'
import { canon, norm } from './normalize.ts'

test('norm and canon', () => {
  assert.equal(norm('Wieselburger Gold²⁾'), norm('Wieselburger Gold2)'))
  assert.equal(norm('Lay’s  Bugles'), "lay's bugles")
  assert.equal(norm('C H R I S T M A S at Stone House'), 'christmas at stone house')
  assert.equal(norm('z. B. 200 g'), 'z. b. 200 g')
  assert.equal(canon('vom STROH\u00AD wohlschwein'), canon('vom STROHwohlschwein'))
})

test('parseMoney', () => {
  assert.equal(parseMoney('2,69 €'), 269)
  assert.equal(parseMoney('€ 1,95'), 195)
  assert.equal(parseMoney('1.59'), 159)
  assert.equal(parseMoney('199,-'), 19900)
  assert.equal(parseMoney('-,65'), 65)
  assert.equal(parseMoney('-0,10 €'), -10)
  assert.equal(parseMoney('-140'), -140)
  assert.equal(parseMoney('£10,000'), 1_000_000)
  assert.equal(parseMoney('£7500'), 750_000)
  assert.equal(parseMoney('1.234,56 €'), 123_456)
  assert.equal(parseMoney('26,9'), null)
  assert.equal(parseMoney('UVP* € 19,99'), null)
  assert.equal(parseMoney(''), null)
  assert.equal(parseMoney('99p'), 99)
  assert.equal(parseMoney('12P'), null)
  assert.equal(parseMoney('£12.5'), 1250)
  assert.equal(parseMoney('12.5'), null)
  assert.equal(parseMoney('$0.125'), null)
  assert.equal(parseMoney('$1.299'), null)
  assert.equal(parseMoney('$1,299'), 129_900)
  assert.equal(parseMoney('1.299 €'), 129_900)
})

test('currencies named by words and by a page', () => {
  assert.deepEqual(currenciesIn('£5 or €6'), ['GBP', 'EUR'])
  assert.deepEqual(currenciesIn('only 99p'), ['GBP'])
  assert.equal(pageCurrency('Chips £4.50 Salad £5.95 Burger 17'), 'GBP')
  assert.equal(pageCurrency('Burger £17'), null)
  assert.equal(pageCurrency('Chips £4.50 Salad £5.95 Deposit €10'), null)
  assert.equal(pageCurrency('www.example.com 12 pcs'), null)
})

test('moneyFromParts pairs large euros with small cents', () => {
  assert.equal(
    moneyFromParts([
      { str: '2', height: 78.5 },
      { str: '69', height: 40.7 },
    ]),
    269,
  )
  assert.equal(
    moneyFromParts([
      { str: '-0', height: 24.7 },
      { str: '10', height: 13.1 },
    ]),
    -10,
  )
  assert.equal(
    moneyFromParts([
      { str: '€', height: 9 },
      { str: '4,50', height: 9 },
    ]),
    450,
  )
  assert.equal(
    moneyFromParts([
      { str: '74,', height: 40 },
      { str: '95', height: 20 },
    ]),
    7495,
  )
})

test('signAround: the sign and only the space between it and the digits', () => {
  assert.deepEqual(signAround('en-GB', 'GBP'), { before: '£', after: '' })
  assert.deepEqual(signAround('de-DE', 'EUR'), { before: '', after: '\u00a0€' })
  assert.deepEqual(signAround('nl-NL', 'EUR'), { before: '€\u00a0', after: '' })
  assert.deepEqual(signAround('en-US', 'USD'), { before: '$', after: '' })
})
