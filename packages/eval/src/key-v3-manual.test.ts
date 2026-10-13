import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claims, local, problemsOf } from './key-v3-fixture.ts'

test(
  'manual amounts are confirmed, consistent and claimed; split parts are claimed as prices',
  { skip: !local && 'local only' },
  async () => {
    const image = { source: 'image', printed: '£99', cents: 9900, currency: 'GBP' }
    const withImage =
      (m: Record<string, unknown>) =>
      (_: Record<string, unknown>, page: Record<string, unknown>): void => {
        page.manual = { m1: m }
        page.occurrences = { ...claims(page), m1: { kind: 'price', product: 'p1', role: 'current' } }
      }
    assert.match(await problemsOf(withImage(image)), /manual amount m1 "£99" awaits Andrei's confirmation/)
    assert.doesNotMatch(await problemsOf(withImage({ ...image, confirmed: true })), /m1/)
    assert.match(
      await problemsOf(withImage({ ...image, cents: 9800, confirmed: true })),
      /m1: "£99" reads as 9900, not 9800/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.manual = { m1: { ...image, confirmed: true } }
      }),
      /m1 "£99" is not claimed/,
    )
    const split = (_: Record<string, unknown>, page: Record<string, unknown>): void => {
      page.manual = {
        m1: { ...image, source: 'split', words: [0], confirmed: true },
        m2: { ...image, source: 'split', words: [0], confirmed: true },
      }
      page.occurrences = {
        ...claims(page),
        o1: { kind: 'split', into: ['m1', 'm2'] },
        m1: { kind: 'price', product: 'p1', role: 'current' },
        m2: { kind: 'notPrice', reason: 'test' },
      }
    }
    assert.match(
      await problemsOf(split),
      /manual amount m2 is claimed as notPrice[\s\S]*the parts of o1 must cite each of its words exactly once/,
    )
  },
)

test(
  'a merged occurrence needs the whole value confirmed on its partner; values read as themselves',
  { skip: !local && 'local only' },
  async () => {
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = { ...claims(page), o2: { kind: 'merged', into: 'o1' } }
      }),
      /o2 merge into o1, whose claim must carry the whole, confirmed value/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.occurrences = {
          ...claims(page),
          o1: {
            kind: 'price',
            product: 'p1',
            role: 'current',
            value: { printed: '£1', cents: 200, currency: 'GBP' },
            misread: 'confirmed',
          },
        }
      }),
      /o1: "£1" reads as 100, not 200/,
    )
  },
)

test(
  'reading-order entries may name the n-th occurrence of a repeated anchor',
  { skip: !local && 'local only' },
  async () => {
    assert.doesNotMatch(
      await problemsOf((_, page) => {
        page.readingOrder = [[{ anchor: 'Cosy', kind: 'text', occurrence: 2 }]]
      }),
      /Cosy/,
    )
    assert.match(
      await problemsOf((_, page) => {
        page.readingOrder = [[{ anchor: 'Cosy', kind: 'text', occurrence: 9 }]]
      }),
      /"Cosy" occurs \d+ times, not 9/,
    )
  },
)

test(
  'a price only in the image may sit in a table cell, with the same confirmation as anywhere else',
  { skip: !local && 'local only' },
  async () => {
    const inCell =
      (cell: string) =>
      (_: Record<string, unknown>, page: Record<string, unknown>): void => {
        page.tables = [{ header: ['Room', 'Price'], rows: [['Cosy Double', cell]] }]
        page.manual = { m1: { source: 'image', printed: '£99', cents: 9900, currency: 'GBP', confirmed: true } }
        page.occurrences = { ...claims(page), m1: { kind: 'cell', table: 0, row: 0, col: 1 } }
      }
    assert.equal(await problemsOf(inCell('£99')), '')
    assert.match(await problemsOf(inCell('£98')), /m1 "£99" does not read as cell 0\.0\.1/)
  },
)
