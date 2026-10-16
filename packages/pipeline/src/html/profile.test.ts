import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import { profileOf } from './profile.ts'

const run = (i: number, str: string, key: string, size: number, color = '#000000', y = i * 20): Run => ({
  id: `1:${String(i)}`,
  str,
  box: { x: 50, y, w: 100, h: size },
  flow: 0,
  line: i,
  color,
  font: { key, size, weight: key === 'stencil' ? 700 : 400, italic: false },
})
// A Kendells-like page: a red stencil section title and a black condensed heading the model put on one level.
const runs = [
  run(0, 'POISSONS', 'stencil', 23, '#dd2931'),
  run(1, 'LES', 'oswald', 17),
  run(2, 'ENTRÉES', 'oswald', 17),
  run(3, 'SOUPE', 'oswald', 11),
  run(4, 'fish', 'josefinsans', 14),
  run(5, 'soup', 'josefinsans', 14),
  run(6, '12.50', 'josefinsans', 14),
]
const extraction: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
const structure = parsePage(
  JSON.stringify({
    lang: 'en',
    blocks: [
      { kind: 'heading', level: 2, text: { src: [[0, 0]] } },
      { kind: 'heading', level: 2, text: { src: [[1, 2]] } },
      {
        kind: 'products',
        items: [
          {
            name: { src: [[3, 3]] },
            prices: [{ src: [[6, 6]] }],
            details: [{ kind: 'paragraph', text: { src: [[4, 5]] } }],
          },
        ],
      },
    ],
    dropped: [],
  }),
)

test('headings keep their printed signature even on one level; roles take their words; the accent is the red', () => {
  const p = profileOf([{ structure, extraction }])
  if (!p) throw new Error('no profile')
  assert.equal(p.signatures.length, 2)
  assert.deepEqual(
    p.signatures.map((s) => [s.face.key, s.size, s.color]),
    [
      ['stencil', 23, '#dd2931'],
      ['oswald', 17, '#000000'],
    ],
  )
  assert.equal(p.headings.get('0:blocks[0]'), 0)
  assert.equal(p.headings.get('0:blocks[1]'), 1)
  const name = p.roles.name
  assert.ok(name)
  assert.equal(name.face.key, 'oswald')
  assert.equal(name.caps, true)
  assert.equal(p.roles.desc?.face.key, 'josefinsans')
  assert.equal(p.body, 14)
  assert.equal(p.accent, '#dd2931')
  assert.equal(p.itemBoxes[0]?.boxes.length, 1)
})

test('a role whose items show the small-caps patterns in a quarter of cases is a small-caps face', () => {
  // Eight names: "C"+"URRIED" style (an initial capital touching smaller capitals) in three, plain in five.
  const words: [string, number][][] = [
    [
      ['C', 12],
      ['URRIED', 9],
    ],
    [
      ['M', 12],
      ['USSELS', 9],
    ],
    [
      ['S', 12],
      ['ALAD', 9],
    ],
    [['Soup', 10]],
    [['Bread', 10]],
    [['Fries', 10]],
    [['Steak', 10]],
    [['Cake', 10]],
  ]
  const runs: Run[] = []
  const items = words.map((ws) => {
    const from = runs.length
    let x = 10
    for (const [str, size] of ws) {
      runs.push({
        ...run(runs.length, str, 'betont', size, '#000000', 20 * words.indexOf(ws)),
        box: { x, y: 0, w: str.length * 6, h: size },
        line: words.indexOf(ws),
      })
      x += str.length * 6
    }
    return { name: { src: [[from, runs.length - 1]] }, prices: [] }
  })
  const e: Extraction = { pdfPage: 1, width: 600, height: 800, runs, images: [], duplicates: [], hidden: [] }
  const s = parsePage(JSON.stringify({ lang: 'en', blocks: [{ kind: 'products', items }], dropped: [] }))
  assert.equal(profileOf([{ structure: s, extraction: e }])?.roles.name?.smallCaps, true)
  // Two of eight, or three of three, are not enough.
  const few = parsePage(
    JSON.stringify({ lang: 'en', blocks: [{ kind: 'products', items: items.slice(1) }], dropped: [] }),
  )
  assert.equal(profileOf([{ structure: few, extraction: e }])?.roles.name?.smallCaps, false)
  const three = parsePage(
    JSON.stringify({ lang: 'en', blocks: [{ kind: 'products', items: items.slice(0, 3) }], dropped: [] }),
  )
  assert.equal(profileOf([{ structure: three, extraction: e }])?.roles.name?.smallCaps, false)
})

test('without fonts on the runs (saved runs) there is no profile', () => {
  const bare = {
    ...extraction,
    runs: runs.map((r) => {
      const copy = { ...r }
      delete copy.font
      return copy
    }),
  }
  assert.equal(profileOf([{ structure, extraction: bare }]), null)
})
