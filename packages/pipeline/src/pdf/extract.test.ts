import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { moneyFromParts } from '../text/money.ts'
import { extractPage } from './poppler.ts'
import { fitScale } from './raster.ts'
import { centPartner, joinRuns } from './runs.ts'
import type { Extraction } from './types.ts'

const DOCS = join(import.meta.dirname, '..', '..', '..', '..', 'validation', 'testdocs')
const BILLA = join(DOCS, '01_billa_plus_kw41_wien.pdf')
const POLLIN = join(DOCS, '02_pollin_herbstkracher_mailing_2026.pdf')
const HONDA = join(DOCS, '03_honda_uk_lawn_garden_brochure_2019.pdf')
const STONEHOUSE = join(DOCS, '04_stonehouse_hotel_christmas_brochure_2026.pdf')
const BANNATYNE = join(DOCS, '05_bannatyne_hastings_wedding_brochure_2026.pdf')
const BILLA_EXTRACT = join(DOCS, '01_billa_3p.pdf')

const text = (e: Extraction): string => joinRuns(e.runs)

function pricePairs(e: Extraction): number[] {
  return e.runs.flatMap((r) => {
    const cents = centPartner(r, e.runs)
    const value =
      cents &&
      moneyFromParts([
        { str: r.str, height: r.box.h },
        { str: cents.str, height: cents.box.h },
      ])
    return typeof value === 'number' ? [value] : []
  })
}

test(
  'Poppler extraction on the original test PDFs',
  { skip: !existsSync(BILLA) && 'test PDFs are local-only' },
  async () => {
    const billa3 = await extractPage(BILLA, 3)
    const t3 = text(billa3)
    for (const word of ['Karfiol-Laibchen', 'Pfirsich', 'Lay’s', 'Bio-Gouda-'])
      assert.ok(t3.includes(word), `BILLA p3 lacks ${word}`)
    assert.ok(!/Kar!ol|P!rsich/.test(t3), 'BILLA p3 has glyph corruption')
    const prices3 = pricePairs(billa3)
    for (const cents of [229, 239, 329, 299, 69, 145, 489, 370, 179, 249, 279, 699, 79, 499, 899, 129, 495, 225]) {
      assert.ok(prices3.includes(cents), `BILLA p3 price ${cents} not found as a euro/cent pair`)
    }
    assert.ok(
      billa3.images.length >= 20,
      `BILLA p3 has ${billa3.images.length} images, expected one per product at least`,
    )

    const billa8 = await extractPage(BILLA, 8)
    const t8 = text(billa8)
    assert.ok(t8.includes('HENDL-FILET'), 'BILLA p8 lacks HENDL-FILET')
    assert.ok(!/%45|HENDL%FILET|FR!/.test(t8), 'BILLA p8 has glyph corruption')

    const billa6 = await extractPage(BILLA, 6)
    assert.ok(pricePairs(billa6).includes(-10), 'BILLA p6 lacks -0,10 as a pair')

    const extract = await extractPage(BILLA_EXTRACT, 2)
    assert.ok(/Kar!ol/.test(text(extract)), 'the PDFKit extract no longer shows the known corruption')

    const pollin1 = await extractPage(POLLIN, 1)
    assert.ok(/€ 222,- € 199,-/.test(text(pollin1)), 'Pollin p1 lacks "€ 222,- € 199,-"')
    const pollin5 = await extractPage(POLLIN, 5)
    assert.ok(text(pollin5).includes('-,65'), 'Pollin p5 lacks "-,65"')

    const honda9 = await extractPage(HONDA, 9)
    const th = text(honda9)
    assert.equal((th.match(/■/g) ?? []).length, 30, 'Honda p9 ■ count')
    for (const word of ['efficiency', 'benefit', 'fitted']) assert.ok(th.includes(word), `Honda p9 lacks ${word}`)
    // An old label under the green panel is hidden; the visible one printed just above it is not.
    const hiddenWords = honda9.runs.filter((r) => honda9.hidden.includes(r.id)).map((r) => r.str)
    assert.deepEqual(hiddenWords, ['HRX', '537', 'VYEA'])

    const stonehouse1 = await extractPage(STONEHOUSE, 1)
    assert.ok(stonehouse1.runs.length > 0, 'Stone House p1 has no text')
    const bannatyne1 = await extractPage(BANNATYNE, 1)
    assert.ok(bannatyne1.runs.length > 50, 'Bannatyne p1 text layer is nearly empty')

    for (const e of [billa3, billa8, billa6, pollin1, pollin5, stonehouse1, bannatyne1])
      assert.deepEqual(e.hidden, [], `p${e.pdfPage} reports visible text as hidden`)
    for (const e of [billa3, billa8, billa6, pollin1, pollin5, honda9, stonehouse1, bannatyne1]) {
      const size = fitScale(e.width, e.height)
      assert.ok(
        Math.ceil(size.width / 28) * Math.ceil(size.height / 28) <= 4784,
        `p${e.pdfPage} image over the token budget`,
      )
      assert.ok(Math.max(size.width, size.height) <= 2576, `p${e.pdfPage} image over the size limit`)
    }
  },
)
