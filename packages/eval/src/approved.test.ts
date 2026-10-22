import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PageStructure } from '@make-it-accessible/pipeline/model/schema'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import type { Validation } from '@make-it-accessible/pipeline/validate/validate'
import { APPROVED_FILE, heldOf, readApprovals, wordsAt, type Approval } from './approved.ts'

// Howies Victoria drinks p8: "STILL/SPARKING WATER (330ml /750ml) 2.50/4.25", two sizes paired with two prices.
const words = ['STILL/SPARKING', 'WATER', '330ml', '750ml', '2.50', '4.25']
const e: Extraction = {
  pdfPage: 8,
  width: 595,
  height: 842,
  runs: words.map((str, i) => ({ id: `8:${String(i)}`, str, box: { x: i * 40, y: 0, w: 36, h: 9 }, flow: 0, line: 0 })),
  images: [],
  duplicates: [],
  hidden: [],
}
const structure = (bigger = '4.25'): PageStructure => ({
  lang: 'en',
  dropped: [],
  blocks: [
    {
      kind: 'products',
      items: [
        {
          name: { src: [[0, 1]] },
          prices: [
            { src: [[4, 4]], role: 'current', qualifier: { src: [[2, 2]], text: '330ml' } },
            { src: [[5, 5]], role: 'current', qualifier: { src: [[3, 3]], text: bigger === '4.25' ? '750ml' : '1l' } },
          ],
          details: [],
        },
      ],
    },
  ],
})
const unsure = { path: 'blocks[0].items[0]', problem: 'model unsure: two sizes with two prices' }
const page = (
  s = structure(),
  v: Pick<Validation, 'errors' | 'review' | 'generated'> = { errors: [], review: [unsure], generated: [] },
) => ({
  pdfPage: 8,
  validation: v,
  structure: s,
  extraction: e,
})
const approval = (over: Partial<Approval> = {}): Approval => ({
  pdfPage: 8,
  ...unsure,
  words: wordsAt(structure(), e, unsure.path, unsure.problem) ?? '',
  label: 'STILL / SPARKLING WATER, 330ml 2.50 and 750ml 4.25',
  name: 'Andrei',
  at: '2026-10-22T13:05:00Z',
  ...over,
})

test('an approval releases the review finding whose page, path, problem and published words it names', () => {
  assert.match(wordsAt(structure(), e, unsure.path, unsure.problem) ?? '', /"src":"2\.50".*"text":"330ml"/)
  const { held, checked } = heldOf([8], [page()], [approval()])
  assert.deepEqual(held, [])
  assert.deepEqual(checked, [{ pdfPage: 8, label: approval().label, name: 'Andrei', at: approval().at }])
})

test('another word, path, problem or page keeps it held; changed words say the approval no longer matches', () => {
  for (const other of [{ path: 'blocks[0]' }, { problem: 'model unsure: other' }, { pdfPage: 9 }])
    assert.equal(heldOf([8], [page()], [approval(other)]).held.length, 1, JSON.stringify(other))
  const { held } = heldOf([8], [page(structure('1l'))], [approval()])
  assert.deepEqual(
    held.map((h) => h.problem),
    [unsure.problem, 'an approval recorded for this detail no longer matches its words'],
  )
})

test('an error is never released, even with its path and problem approved; nor the page or a two-path doubt', () => {
  const error = { errors: [unsure], review: [], generated: [] }
  assert.deepEqual(
    heldOf([8], [page(structure(), error)], [approval()]).held.map((h) => h.words),
    [null],
  )
  assert.equal(wordsAt(structure(), e, 'page', 'x'), null)
  assert.equal(wordsAt(structure(), e, unsure.path, 'the price printed beside blocks[1].items[0] fits it better'), null)
  assert.equal(wordsAt(structure(), e, 'blocks[3].items[0]', 'x'), null)
})

test('an approvals file that does not parse applies none, holds the document and never throws', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'approved-'))
  try {
    assert.deepEqual(await readApprovals(dir), { approvals: [], unreadable: false })
    await writeFile(join(dir, APPROVED_FILE), '[{"pdfPage": 8,')
    const read = await readApprovals(dir)
    assert.deepEqual(read, { approvals: [], unreadable: true })
    assert.deepEqual(
      heldOf([8], [page()], read.approvals, read.unreadable).held.map((h) => h.path),
      [APPROVED_FILE, unsure.path],
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a page that did not convert holds its document; alt text alone does not', () => {
  const alt = { errors: [], review: [], generated: [{ path: 'blocks[0]', problem: 'alt text: "a plate"' }] }
  assert.deepEqual(heldOf([8], [page(structure(), alt)]).held, [])
  assert.deepEqual(
    heldOf([8, 9], [page(structure(), alt)]).held.map((h) => h.pdfPage),
    [9],
  )
})
