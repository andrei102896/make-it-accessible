import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportOf } from './report.ts'

test('a page in the text layout says why in the owner words; open details are counted; cosmetic notes come once', () => {
  const pages = [
    { keyPage: 1, pdfPage: 1, printed: true, scan: false, converted: true },
    { keyPage: 2, pdfPage: 2, printed: false, scan: false, converted: true },
    { keyPage: 3, pdfPage: 3, printed: false, scan: true, converted: true },
    { keyPage: 4, pdfPage: 4, printed: false, scan: false, converted: false },
  ]
  const check = { text: new Map([[2, 'doubled' as const]]), cosmetic: new Set(['narrower' as const]) }
  const held = [{ pdfPage: 1, path: 'blocks[0].items[2].prices[0]', problem: 'price "34.50`" is not an amount' }]
  const r = reportOf(pages, check, held)
  const [one, two, three, four] = r.pages
  assert.ok(one && two && three && four)
  assert.equal(four.view, 'none')
  assert.equal(one.view, 'printed')
  assert.equal(one.say, '1 detail on page 1 needs your confirmation before the page goes live.')
  assert.equal(two.say, 'Page 2 opens as Text only, where every word reads clearly. Nothing for you to do.')
  // With details to confirm, the page never says there is nothing to do.
  const held2 = [{ pdfPage: 2, path: 'page', problem: 'x' }]
  const both = reportOf([{ keyPage: 2, pdfPage: 2, printed: false, scan: false, converted: true }], check, held2)
    .pages[0]
  assert.doesNotMatch(both?.say ?? '', /Nothing for you to do/)
  assert.match(two.why ?? '', /shadow or blur/)
  assert.match(three.why ?? '', /picture of the menu/)
  assert.deepEqual(r.notes, [
    "A few details As printed still differ from your print, and we're working on them: the letter spacing of some lines.",
  ])
  assert.doesNotMatch(JSON.stringify(r), /complian|certif/i)
})
