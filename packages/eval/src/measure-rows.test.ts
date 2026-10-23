import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { docRow } from './measure-rows.ts'

test("a document's printed lines under contrast count its masthead too; its cut and overlapping boxes are totalled", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mia-rows-'))
  try {
    const html = [
      '<header class="masthead"><h1 style="--x:1;--low:1">Howies</h1></header>',
      '<section data-page="1" style="--ar:595/842"><p style="--x:2;--low:1">a</p><p style="--x:3;--low:1">b</p></section>',
      '<section data-page="2"><p>text view only</p></section>',
    ].join('')
    await writeFile(join(dir, 'index.html'), html)
    await writeFile(join(dir, 'held.json'), '[]')
    const check = join(dir, 'check.log')
    await writeFile(check, 'page: printed: axe ok | text same | boxes cut 7 (prices 2), overlapping 3\n')
    const files = { dir, rebuild: join(dir, 'none'), fidelity: join(dir, 'none'), content: join(dir, 'none'), check }
    const { row, totals } = await docRow(files, [])
    assert.equal(totals['printed lines under contrast'], 3)
    assert.deepEqual(row.view, ['p1 printed lines under contrast: 2', 'masthead printed lines under contrast: 1'])
    assert.deepEqual(
      [totals['printed boxes cut'], totals['printed prices cut'], totals['printed boxes overlapping']],
      [7, 2, 3],
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a document's words styled by their piece, mixed-style lines left unmatched and the spans Text only restyles are totalled", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mia-rows-'))
  try {
    await writeFile(join(dir, 'held.json'), '[]')
    await mkdir(join(dir, 'p01'))
    const run = (i: number, styled: boolean): unknown => ({
      id: `1:${String(i)}`,
      str: 'w',
      box: { x: 0, y: 0, w: 1, h: 1 },
      flow: 0,
      line: 0,
      ...(styled ? { styled: true } : {}),
    })
    const extraction = { pdfPage: 1, width: 10, height: 10, images: [], duplicates: [], unmatched: 2 }
    await writeFile(
      join(dir, 'p01', 'extraction.json'),
      JSON.stringify({ ...extraction, runs: [run(0, true), run(1, true), run(2, false)] }),
    )
    const check = join(dir, 'check.log')
    await writeFile(check, 'page: desktop: axe ok | spans restyled 4 ; phone: axe ok\n')
    const files = { dir, rebuild: join(dir, 'none'), fidelity: join(dir, 'none'), content: join(dir, 'none'), check }
    const { row, totals } = await docRow(files, [])
    assert.deepEqual(
      [
        totals['words styled by their piece'],
        totals['mixed-style lines unmatched'],
        totals['text view spans restyled'],
      ],
      [2, 2, 4],
    )
    assert.ok(row.measures.includes('p01 lines in mixed styles unmatched: 2'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
