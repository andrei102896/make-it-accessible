import { z } from 'zod'
import { formatCsv, parseCsv } from './csv.ts'

// The demand test's contacts (outreach/targets.csv, local only) and the follow-ups they are due (outreach/emails.md:
// two in the same thread, day 3–4 and day 8–10, then stop).
export const FIRST_AFTER_DAYS = 3
export const SECOND_AFTER_DAYS = 8
// A first follow-up sent late still leaves this many days before the last one.
const MIN_GAP_DAYS = 3
// emails.md: 10–20 sends a day, by hand.
export const DAILY_MAX = 20

export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const DayOrNone = z.union([Day, z.literal('')])
const TargetSchema = z
  .object({
    priority: z.string(),
    segment: z.string(),
    business: z.string().min(1),
    city: z.string(),
    country: z.string(),
    email: z.string(),
    contact_form: z.string(),
    pdf_url: z.string(),
    tagged: z.string(),
    hook: z.string(),
    caveat: z.string(),
    sent: DayOrNone,
    reply: z.string(),
    followup1: DayOrNone,
    followup2: DayOrNone,
  })
  .strict()
export type Target = z.infer<typeof TargetSchema>
const COLUMNS = TargetSchema.keyof().options

// A first email as drafted (outreach/batch*.json); `tz` is the recipient's, on the US ones.
export const SentEmailSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  tz: z.string().optional(),
})
export type SentEmail = z.infer<typeof SentEmailSchema>

// Columns missing from an older file (the follow-up dates) read as empty and are written on the next save.
export function parseTargets(text: string): Target[] {
  const [header, ...rows] = parseCsv(text)
  const unknown = header?.filter((h) => !COLUMNS.some((c) => c === h))
  if (!header || unknown?.length) throw new Error(`targets.csv: unknown columns ${String(unknown)}`)
  return rows.map((r) => TargetSchema.parse(Object.fromEntries(COLUMNS.map((c) => [c, r[header.indexOf(c)] ?? '']))))
}
export const formatTargets = (targets: readonly Target[]): string =>
  formatCsv([COLUMNS, ...targets.map((t) => COLUMNS.map((c) => t[c]))])

// Batches in the order written: a later draft to the same address replaces an earlier one (batch3 rewrote batch1's
// agencies before they were sent).
export const byAddress = (batches: readonly (readonly SentEmail[])[]): Map<string, SentEmail> =>
  new Map(batches.flat().map((e) => [e.to.toLowerCase(), e]))

const daysFrom = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86_400_000
// Bounces and real replies end the sequence; an auto-reply is no answer.
const answered = (t: Target): boolean => t.reply !== '' && !/^auto-reply/i.test(t.reply)

export type Due = { target: Target; n: 1 | 2 }
export function due(targets: readonly Target[], today: string): Due[] {
  return targets
    .flatMap((t): Due[] => {
      if (!t.sent || !t.email || answered(t)) return []
      if (!t.followup1) return daysFrom(t.sent, today) >= FIRST_AFTER_DAYS ? [{ target: t, n: 1 }] : []
      const last = !t.followup2 && daysFrom(t.sent, today) >= SECOND_AFTER_DAYS
      return last && daysFrom(t.followup1, today) >= MIN_GAP_DAYS ? [{ target: t, n: 2 }] : []
    })
    .sort((a, b) => a.target.sent.localeCompare(b.target.sent) || a.target.priority.localeCompare(b.target.priority))
}

// What the first email offered ("your October price list"), from its opening line.
const THING = /I had a look at (?:the |your |today's )?(.+?)(?: on your website| you [^.,:]*)?[.,:]/
const LINES: Record<'agency' | 'business', Record<1 | 2, (thing: string) => string>> = {
  agency: {
    1: () =>
      'Bumping this in case it got buried. If it would help with your restaurant clients, I\'m happy to convert one of their PDF menus so you can judge the result, no cost. Just reply "yes".',
    2: () =>
      "Last note from me. If PDF menus aren't a priority for your clients right now, no worries at all. If it's ever useful, reply and I'll convert one.",
  },
  business: {
    1: (thing) =>
      `Bumping this in case it got buried. Happy to send your ${thing} back as a phone-friendly page, no cost. Just reply "yes".`,
    2: () =>
      "Last note from me. If this isn't a priority right now, no worries at all. If it's ever useful, reply and I'll convert the current one.",
  },
}

// The follow-up's text, greeted and signed as the first email was (US ones keep its address and opt-out lines);
// `guessed` when the first email is not in the batches or names no document, so Andrei checks it before sending.
export function followUp(t: Target, first: SentEmail | undefined, n: 1 | 2): { text: string; guessed: boolean } {
  const lines = first?.body.split('\n') ?? []
  const greeting = lines[0]?.startsWith('Hi ') ? lines[0] : `Hi ${t.business} team,`
  const thing = first?.body.match(THING)?.[1]
  const agency = t.segment === 'agencies'
  const signed = lines.findIndex((l) => l.startsWith('Make It Accessible'))
  const footer = signed >= 0 ? lines.slice(signed + 1) : []
  const body = LINES[agency ? 'agency' : 'business'][n](thing ?? 'menu')
  return {
    text: [greeting, '', body, '', 'Andrei', ...footer].join('\n'),
    guessed: !first || (!agency && !thing),
  }
}

const DATE_FIELDS = ['sent', 'followup1', 'followup2'] as const
export const LogFieldSchema = z.enum([...DATE_FIELDS, 'reply'])
export type LogField = z.infer<typeof LogFieldSchema>

// The targets with `field` recorded for the named businesses: a date for each (never over one already set), or a
// reply appended to one business's. Every name must match exactly one business, or nothing is recorded.
export function logged(targets: readonly Target[], field: LogField, text: string, names: readonly string[]): Target[] {
  if (!names.length) throw new Error('name at least one business')
  if (field === 'reply' && names.length > 1) throw new Error('a reply is recorded for one business at a time')
  if (field !== 'reply') Day.parse(text)
  const picked = names.map((name) => {
    const found = targets.filter((t) => t.business.toLowerCase() === name.toLowerCase())
    if (found.length !== 1) throw new Error(`"${name}" matches ${String(found.length)} businesses`)
    const [t] = found
    if (t && field !== 'reply' && t[field]) throw new Error(`${t.business}: ${field} is already ${t[field]}`)
    return t
  })
  return targets.map((t) => {
    if (!picked.includes(t)) return t
    if (field !== 'reply') return { ...t, [field]: text }
    return { ...t, reply: t.reply ? `${t.reply} / ${text}` : text }
  })
}
