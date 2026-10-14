import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAddOn, isBadge, legendOf, linkify, trailingCodes } from './inline.ts'

test('printed addresses, e-mails and phone numbers become links; prices, years and postcodes do not', () => {
  assert.equal(
    linkify('Book at www.carewinn.co.uk or 01646 651 267.'),
    'Book at <a href="https://www.carewinn.co.uk">www.carewinn.co.uk</a> or <a href="tel:01646651267">01646 651 267</a>.',
  )
  assert.equal(linkify('Mail info@hotel.co.uk'), 'Mail <a href="mailto:info@hotel.co.uk">info@hotel.co.uk</a>')
  for (const plain of ['2026/2027/2028', 'SA70 8SL', '£1,040', '24TH – 28TH', 'Art. 42-742 630', '1 kg 18.60'])
    assert.equal(linkify(plain), plain)
  assert.equal(linkify('<b>& "x"'), '&lt;b&gt;&amp; &quot;x&quot;')
})

test('a legend is one block of code and words lines; product words are not one', () => {
  const legend = legendOf([['Starters'], ['V Vegetarian', 'VE Vegan', 'GF Gluten Free', 'GFO Gluten Free Option']])
  assert.deepEqual(
    [...legend],
    [
      ['V', 'Vegetarian'],
      ['VE', 'Vegan'],
      ['GF', 'Gluten Free'],
      ['GFO', 'Gluten Free Option'],
    ],
  )
  assert.equal(legendOf([['V = Vegetarian, GF = Gluten free']]).get('GF'), 'Gluten free')
  assert.equal(legendOf([['V Vegetarian']]).size, 0)
  assert.equal(legendOf([['V Vegetarian', 'served with chips']]).size, 0)
})

test('codes at the end of a description move out; a code inside the text stays', () => {
  const legend = legendOf([['V Vegetarian', 'GFO Gluten Free Option']])
  assert.deepEqual(trailingCodes('griddled halloumi & salad V GFO', legend), {
    rest: 'griddled halloumi & salad',
    codes: ['V', 'GFO'],
  })
  assert.deepEqual(trailingCodes('V GFO', legend), { rest: '', codes: ['V', 'GFO'] })
  assert.deepEqual(trailingCodes('V shaped bun', legend), { rest: 'V shaped bun', codes: [] })
})

test('short printed badges and add-on lines are recognised', () => {
  for (const badge of ['AKTION', 'EXTREM AKTION', '-33 %']) assert.ok(isBadge(badge), badge)
  for (const text of ['2 € billiger', 'NUR FÜR BILLA IN NÖ UND IM BGLD. ANGEBAUT', 'aus Serbien'])
    assert.ok(!isBadge(text), text)
  assert.ok(isAddOn('Add vegan cheese £1'))
  assert.ok(!isAddOn('Additional Day Guests'))
})
