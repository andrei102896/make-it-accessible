import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visibleText } from '../html/source.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { reconciled } from './reconcile.ts'
import type { PageStructure, PriceValue, TextValue } from './schema.ts'

// Howies' Waterloo drinks cover: a letter-spaced layer ("PL ACE", "DRINK S"), the model's range one run short.
const words = ['WATERLOO', 'PL', 'ACE', 'DRINK', 'S', 'MENU', 'Slainte!']
const runs: Run[] = words.map((str, i) => ({
  id: `1:${String(i)}`,
  str,
  box: { x: i * 40, y: i < 3 ? 0 : i < 6 ? 20 : 40, w: 36, h: 18 },
  flow: 0,
  line: i < 3 ? 0 : i < 6 ? 1 : 2,
}))
const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
const page = (text: TextValue, dropped: [number, number][] = []): PageStructure => ({
  lang: 'en',
  dropped,
  blocks: [{ kind: 'heading', level: 1, text }],
})
const heading = (p: PageStructure): TextValue => {
  const b = p.blocks[0]
  if (b?.kind !== 'heading') throw new Error('no heading')
  return b.text
}

test('a text cited one run short takes the next run of its line, then shows as the model read it', () => {
  const out = heading(reconciled(page({ src: [[0, 4]], text: 'WATERLOO PLACE DRINKS MENU' }), e))
  assert.deepEqual('src' in out ? out.src : null, [[0, 5]])
  assert.equal(visibleText(out, e), 'WATERLOO PLACE DRINKS MENU')
})

test('never a run another text cites, one on the next line, or one the readings do not need', () => {
  const cited = heading(reconciled(page({ src: [[0, 4]], text: 'WATERLOO PLACE DRINKS MENU' }, [[5, 5]]), e))
  assert.deepEqual('src' in cited ? cited.src : null, [[0, 4]])
  const nextLine = heading(reconciled(page({ src: [[3, 5]], text: 'DRINKS MENU Slainte!' }), e))
  assert.deepEqual('src' in nextLine ? nextLine.src : null, [[3, 5]])
  const whole = heading(reconciled(page({ src: [[0, 2]], text: 'WATERLOO PLACE' }), e))
  assert.deepEqual('src' in whole ? whole.src : null, [[0, 2]])
})

// Star Inn's glass prices: the model labels "£12/125ml," with its own "125ml"; "Bowl 8" shows "$8", so "Bowl" stays.
const priced = (strs: string[], price: PriceValue): PriceValue | undefined => {
  const at = strs.map((str, i): Run => ({
    id: `1:${String(i)}`,
    str,
    box: { x: i * 40, y: 0, w: 36, h: 18 },
    flow: 0,
    line: 0,
  }))
  const p: PageStructure = {
    lang: 'en',
    dropped: [],
    blocks: [{ kind: 'products', items: [{ name: { src: [[0, 0]] }, prices: [price], details: [] }] }],
  }
  const b = reconciled(p, { ...e, runs: at }).blocks[0]
  return b?.kind === 'products' ? b.items[0]?.prices[0] : undefined
}

test('a label repeating words inside its price shown as printed is dropped; one a formatted amount needs is kept', () => {
  const glass = priced(['White Onion', '£12/125ml,'], {
    src: [[1, 1]],
    role: 'current',
    qualifier: { src: [[1, 1]], text: '125ml' },
  })
  assert.equal(glass?.qualifier, undefined)
  const bowl = priced(['Soup', 'Bowl', '8'], { src: [[1, 2]], role: 'current', qualifier: { src: [[1, 1]] } })
  assert.deepEqual(bowl?.qualifier, { src: [[1, 1]] })
  const other = priced(['Wine', '125ml', '£12/125ml'], { src: [[2, 2]], role: 'current', qualifier: { src: [[1, 1]] } })
  assert.deepEqual(other?.qualifier, { src: [[1, 1]] })
})

test('a price given twice alike is one; two citing the same words with different labels both stay', () => {
  const twice = (second: PriceValue): PriceValue[] => {
    const p: PageStructure = {
      lang: 'en',
      dropped: [],
      blocks: [
        {
          kind: 'products',
          items: [{ name: { src: [[0, 0]] }, prices: [{ src: [[1, 1]], role: 'current' }, second], details: [] }],
        },
      ],
    }
    const b = reconciled(p, e).blocks[0]
    return b?.kind === 'products' ? (b.items[0]?.prices ?? []) : []
  }
  assert.equal(twice({ src: [[1, 1]], role: 'current' }).length, 1)
  assert.equal(twice({ src: [[1, 1]], role: 'current', qualifier: { src: [[2, 2]] } }).length, 2)
})
