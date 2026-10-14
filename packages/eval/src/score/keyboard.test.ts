import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { renderDocument } from '@make-it-accessible/pipeline/html/document'
import { parsePage } from '@make-it-accessible/pipeline/model/schema'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { keyboardReport } from './keyboard.ts'

const words = ['Starters', 'Soup', '£5', 'Mains', 'Pie', '£12', 'Sides', 'Chips', '£3', 'Size', 'Price']
const extraction: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: words.map((str, i) => ({
    id: `1:${String(i)}`,
    str,
    box: { x: 10, y: i * 20, w: 40, h: 10 },
    flow: 0,
    line: i,
  })),
  images: [],
  duplicates: [],
  hidden: [],
}
const section = (h: number, item: number, price: number) => [
  { kind: 'heading', level: 1, text: { src: [[h, h]] } },
  { kind: 'products', items: [{ name: { src: [[item, item]] }, prices: [{ src: [[price, price]] }] }] },
]
const page = (keyPage: number) => ({
  keyPage,
  structure: parsePage(
    JSON.stringify({
      lang: 'en',
      blocks: [
        ...section(0, 1, 2),
        ...section(3, 4, 5),
        ...section(6, 7, 8),
        {
          kind: 'table',
          rows: [
            [
              { text: { src: [[9, 9]] }, header: 'col' },
              { text: { src: [[10, 10]] }, header: 'col' },
            ],
          ],
        },
      ],
    }),
  ),
  extraction,
  flagged: [],
  imageSrc: () => undefined,
})

test('every link and scroll region of a long menu is reachable by Tab, ringed and never under the section bar', async () => {
  const html = renderDocument({ lang: 'en', title: 'Menu', kind: 'menu', pages: [page(1), page(2)] })
  const path = join(await mkdtemp(join(tmpdir(), 'mia-kb-')), 'index.html')
  await writeFile(path, html)
  const report = await keyboardReport(path)
  assert.deepEqual({ ...report, stops: report.stops > 0 }, { stops: true, unreachable: [], noRing: [], obscured: [] })
  // Skip link, three section links, two tables as scroll regions, two links back to the sections.
  assert.equal(report.stops, 8)
})
