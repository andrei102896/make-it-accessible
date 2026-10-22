import { z } from 'zod'
import type { Kind } from '@make-it-accessible/pipeline/pdf/fidelity-verdict'
import type { Held } from './preview.ts'
import type { PrintCheck, TextWhy } from './printcheck.ts'

// report.json beside held.json: per page which layout it opens in and why, in the owner's words (CLIENT_FLOW §5),
// and how many of its details wait for their confirmation; never "compliant" or "certified".
export const REPORT_FILE = 'report.json'

const Page = z.object({
  page: z.number(),
  view: z.enum(['printed', 'text', 'none']),
  why: z.string().nullable(),
  open: z.array(z.object({ path: z.string(), problem: z.string() })),
  say: z.string().nullable(),
})
const Report = z.object({ pages: z.array(Page), notes: z.array(z.string()) })
export type Report = z.infer<typeof Report>
export const parseReport = (raw: string): Report => Report.parse(JSON.parse(raw))

// The page's switch reads "As printed" / "Text only" (html/strings.ts): the owner finds it by those words.
const OPENS_AS_TEXT = 'opens as Text only, where every word reads clearly.'
// Why a page shows Text only: one sentence after "Page N opens as Text only…".
const WHY: Record<TextWhy | 'scan' | 'no-print', string> = {
  misfit: 'As printed, some words would not have fitted where your PDF prints them.',
  'price-moved': 'As printed, a price would have stood away from the dish or size it belongs to.',
  'price-unshown': 'As printed, a price would not have shown where your PDF prints it.',
  vanished: 'As printed, some words would have been hard to see, or missing, where your PDF prints them.',
  doubled: "As printed, some words would have carried a shadow or blur your PDF doesn't have.",
  'not-checked': "We couldn't compare this page with your PDF.",
  scan: 'This page is a picture of the menu, so we read its words rather than redraw them.',
  'no-print': "We couldn't draw this page's printed layout.",
}
// The details still differing from the print on pages kept As printed, named once per document.
const COSMETIC: Record<Kind, string | null> = {
  ragged: 'some lines sit a little off their column',
  narrower: 'the letter spacing of some lines',
  'drawing-missing': 'a dotted line or frame',
  'ground-differs': 'a shaded panel behind some words',
  'price-moved': null,
  'price-unshown': null,
  vanished: null,
  doubled: null,
}
const listed = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}` : (items[0] ?? '')

// A page that did not convert is listed too: it is open until it does (`converted: false`).
export type ReportPage = { keyPage: number; pdfPage: number; printed: boolean; scan: boolean; converted: boolean }

// `printed`: pages that kept the printed view; `check`: why the others lost it (printcheck.ts); `held`: open content.
export function reportOf(pages: readonly ReportPage[], check: PrintCheck, held: readonly Held[]): Report {
  const rows = pages.map((p) => {
    const open = held.filter((h) => h.pdfPage === p.pdfPage).map(({ path, problem }) => ({ path, problem }))
    if (!p.converted)
      return {
        page: p.pdfPage,
        view: 'none' as const,
        why: "This page didn't convert. We're looking into it and will email you when it's ready.",
        open,
        say: `Page ${String(p.pdfPage)} isn't ready yet. We'll email you when it is.`,
      }
    const reason: TextWhy | 'scan' | 'no-print' | null = p.printed
      ? null
      : (check.text.get(p.keyPage) ?? (p.scan ? 'scan' : 'no-print'))
    const say = [
      reason ? `Page ${String(p.pdfPage)} ${OPENS_AS_TEXT}${open.length ? '' : ' Nothing for you to do.'}` : '',
      open.length
        ? `${String(open.length)} ${open.length === 1 ? 'detail' : 'details'} on page ${String(p.pdfPage)} ${open.length === 1 ? 'needs' : 'need'} your confirmation before the page goes live.`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    return {
      page: p.pdfPage,
      view: p.printed ? ('printed' as const) : ('text' as const),
      why: reason ? WHY[reason] : null,
      open,
      say: say || null,
    }
  })
  const details = [...check.cosmetic].flatMap((k) => COSMETIC[k] ?? [])
  const notes = details.length
    ? [`A few details As printed still differ from your print, and we're working on them: ${listed(details)}.`]
    : []
  return Report.parse({ pages: rows, notes })
}
