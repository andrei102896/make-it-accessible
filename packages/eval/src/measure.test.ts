import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backdropParts, backdropsCompared, webpSize } from './measure-backdrop.ts'
import { diff, sealedOf, type Baseline, type SetResult } from './measure-diff.ts'
import { clean, type Ran } from './measure-jobs.ts'
import { cleanLines, emptyRow, type DocRow } from './measure-rows.ts'
import { emptyGrid } from './measure-grid-fixture.ts'
import type { Grid } from '@make-it-accessible/pipeline/pdf/backdrop'
import { ROOT } from './paths.ts'

const ran = (over: Partial<Ran>): Ran => ({
  job: { name: 'x', args: [], log: '' },
  code: 0,
  slept: false,
  degraded: [],
  started: 0,
  ms: 1,
  ...over,
})

test('a result is read only when its job ran awake, without a fallback, and ended well', () => {
  assert.ok(clean(ran({})))
  assert.ok(!clean(ran({ slept: true })))
  assert.ok(!clean(ran({ degraded: ['DEGRADED fit failed'] })))
  assert.ok(!clean(ran({ code: 1 })))
  assert.ok(!clean(ran({ code: null })))
})

test("a log line reads the same on every machine: paths cut, a step's timing dropped", () => {
  const dir = `${ROOT}/out/rebuilt/fig`
  assert.deepEqual(
    cleanLines(
      `${dir}/p01/backdrop.json: written\nfig: 2 pages in 14 s\n${dir} p1: pdf.js did not draw the backdrop\n`,
      dir,
    ),
    ['p01/backdrop.json: written', '. p1: pdf.js did not draw the backdrop'],
  )
})

const row = (over: Partial<DocRow>): DocRow => ({ ...emptyRow(), ...over })
const set = (docs: Record<string, Partial<DocRow>>, held = 0): SetResult => ({
  docs: Object.fromEntries(
    Object.entries(docs).map(([s, r]) => [s, { row: row(r), totals: { 'held findings': held } }]),
  ),
  fidelity: [],
})
const round = (sets: Baseline['sets'], quick = false): Baseline => ({
  tree: 't',
  head: 'h',
  at: '',
  quick,
  sets,
  rescore: [],
})

test('the diff reads what fell back first and changed pages last, and names the pages to open', () => {
  const was = round({ working: set({ fig: { held: ['p1 a: b'], pages: ['p01 files aaa'] } }) })
  const now = round({ working: set({ fig: { problems: ['DEGRADED x'], pages: ['p01 files bbb'] } }, 1) })
  const { shown, open } = diff(now, was)
  const at = (s: string): number => shown.findIndex((l) => l.startsWith(`  ${s}:`))
  assert.ok(at('problems') < at('held') && at('held') < at('pages'), shown.join('\n'))
  assert.ok(shown.includes('  * held findings: 1 (was 0)'))
  assert.deepEqual(open, ['fig p1'])
})

test('the sealed half is counted, never named nor quoted', () => {
  const sealed = (h: string): SetResult => sealedOf(set({ 'secret-diner': { held: [h] } }))
  const { full } = diff(
    round({ 'verify-sealed': sealed('p1 "Lobster roll" unsure') }),
    round({ 'verify-sealed': sealed('p1 old') }),
  )
  const text = full.join('\n')
  assert.ok(text.includes('held: 1 documents changed'))
  assert.ok(!text.includes('secret') && !text.includes('Lobster'), text)
})

test('a quick round is compared on its own documents only', () => {
  const was = round({ working: set({ fig: {}, gigi: { held: ['p1 a: b'] } }, 2) })
  const { shown } = diff(round({ working: set({ fig: {} }, 2) }, true), was)
  assert.ok(!shown.some((l) => l.includes('gigi')) && shown.includes('    held findings: 2'), shown.join('\n'))
})

const grid = (mean: string, min = 0.5, cols = 2): Grid => ({
  ...emptyGrid(cols),
  min: Array<number>(cols).fill(min),
  max: Array<number>(cols).fill(1),
  mean: Array<string>(cols).fill(mean),
})
const line = (g: Grid): string => backdropParts('p01', g, null, null).line

test("a backdrop is compared by its cells within the drift, never by its WebP's bytes", () => {
  const was = [line(grid('#808080')), 'p01 files aaa']
  const same = (now: string[]): boolean => {
    const [x, y] = backdropsCompared(now, was)
    return x.length === y.length && x.every((l) => y.includes(l))
  }
  assert.ok(same([line(grid('#838080', 0.505)), 'p01 files aaa']))
  assert.deepEqual(backdropsCompared([line(grid('#848080')), 'p01 files aaa'], was)[0], [
    'p01 files aaa',
    'p01 backdrop: 2 cells past 3 (largest 4)',
  ])
  assert.ok(
    backdropsCompared([line(grid('#808080', 0.5, 3))], was)[0].includes(
      'p01 backdrop: sizes 2x1 none none → 3x1 none none',
    ),
  )
  assert.deepEqual(backdropsCompared(['p01 files aaa'], was)[0], ['p01 files aaa', 'p01 backdrop: none, drawn before'])
  assert.deepEqual(backdropsCompared([line(grid('#808080'))], [])[0], ['p01 backdrop: drawn, none before'])
  // A document this round did not build opens nothing.
  assert.deepEqual(backdropsCompared([], was)[0], [])
  const { open } = diff(
    round({ working: set({ fig: { pages: [line(grid('#ffffff'))] } }) }),
    round({ working: set({ fig: { pages: was.slice(0, 1) } }) }),
  )
  assert.deepEqual(open, ['fig p1'])
})

test("a backdrop's grid fields leave the folder's hash; its sizes come from the WebP header", () => {
  assert.equal(
    backdropParts('p01', grid('#808080'), null, null).rest,
    backdropParts('p01', grid('#000000', 0), null, null).rest,
  )
  const webp = (kind: string, at: number, write: (b: Buffer) => void): Buffer => {
    const b = Buffer.alloc(30)
    b.write('RIFF', 0)
    b.write(`WEBP${kind}`, 8)
    write(b.subarray(at))
    return b
  }
  const vp8x = webp('VP8X', 24, (b) => {
    b.writeUIntLE(1983, 0, 3)
    b.writeUIntLE(2805, 3, 3)
  })
  const vp8 = webp('VP8 ', 26, (b) => {
    b.writeUInt16LE(992, 0)
    b.writeUInt16LE(1403, 2)
  })
  const vp8l = webp('VP8L', 21, (b) => b.writeUInt32LE(991 | (1402 << 14), 0))
  assert.deepEqual([vp8x, vp8, vp8l].map(webpSize), ['1984x2806', '992x1403', '992x1403'])
  assert.equal(webpSize(Buffer.from('not a webp, thirty bytes long..')), 'none')
})
