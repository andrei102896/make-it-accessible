import assert from 'node:assert/strict'
import { test } from 'node:test'
import { printedTitle } from './look.ts'

test('a title part is kept only when printed as one phrase', () => {
  const page = 'BILLA PLUS KAUFEN HEISST: FÜHREND BEI GEMÜSE AUS ÖSTERREICH Elddis Autoquest 2027'
  assert.equal(printedTitle('BILLA PLUS · Führend Gemüse aus Österreich', page), 'BILLA PLUS')
  assert.equal(printedTitle('BILLA PLUS · Führend bei Gemüse', page), 'BILLA PLUS · Führend bei Gemüse')
  assert.equal(printedTitle('Eldis · Autoquest 2027', page), 'Autoquest 2027')
  assert.equal(printedTitle('Eldis · Range', page), undefined)
})
