import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { LIMITS } from './preflight.ts'
import { copyForbidden, extractPage, printedWord } from './poppler.ts'
import { fitScale } from './raster.ts'
import { joinRuns } from './runs.ts'
import type { Extraction } from './types.ts'

// The stage-0 corpus holds retail leaflets past the product's 20 pages (pdf/preflight.ts); extraction is tested on them.
const CORPUS = { ...LIMITS, pages: 100 }

const DOCS = join(import.meta.dirname, '..', '..', '..', '..', 'validation', 'testdocs')
const POLLIN = join(DOCS, '02_pollin_herbstkracher_mailing_2026.pdf')
const HONDA = join(DOCS, '03_honda_uk_lawn_garden_brochure_2019.pdf')
const STONEHOUSE = join(DOCS, '04_stonehouse_hotel_christmas_brochure_2026.pdf')
const BANNATYNE = join(DOCS, '05_bannatyne_hastings_wedding_brochure_2026.pdf')

const text = (e: Extraction): string => joinRuns(e.runs)

test(
  'Poppler extraction on the original test PDFs',
  { skip: !existsSync(POLLIN) && 'test PDFs are local-only' },
  async () => {
    const pollin1 = await extractPage(POLLIN, 1, CORPUS)
    assert.ok(/€ 222,- € 199,-/.test(text(pollin1)), 'Pollin p1 lacks "€ 222,- € 199,-"')
    const pollin5 = await extractPage(POLLIN, 5, CORPUS)
    assert.ok(text(pollin5).includes('-,65'), 'Pollin p5 lacks "-,65"')

    const honda9 = await extractPage(HONDA, 9, CORPUS)
    const th = text(honda9)
    assert.equal((th.match(/■/g) ?? []).length, 30, 'Honda p9 ■ count')
    for (const word of ['efficiency', 'benefit', 'fitted']) assert.ok(th.includes(word), `Honda p9 lacks ${word}`)
    // An old label under the green panel is hidden; the visible one printed just above it is not.
    const hiddenWords = honda9.runs.filter((r) => honda9.hidden.includes(r.id)).map((r) => r.str)
    assert.deepEqual(hiddenWords, ['HRX', '537', 'VYEA'])

    const stonehouse1 = await extractPage(STONEHOUSE, 1, CORPUS)
    assert.ok(stonehouse1.runs.length > 0, 'Stone House p1 has no text')
    const bannatyne1 = await extractPage(BANNATYNE, 1, CORPUS)
    assert.ok(bannatyne1.runs.length > 50, 'Bannatyne p1 text layer is nearly empty')

    for (const e of [pollin1, pollin5, stonehouse1, bannatyne1])
      assert.deepEqual(
        e.runs.filter((r) => e.hidden.includes(r.id) && r.str.trim()).map((r) => r.str),
        [],
        `p${e.pdfPage} reports visible text as hidden`,
      )
    for (const e of [pollin1, pollin5, honda9, stonehouse1, bannatyne1]) {
      const size = fitScale(e.width, e.height)
      assert.ok(
        Math.ceil(size.width / 28) * Math.ceil(size.height / 28) <= 4784,
        `p${e.pdfPage} image over the token budget`,
      )
      assert.ok(Math.max(size.width, size.height) <= 2576, `p${e.pdfPage} image over the size limit`)
    }
  },
)

test("a PDF whose owner forbids copying its text is recognised from pdfinfo's report (Hogfish)", () => {
  assert.equal(
    copyForbidden(
      'Pages:           2\nEncrypted:       yes (print:yes copy:no change:no addNotes:yes algorithm:AES)\n',
    ),
    true,
  )
  assert.equal(copyForbidden('Encrypted:       yes (print:yes copy:yes change:no addNotes:no algorithm:AES)\n'), false)
  assert.equal(copyForbidden('Encrypted:       no\n'), false)
})

test("a text layer's control characters print nothing and a tab is spacing", () => {
  assert.deepEqual(['\u00037.40', 'vodka\u0003', '\b', 'spritz\t\t13'].map(printedWord), [
    '7.40',
    'vodka',
    '',
    'spritz  13',
  ])
})
