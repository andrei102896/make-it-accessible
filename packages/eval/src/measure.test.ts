import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diff, sealedOf, type Baseline, type SetResult } from './measure-diff.ts'
import { clean, type Ran } from './measure-jobs.ts'
import { cleanLines, emptyRow, type DocRow } from './measure-rows.ts'
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
      `${dir}/index.html: pdf-1 lacks a letter of "x"\nfig: 2 pages in 14 s\n${dir} p1: text view, misfit\n`,
      dir,
    ),
    ['index.html: pdf-1 lacks a letter of "x"', '. p1: text view, misfit'],
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
