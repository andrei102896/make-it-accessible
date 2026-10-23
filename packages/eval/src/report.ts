import { z } from 'zod'
import type { Checked, Held } from './approved.ts'

// report.json beside held.json: per page which layout it opens in and why, in the owner's words (CLIENT_FLOW §5),
// and how many of its details wait for their confirmation; never "compliant" or "certified".
export const REPORT_FILE = 'report.json'

const Page = z.object({
  page: z.number(),
  view: z.enum(['printed', 'text', 'none']),
  why: z.string().nullable(),
  open: z.array(z.object({ path: z.string(), problem: z.string() })),
  // Details checked against the PDF by hand (approved.ts): live, the owner told and free to correct them.
  checked: z.array(z.object({ label: z.string(), name: z.string(), at: z.string() })).default([]),
  say: z.string().nullable(),
})
const Report = z.object({ pages: z.array(Page) })
export type Report = z.infer<typeof Report>
export const parseReport = (raw: string): Report => Report.parse(JSON.parse(raw))

// The page's switch reads "As printed" / "Text only" (html/strings.ts): the owner finds it by those words.
const OPENS_AS_TEXT = 'opens as Text only, where every word reads clearly.'
// Why a page shows Text only: one sentence after "Page N opens as Text only…".
const WHY: Record<'scan' | 'no-print', string> = {
  scan: 'This page is a picture of the menu, so we read its words rather than redraw them.',
  'no-print': "We couldn't draw this page's printed layout.",
}
// The checked details told once per page, one sentence per day and person (dates read the same in the UK and US).
const checkedBy = (cs: readonly { label: string; name: string; at: string }[]): string[] => {
  const day = (at: string): string =>
    new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const groups = Map.groupBy(cs, (c) => JSON.stringify([day(c.at), c.name])).values()
  // Details told alike are told once (Howies' two lobster marks, one label).
  const told = (g: readonly { label: string }[]): string[] => [
    ...new Set(g.map((c) => c.label.replace(/[\s.;,]+$/, ''))),
  ]
  const said = [...groups].map((g) => {
    const labels = told(g)
    return `On ${day(g[0]?.at ?? '')}, ${g[0]?.name ?? ''} at Make It Accessible checked ${labels.length === 1 ? 'this detail' : 'these details'} against your PDF by hand: ${labels.join('; ')}.`
  })
  const closing = `If ${told(cs).length === 1 ? 'it' : 'anything'} differs from your menu, reply to this email and we'll correct it.`
  return said.length ? [...said, closing] : []
}

// A page that did not convert is listed too: it is open until it does (`converted: false`).
export type ReportPage = { pdfPage: number; printed: boolean; scan: boolean; converted: boolean }

// `printed`: pages shown as printed; `held`: open content.
export function reportOf(
  pages: readonly ReportPage[],
  held: readonly Held[],
  checked: readonly Checked[] = [],
): Report {
  const rows = pages.map((p) => {
    const open = held.filter((h) => h.pdfPage === p.pdfPage).map(({ path, problem }) => ({ path, problem }))
    const mine = checked.filter((c) => c.pdfPage === p.pdfPage).map(({ label, name, at }) => ({ label, name, at }))
    if (!p.converted)
      return {
        page: p.pdfPage,
        view: 'none' as const,
        why: "This page didn't convert. We're looking into it and will email you when it's ready.",
        open,
        checked: mine,
        say: `Page ${String(p.pdfPage)} isn't ready yet. We'll email you when it is.`,
      }
    const reason: 'scan' | 'no-print' | null = p.printed ? null : p.scan ? 'scan' : 'no-print'
    const say = [
      reason
        ? `Page ${String(p.pdfPage)} ${OPENS_AS_TEXT}${open.length || mine.length ? '' : ' Nothing for you to do.'}`
        : '',
      open.length
        ? `${String(open.length)} ${open.length === 1 ? 'detail' : 'details'} on page ${String(p.pdfPage)} ${open.length === 1 ? 'needs' : 'need'} your confirmation before the page goes live.`
        : '',
      ...checkedBy(mine),
    ]
      .filter(Boolean)
      .join(' ')
    return {
      page: p.pdfPage,
      view: p.printed ? ('printed' as const) : ('text' as const),
      why: reason ? WHY[reason] : null,
      open,
      checked: mine,
      say: say || null,
    }
  })
  return Report.parse({ pages: rows })
}
