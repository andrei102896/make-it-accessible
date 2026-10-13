import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import type { KeyDoc } from '../keys.ts'
import { axeSummary } from './axe.ts'
import { pageDom, readSections } from './dom.ts'
import { printedPages } from './layout.ts'
import { altText, productPrices, readingOrder, textFidelity } from './metrics.ts'
import { structureScore } from './tables.ts'
import { coverage, pageTokens } from './coverage.ts'
import type { Word } from '../words.ts'
import type { DocScore, PageScore } from './types.ts'

// words: the text layer per key page, for the reported whole-text coverage.
export async function scoreDocument(
  htmlPath: string,
  key: KeyDoc,
  keyPages: readonly number[],
  words: ReadonlyMap<number, readonly Word[]> = new Map(),
): Promise<DocScore> {
  const browser = await chromium.launch()
  try {
    const tab = await (await browser.newContext()).newPage()
    await tab.goto(pathToFileURL(htmlPath).href)
    const sections = await readSections(tab)
    const printed = printedPages(key, sections, keyPages)
    const axe = await axeSummary(tab)
    const pages = key.pages
      .filter((p) => keyPages.includes(p.keyPage))
      .map((p): PageScore => {
        const dom = pageDom(sections, p.keyPage)
        const c1 = readingOrder(p, dom)
        const c2 = productPrices(p, dom, key.currency)
        const pageWords = words.get(p.keyPage)
        const c3 = {
          ...textFidelity(p, dom),
          coverage: pageWords
            ? coverage(pageTokens(pageWords, [...p.outsideTrim, ...p.mustNotAppear]), [dom.text, ...dom.alts].join(' '))
            : null,
        }
        const c4 = altText(p, dom)
        const c5 = structureScore(p, dom, key.currency)
        const layout = key.sections ? (printed.get(p.keyPage) ?? []) : null
        const full = p.expect === 'content'
        const when = (applies: boolean, ok: boolean): boolean | null => (applies ? ok : null)
        // An unsupported page passes only when it is marked so and publishes no prices.
        const unsupported =
          p.expect === 'unsupported'
            ? dom.unsupported && c2.products === 0 && !dom.containers.some((c) => c.prices.length)
            : null
        return {
          keyPage: p.keyPage,
          c1,
          c2,
          c3,
          c4,
          c5,
          layout,
          decisions: null,
          pass: {
            c1: when(full, c1.textOnly >= 0.95),
            c2: when(p.expect === 'content', c2.errorProducts === 0),
            c3: when(
              full,
              c3.missing.length + c3.altered.length + c3.invented.length <= 1 &&
                !c3.required.length &&
                !c3.outsideTrim.length,
            ),
            c4: when(full, c4.total === 0 || c4.ok / c4.total >= 0.8),
            c5: when(full, c5.rowsOk === c5.rows && !c5.headerErrors.length),
            layout: layout && layout.length === 0,
            unsupported,
          },
        }
      })
    return { pages, axe }
  } finally {
    await browser.close()
  }
}
