import { chromium } from 'playwright'
import type { HtmlPage } from '@make-it-accessible/pipeline/html/document'
import { judgePage, type Kind, type Misinforming } from '@make-it-accessible/pipeline/pdf/fidelity-verdict'
import { measureDocument, type PageFidelity } from './fidelity-measure.ts'
import { fitPlaced } from './fit.ts'
import { degraded } from '@make-it-accessible/pipeline/degraded'

// Why a page that could print shows the text view instead: its text would not fit or collide (fit.ts), the
// fidelity verdict found it misinforming (fidelity-verdict.ts), or it could not be compared with its PDF.
export type TextWhy = 'misfit' | Misinforming | 'not-checked'
export type PrintCheck = { text: Map<number, TextWhy>; cosmetic: Set<Kind> }

// Fit, measure, and send a page that misfits, misinforms or cannot be measured to the text view (Andrei, 2026-10-18),
// until nothing changes: the shipped page is the measured one. Returns the cosmetic findings of the pages left printed.
export async function checkPrinted(
  pdfPath: string,
  htmlPath: string,
  docDir: string,
  pages: HtmlPage[],
  write: () => Promise<void>,
): Promise<PrintCheck> {
  const text = new Map<number, TextWhy>()
  const cosmetic = new Set<Kind>()
  // Each round sends at least one page to the text view or ends: at most one round a page, and a last one.
  for (let round = 0; round <= pages.length; round++) {
    const shown = new Set(pages.flatMap((p) => (p.backdrop ? [p.keyPage] : [])))
    // A stuck fit (its deadline) leaves the document unchecked: every printed page goes to Text only, the set goes on.
    const misfits = await fitPlaced(htmlPath).catch((error: unknown) => {
      degraded(`${docDir}: fit failed (${error instanceof Error ? error.message : String(error)})`)
      return [...shown].map((page) => ({ page, why: 'not-checked' as const }))
    })
    const judged = new Map<number, TextWhy>()
    for (const m of misfits)
      if (shown.has(m.page)) judged.set(m.page, m.why === 'not-checked' ? 'not-checked' : 'misfit')
      // A masthead's text placed over a page already in Text only (or never printed) is logged, not judged again.
      else console.error(`${docDir} p${String(m.page)}: still misplaced after the fallback, ${m.why}`)
    const printed = [...shown].filter((page) => !judged.has(page))
    const found = new Set<Kind>()
    if (!judged.size && printed.length) {
      const measured = await measureTwice(pdfPath, docDir)
      for (const page of printed) {
        const f = measured?.find((m) => m.keyPage === page)
        if (!f || 'skipped' in f) {
          judged.set(page, 'not-checked')
          continue
        }
        const v = judgePage(f)
        const first = v.misinforming[0]
        if (first) {
          judged.set(page, first.kind)
          const line = f.lines[first.lines[0] ?? -1]
          console.info(`${docDir} p${String(page)}: ${first.kind} first at ${JSON.stringify(line?.text ?? '')}`)
        } else for (const c of v.cosmetic) found.add(c.kind)
      }
    }
    if (!judged.size) {
      for (const k of found) cosmetic.add(k)
      break
    }
    for (const [page, reason] of judged) {
      console.info(`${docDir} p${String(page)}: text view, ${reason}`)
      text.set(page, reason)
    }
    for (const p of pages) if (judged.has(p.keyPage)) p.backdrop = null
    await write()
  }
  return { text, cosmetic }
}

// The document measured once, again after a failure (a stalled pdf.js); null when both fail: every page unchecked.
async function measureTwice(pdfPath: string, docDir: string): Promise<PageFidelity[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await chromium.launch()
    try {
      return await measureDocument(browser, docDir, pdfPath)
    } catch (error) {
      degraded(`${docDir}: fidelity not measured (${error instanceof Error ? error.message : String(error)})`)
    } finally {
      await browser.close()
    }
  }
  return null
}
