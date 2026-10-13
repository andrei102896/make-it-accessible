import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eligible, pageFacts, select, type PageFacts } from './selection.ts'
import type { Word } from './words.ts'

const facts = (page: number, f: Partial<PageFacts>): PageFacts => ({
  page,
  layout: 'single',
  words: 200,
  currencyAmounts: 0,
  amounts: 0,
  largeNumbers: 0,
  ...f,
})

test('large separate price glyphs make a page priced even when no word reads as money', () => {
  const small = Array.from({ length: 40 }, (_, i): Word => ({
    str: `word${String(i)}`,
    x: 0,
    y: i,
    w: 10,
    h: 10,
    line: 'l',
  }))
  const prices = ['2', '95', '4', '49', '12'].map((str): Word => ({ str, x: 0, y: 0, w: 10, h: 40, line: 'l' }))
  const f = pageFacts(3, 'single', [...small, ...prices])
  assert.equal(f.currencyAmounts, 0)
  assert.ok(f.largeNumbers >= 3)
  assert.ok(eligible('priced', f, 10, false))
})

test('weights without a currency are prices only in a document that prints no currency at all', () => {
  const weights = facts(4, { amounts: 30 })
  assert.equal(eligible('priced', weights, 10, false), false)
  assert.equal(eligible('priced', weights, 10, true), true)
  assert.equal(eligible('text', weights, 10, false), false)
})

test('selection is fixed by the seed; spares come before the reserve and never overlap it', () => {
  const pages = Array.from({ length: 12 }, (_, i) => facts(i + 1, { currencyAmounts: i % 3 === 0 ? 0 : 5 }))
  const slots = [{ fixed: [1] }, { rule: 'priced' as const, count: 2 }]
  const a = select('seed', 'doc', pages, slots, { spare: 2, reserve: 3 })
  assert.deepEqual(a, select('seed', 'doc', pages, slots, { spare: 2, reserve: 3 }))
  const others = ['s1', 's2', 's3', 's4'].map(
    (seed) => select(seed, 'doc', pages, slots, { spare: 2, reserve: 3 }).picked,
  )
  assert.ok(others.some((o) => JSON.stringify(o) !== JSON.stringify(a.picked)))
  assert.equal(a.picked.length, 3)
  assert.equal(a.spare.length, 2)
  assert.equal(a.reserve.length, 3)
  const chosen = new Set([...a.picked.map((p) => p.pdfPage), ...a.spare, ...a.reserve])
  assert.equal(chosen.size, 8)
})
