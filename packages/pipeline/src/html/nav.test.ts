import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import { listedHeadings, navigation, titleWordsOf } from './nav.ts'

const ui = { contents: 'Contents', sections: 'Sections' }
const toc = (labels: string[]) => labels.map((label, i) => ({ id: `s${String(i)}`, label, name: label }))

test('few short section chips are pinned; long or many labels are not, and many fold on a phone', () => {
  const short = navigation('menu', toc(['Starters', 'Mains', 'Desserts']), false, ui)
  assert.match(short, /^<nav class="chips pinned" id="contents"/)
  assert.doesNotMatch(short, /chips-fold/)
  const long = navigation(
    'menu',
    toc(['Carmine’s handcrafted specialty cocktails', 'Little Italy in Ybor City', 'House made sides', 'Hand helds']),
    false,
    ui,
  )
  assert.match(long, /^<nav class="chips" id="contents"/)
  const many = navigation('menu', toc(Array.from({ length: 12 }, (_, i) => `S${String(i)}`)), false, ui)
  assert.match(many, /<details class="chips-fold" aria-label="Sections"><summary>Sections \(12\)<\/summary><ul>/)
  assert.equal((many.match(/<li>/g) ?? []).length, 24)
})

// Headings and blocks as the model gives them; a heading's words read from the image for brevity.
const blocks = (...parts: (string | [string, number])[]) =>
  parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: parts.map((p) =>
        Array.isArray(p)
          ? { kind: 'heading', level: p[1], text: { seen: p[0] } }
          : p === 'list'
            ? { kind: 'products', items: [{ name: { src: [[0, 0]] }, prices: [] }] }
            : { kind: p, text: { seen: 'words' } },
      ),
      dropped: [],
    }),
  ).blocks
const listed = (title: string, menu: boolean, ...parts: (string | [string, number])[]) => [
  ...listedHeadings(blocks(...parts), (b) => ('seen' in b.text ? b.text.seen : ''), titleWordsOf(title), menu),
]

test('a page title over its sections hands the chips to them; a sentence is no section; a menu cover has none', () => {
  const gigi: [string, number] = ['Gigi Hudson Valley Easy Entertaining', 1]
  assert.deepEqual(
    listed('Gigi Trattoria', true, gigi, 'paragraph', ['SALADS', 2], 'list', ['Speciale', 2], 'paragraph'),
    [2, 4],
  )
  const notice: [string, number] = ["If we are out of something, don't worry, it's half price.", 2]
  assert.deepEqual(listed("Kenny & Ziggy's", true, ['DINNERS', 2], 'list', notice, 'list'), [0])
  // A heading naming the place that heads its own list is a section ("SARGE'S FAMOUS BURGERS").
  assert.deepEqual(listed("Sarge's Deli", true, ["SARGE'S FAMOUS BURGERS", 2], 'paragraph', 'list'), [0])
  const noshes: [string, number] = ["SARGE'S NOSHES, FRANKS, & APPETIZERS", 2]
  assert.deepEqual(listed("Sarge's Deli", true, ['SMOKED FISH', 2], 'list', noshes, ['CLASSICS', 3], 'list'), [0, 2])
  assert.deepEqual(listed('Gigi Trattoria', true, ['EASY ENTERTAINING', 1], 'paragraph'), [])
  assert.deepEqual(listed('Stone House', false, ['Booking Information', 2], 'paragraph'), [0])
})
