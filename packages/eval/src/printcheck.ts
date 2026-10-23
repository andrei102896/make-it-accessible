import type { HtmlPage } from '@make-it-accessible/pipeline/html/document'
import { fitPlaced } from './fit.ts'
import { degraded } from '@make-it-accessible/pipeline/degraded'

// Why a page that could print shows the text view instead: its transparent text would not fit or would collide
// (fit.ts), so it would be selected or read under the pointer away from its printed words, or it was not checked.
export type TextWhy = 'misfit' | 'not-checked'
export type PrintCheck = { text: Map<number, TextWhy> }

// Fit, and send a page that misfits or cannot be checked to the text view (Andrei, 2026-10-18), until nothing
// changes: the shipped page is the checked one.
export async function checkPrinted(
  htmlPath: string,
  docDir: string,
  pages: HtmlPage[],
  write: () => Promise<void>,
): Promise<PrintCheck> {
  const text = new Map<number, TextWhy>()
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
    if (!judged.size) break
    for (const [page, reason] of judged) {
      console.info(`${docDir} p${String(page)}: text view, ${reason}`)
      text.set(page, reason)
    }
    for (const p of pages) if (judged.has(p.keyPage)) p.backdrop = null
    await write()
  }
  return { text }
}
