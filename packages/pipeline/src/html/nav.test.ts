import assert from 'node:assert/strict'
import { test } from 'node:test'
import { navigation } from './nav.ts'

const ui = { contents: 'Contents', sections: 'Sections' }
const toc = (labels: string[]) => labels.map((label, i) => ({ id: `s${String(i)}`, label }))

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
