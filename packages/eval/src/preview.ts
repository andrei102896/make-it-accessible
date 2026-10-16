import { randomBytes } from 'node:crypto'
import { z } from 'zod'

// A preview is a converted page a prospect gets a private link to: unlisted, noindex, deleted after PREVIEW_DAYS
// unless the owner keeps it (the rule told in every email).
export const PREVIEW_DAYS = 30
const SUFFIX_BYTES = 3

export const ExpiryRowSchema = z
  .object({
    file: z.string().regex(/^[a-z0-9-]+\.html$/),
    business: z.string().min(1),
    added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deleteBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
export type ExpiryRow = z.infer<typeof ExpiryRowSchema>

const HEADER = 'file,business,added,deleteBy'

export const previewFile = (slug: string): string =>
  `${slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${randomBytes(SUFFIX_BYTES).toString('hex')}.html`

const day = (d: Date): string => d.toISOString().slice(0, 10)
export function expiryRow(file: string, business: string, today: Date): ExpiryRow {
  const by = new Date(today)
  by.setUTCDate(by.getUTCDate() + PREVIEW_DAYS)
  return { file, business, added: day(today), deleteBy: day(by) }
}

// Search engines and link previews are told to stay out; the page itself is otherwise unchanged.
export function withNoindex(html: string): string {
  if (/<meta name="robots"/.test(html)) return html
  return html.replace(/<meta name="viewport"[^>]*>/, (m) => `${m}\n<meta name="robots" content="noindex, nofollow">`)
}

export function parseExpiry(csv: string): ExpiryRow[] {
  const lines = csv.split('\n').filter((l) => l.trim())
  if (lines[0] !== HEADER) throw new Error(`EXPIRY.csv: expected header "${HEADER}"`)
  return lines.slice(1).map((l) => {
    const [file = '', business = '', added = '', deleteBy = ''] = l.split(',')
    return ExpiryRowSchema.parse({ file, business: business.replace(/;/g, ','), added, deleteBy })
  })
}

export const formatExpiry = (rows: readonly ExpiryRow[]): string =>
  [HEADER, ...rows.map((r) => [r.file, r.business.replace(/,/g, ';'), r.added, r.deleteBy].join(','))].join('\n') + '\n'

export const expired = (rows: readonly ExpiryRow[], today: Date): ExpiryRow[] =>
  rows.filter((r) => r.deleteBy <= day(today))
