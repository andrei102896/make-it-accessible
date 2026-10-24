import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Run } from '../pdf/types.ts'
import type { Drawn } from './brand.ts'
import { contrast, fromHex, paper, sameGround } from './color.ts'
import { focusOn, lightMoves, pagesCss } from './ground.ts'
import { FOCUS } from './style.ts'

const run = (color: string, str = 'word'): Run => ({
  id: '1:0',
  str,
  box: { x: 0, y: 0, w: 10, h: 10 },
  flow: 0,
  line: 0,
  color,
})
const drawn: Drawn = {
  text: '#1a1a1a',
  muted: '#555555',
  accent: null,
  painted: [{ selector: '.products.menu .prices, td.num', printed: '#7a5c00', shown: '#6b5000' }],
}
const page = (keyPage: number, ground: string | null, color = '#1a1a1a', fills: string[] = []) => ({
  keyPage,
  ground,
  measured: true,
  runs: [run(color)],
  fills,
})

test("a dark page takes its words' printed colour; the page around it keeps the document's (Ruth's green cover)", () => {
  const css = pagesCss([page(1, '#113d2a', '#e6c45a'), page(2, null)], '#ffffff', drawn)
  assert.match(css, /^@media screen \{/)
  assert.match(
    css,
    /section\[data-page="1"\] \{ background: #113d2a; --bg: #113d2a; --focus: (#[0-9a-f]{6}); --fg: #e6c45a;/,
  )
  assert.match(css, /td\.num:where\(section\[data-page="1"\] \*\) \{ color: #e6c45a; \}/)
  assert.ok(!css.includes('data-page="2"'))
})

test("a ground every page shares is the document's, and the document's own ground is no page's", () => {
  assert.equal(pagesCss([page(1, '#212c46'), page(2, '#212c46')], '#ffffff', drawn), '')
  assert.equal(pagesCss([page(1, '#faf5e3'), page(2, null)], '#f8f8e8', drawn), '')
  // A ground in a panel's colour is the panels' (Gigi's grey), not the page's.
  assert.equal(pagesCss([page(1, '#ebebeb', '#1a1a1a', ['#ebebeb']), page(2, null)], '#ffffff', drawn), '')
  assert.ok(sameGround(fromHex('#faf5e3'), fromHex('#f8f8e8')) && !sameGround(fromHex('#ebebeb'), fromHex('#ffffff')))
  assert.ok(paper(fromHex('#fbfbfb')) && !paper(fromHex('#f8f8e8')))
})

test('on a light ground a colour keeps its print where it reads, else moves; the focus ring reads at 3:1', () => {
  const [rule] = lightMoves(drawn, fromHex('#ebebeb'), '.x')
  assert.equal(rule, '.products.menu .prices:where(.x *), td.num:where(.x *) { color: #7a5c00; }')
  for (const g of ['#a55b42', '#ffffff', '#113d2a', '#ebebeb', '#fff200'])
    assert.ok(contrast(fromHex(focusOn(fromHex(g))), fromHex(g)) >= 3, g)
  assert.equal(focusOn(fromHex('#ffffff')), FOCUS)
})

test('on a dark page a colour printed light enough keeps its print; the rest take the page ink', () => {
  const both: Drawn = {
    ...drawn,
    painted: [...drawn.painted, { selector: '.products.menu .name', printed: '#f0e68c', shown: '#7a6f10' }],
  }
  const css = pagesCss([page(1, '#113d2a', '#f8dd07'), page(2, null)], '#ffffff', both)
  assert.match(css, /td\.num:where\(section\[data-page="1"\] \*\) \{ color: #f8dd07; \}/)
  assert.match(css, /\.products\.menu \.name:where\(section\[data-page="1"\] \*\) \{ color: #f0e68c; \}/)
})

test("a ground every measured page shares is the document's even when a page's panels draw it (Carew p2)", () => {
  assert.equal(
    pagesCss([page(1, '#212c46', '#ffffff'), page(2, '#212c46', '#ffffff', ['#212c46'])], '#ffffff', drawn),
    '',
  )
  // A page with no backdrop is not counted: the other page's ground is still the document's.
  assert.equal(pagesCss([page(1, '#212c46'), { ...page(2, null), measured: false }], '#ffffff', drawn), '')
})

test('a light page ground restates the text and moves each colour on it', () => {
  const css = pagesCss([page(1, '#d6c3a5'), page(2, null)], '#ffffff', drawn)
  assert.match(
    css,
    /section\[data-page="1"\] \{ background: #d6c3a5; --bg: #d6c3a5; --focus: #1d4ed8; --fg: #1a1a1a; color: #1a1a1a;/,
  )
  assert.match(css, /td\.num:where\(section\[data-page="1"\] \*\) \{ color: #[0-9a-f]{6}; \}/)
})
