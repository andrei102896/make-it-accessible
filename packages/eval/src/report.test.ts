import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportOf } from './report.ts'

test('a page in the text layout says why in the owner words; open details are counted', () => {
  const pages = [
    { pdfPage: 1, printed: true, scan: false, converted: true },
    { pdfPage: 2, printed: false, scan: false, converted: true },
    { pdfPage: 3, printed: false, scan: true, converted: true },
    { pdfPage: 4, printed: false, scan: false, converted: false },
  ]
  const held = [
    { pdfPage: 1, path: 'blocks[0].items[2].prices[0]', problem: 'price "34.50`" is not an amount', words: null },
  ]
  const r = reportOf(pages, held)
  const [one, two, three, four] = r.pages
  assert.ok(one && two && three && four)
  assert.equal(four.view, 'none')
  assert.equal(one.view, 'printed')
  assert.equal(one.say, '1 detail on page 1 needs your confirmation before the page goes live.')
  assert.equal(two.say, 'Page 2 opens as Text only, where every word reads clearly. Nothing for you to do.')
  // With details to confirm, the page never says there is nothing to do.
  const held2 = [{ pdfPage: 2, path: 'page', problem: 'x', words: null }]
  const both = reportOf([{ pdfPage: 2, printed: false, scan: false, converted: true }], held2).pages[0]
  assert.doesNotMatch(both?.say ?? '', /Nothing for you to do/)
  assert.match(two.why ?? '', /couldn't draw/)
  assert.match(three.why ?? '', /picture of the menu/)
  assert.doesNotMatch(JSON.stringify(r), /complian|certif/i)
})

test('a detail checked by hand is told to the owner with the date written out, and the page has something to read', () => {
  const page = { pdfPage: 8, printed: false, scan: false, converted: true }
  const checked = [
    {
      pdfPage: 8,
      label: 'STILL / SPARKLING WATER, 330ml 2.50 and 750ml 4.25',
      name: 'Andrei',
      at: '2026-10-22T13:05:00Z',
    },
  ]
  const [p] = reportOf([page], [], checked).pages
  assert.ok(p)
  assert.deepEqual(p.checked, [{ label: checked[0]?.label, name: 'Andrei', at: '2026-10-22T13:05:00Z' }])
  assert.doesNotMatch(p.say ?? '', /Nothing for you to do/)
  assert.match(
    p.say ?? '',
    /On 22 October 2026, Andrei at Make It Accessible checked this detail against your PDF by hand: STILL \/ SPARKLING WATER, 330ml 2\.50 and 750ml 4\.25\. If it differs from your menu, reply to this email/,
  )
})

test('several details checked by hand: one sentence per day and person, labels apart by semicolons, one closing', () => {
  const page = { pdfPage: 1, printed: true, scan: false, converted: true }
  const at = '2026-10-22T12:51:33Z'
  const fries = [
    { pdfPage: 1, label: 'Sea salt skin on fries 4.95, gluten free.', name: 'Andrei', at },
    {
      pdfPage: 1,
      label: 'Sea salt skin on fries: shown without a dairy-free mark, as in your PDF',
      name: 'Andrei',
      at,
    },
  ]
  const say = (c: typeof fries): string => reportOf([page], [], c).pages[0]?.say ?? ''
  assert.equal(
    say(fries),
    "On 22 October 2026, Andrei at Make It Accessible checked these details against your PDF by hand: Sea salt skin on fries 4.95, gluten free; Sea salt skin on fries: shown without a dairy-free mark, as in your PDF. If anything differs from your menu, reply to this email and we'll correct it.",
  )
  const two = say(fries.map((c, i) => (i ? { ...c, name: 'Louis' } : c)))
  assert.match(two, /^On .* Andrei .* this detail .*\. On .* Louis .* this detail .*\. If anything differs/)
  assert.equal(two.match(/If anything differs/g)?.length, 1)
})

test('details checked by hand under one label are told once (Howies: two lobster marks)', () => {
  const page = { pdfPage: 1, printed: true, scan: false, converted: true }
  const lobster = {
    pdfPage: 1,
    label: 'Add half lobster: the lobster mark, in no allergen key',
    name: 'Andrei',
    at: '2026-10-22T19:13:09Z',
  }
  assert.equal(
    reportOf([page], [], [lobster, lobster]).pages[0]?.say,
    "On 22 October 2026, Andrei at Make It Accessible checked this detail against your PDF by hand: Add half lobster: the lobster mark, in no allergen key. If it differs from your menu, reply to this email and we'll correct it.",
  )
})
