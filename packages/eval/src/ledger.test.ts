import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ledger } from './ledger.ts'
import type { Word } from './words.ts'

// Words laid out left to right on one line: [text, gap before it as a share of the height].
function line(parts: [string, number][], h: number, y = 100, name = 'l1'): Word[] {
  let x = 10
  return parts.map(([str, before]) => {
    x += before * h
    const w = { str, x, y, w: str.length * h * 0.5, h, line: name }
    x += w.w
    return w
  })
}
const read = (words: Word[]): (number | null)[] => ledger(words).map((o) => o.cents)

test('kerned and tracked glyphs of one number join; full numbers apart stay two prices', () => {
  assert.deepEqual(
    read(
      line(
        [
          ['1', 0],
          ['9.99', 0.12],
        ],
        67,
      ),
    ),
    [1999],
  )
  assert.deepEqual(
    read(
      line(
        [
          ['1', 0],
          ['2.', 0.16],
          ['9', 0.19],
          ['9', 0.19],
        ],
        13.5,
      ),
    ),
    [1299],
  )
  assert.deepEqual(
    read(
      line(
        [
          ['0.59', 0],
          ['0.99', 0.2],
        ],
        8,
      ),
    ),
    [59, 99],
  )
})

test('a space before a price in small print keeps the price whole', () => {
  assert.deepEqual(
    read(
      line(
        [
          ['8', 0],
          ['x', 0.2],
          ['330ml,', 0.2],
          ['£1.59/L', 0.18],
        ],
        8,
      ),
    ),
    [159],
  )
})

test('dates, numbers with a leading zero, sizes and percentages are not prices', () => {
  assert.deepEqual(
    read(
      line(
        [
          ['Ab', 0],
          ['Do.', 0.3],
          ['8.1', 0.3],
          ['0.', 0.24],
        ],
        27,
      ),
    ),
    [],
  )
  assert.deepEqual(
    read(
      line(
        [
          ['2', 0],
          ['1.', 0.3],
          ['0', 0.3],
          ['9.', 0.3],
          ['2', 0.3],
        ],
        8,
      ),
    ),
    [],
  )
  assert.deepEqual(
    read(
      line(
        [
          ['01.08', 0],
          ['2.000', 1],
          ['600', 1],
          ['g', 0.2],
          ['-17%', 1],
        ],
        10,
      ),
    ),
    [],
  )
})

test('pence, a split pence sign and unit prices in pence are read', () => {
  assert.deepEqual(
    read(
      line(
        [
          ['Save', 0],
          ['50', 0.2],
          ['p', 0],
        ],
        15,
      ),
    ),
    [50],
  )
  assert.deepEqual(
    read(
      line(
        [
          ['Regular', 0],
          ['price', 0.2],
          ['16.7p/capsule', 0.2],
        ],
        8,
      ),
    ),
    [16.7],
  )
})

test('an unmapped glyph makes the occurrence unreadable instead of a wrong amount', () => {
  const [o] = ledger(line([['£\ufffd.99', 0]], 43))
  if (!o) throw new Error('no occurrence')
  assert.equal(o.unreadable, true)
  assert.equal(o.cents, null)
  assert.equal(
    ledger(
      line(
        [
          ['£\ufffd.59', 0],
          ['£\ufffd.09', 2],
        ],
        43,
      ),
    ).length,
    2,
  )
})

test('small top-aligned cents on another line chain to their euros', () => {
  const euros: Word = { str: '2', x: 100, y: 50, w: 20, h: 40, line: 'a' }
  const cents: Word = { str: '95', x: 121, y: 52, w: 14, h: 18, line: 'b' }
  const above: Word = { str: '–', x: 125, y: 38, w: 3, h: 10, line: 'c' }
  assert.deepEqual(read([above, cents, euros]), [295])
})

test('a currency sign between two prices goes to the closer one; "£" always to the next', () => {
  const pounds = ledger(
    line(
      [
        ['4.59', 0],
        ['£', 0.25],
        ['5.99', 0.05],
      ],
      10,
    ),
  )
  assert.deepEqual(
    pounds.map((o) => [o.cents, o.currency]),
    [
      [459, null],
      [599, 'GBP'],
    ],
  )
  const euros = ledger(
    line(
      [
        ['4,59', 0],
        ['€', 0.05],
        ['5,99', 0.4],
        ['€', 0.05],
      ],
      10,
    ),
  )
  assert.deepEqual(
    euros.map((o) => [o.cents, o.currency]),
    [
      [459, 'EUR'],
      [599, 'EUR'],
    ],
  )
})

test('two whole prices never join, however close; a much smaller glyph is another line of type', () => {
  assert.deepEqual(
    read(
      line(
        [
          ['£1', 0],
          ['£2', 0.3],
        ],
        10,
      ),
    ),
    [100, 200],
  )
  assert.deepEqual(
    read(
      line(
        [
          ['2.49', 0],
          ['2.99', 0.1],
        ],
        10,
      ),
    ),
    [249, 299],
  )
  assert.deepEqual(
    read([
      { str: '1', x: 0, y: 0, w: 20, h: 40, line: 'l' },
      { str: '5,99', x: 21, y: 0, w: 10, h: 10, line: 'l' },
    ]),
    [599],
  )
})

test('cents chain to euros before runs; a sign on either side and a dash for no euros join the chain', () => {
  const at = (str: string, x: number, h: number, line: string, y = 50): Word => ({
    str,
    x,
    y,
    w: str.length * h * 0.5,
    h,
    line,
  })
  assert.deepEqual(
    ledger([at('€', 70, 30, 'a'), at('1', 90, 30, 'a'), at('99', 106, 15, 'b', 52)]).map((o) => [o.cents, o.currency]),
    [[199, 'EUR']],
  )
  assert.deepEqual(
    ledger([at('1', 90, 30, 'a'), at('99', 106, 15, 'b', 52), at('€', 122, 15, 'b', 52)]).map((o) => [
      o.cents,
      o.currency,
    ]),
    [[199, 'EUR']],
  )
  assert.deepEqual(read([at('-,', 90, 30, 'a'), at('99', 121, 15, 'b', 52)]), [99])
})

test('an unmapped ligature in a word is not a hidden digit', () => {
  const [o] = ledger(
    line(
      [
        ['O�er', 0],
        ['£2.99', 0.3],
      ],
      10,
    ),
  )
  if (!o) throw new Error('no occurrence')
  assert.equal(o.unreadable, false)
  assert.equal(o.cents, 299)
})
