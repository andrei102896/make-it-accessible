import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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

// A preview's files that stay beside it (the printed view's backdrops: a phone never shows them, so the
// page must not carry them inline): its folder is the file's name without `.html`, each backdrop named by page.
export const assetsDir = (file: string): string => file.replace(/\.html$/, '')
export function withAssets(html: string, file: string): { html: string; assets: { from: string; to: string }[] } {
  const assets: { from: string; to: string }[] = []
  // Each backdrop file wherever the page names it (`src` and `srcset`), copied once.
  const out = html.replace(/p(\d+)\/backdrop-(\dx)\.webp/g, (from: string, page: string, scale: string) => {
    const to = `${assetsDir(file)}/p${page}-${scale}.webp`
    if (!assets.some((a) => a.from === from)) assets.push({ from, to })
    return to
  })
  return { html: out, assets }
}

// Writes a rendered page (its pictures relative to `pageDir`) as the preview `file` in `dir`, its assets beside it.
export async function writePreview(html: string, pageDir: string, dir: string, file: string): Promise<void> {
  const page = withAssets(withNoindex(html), file)
  await rm(join(dir, assetsDir(file)), { recursive: true, force: true })
  for (const a of page.assets) {
    await mkdir(dirname(join(dir, a.to)), { recursive: true })
    await copyFile(join(pageDir, a.from), join(dir, a.to))
  }
  await writeFile(join(dir, file), page.html)
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

// A document's content errors (eval/process.ts): a held document is not published. Missing file: built before the
// gate, read as held so it is rebuilt first.
export const HELD_FILE = 'held.json'
export async function heldErrors(docDir: string): Promise<string[]> {
  const raw = await readFile(join(docDir, HELD_FILE), 'utf8').catch(() => null)
  if (raw === null) return ['built before the publication gate: rebuild it']
  const parsed = z
    .array(z.object({ pdfPage: z.number(), path: z.string(), problem: z.string() }))
    .safeParse(JSON.parse(raw))
  return parsed.success
    ? parsed.data.map((f) => `p${String(f.pdfPage)} ${f.path}: ${f.problem}`)
    : ['held.json unreadable: rebuild it']
}

// A held document whose every finding names the words the page shows there (a doubt, words read from a picture): one
// its owner can clear by confirming them beside the PDF. An error or a page-level finding names none and blocks.
export async function ownerClearable(docDir: string): Promise<boolean> {
  const raw = await readFile(join(docDir, HELD_FILE), 'utf8').catch(() => null)
  const parsed = z
    .array(z.object({ words: z.string().nullable().optional() }))
    .safeParse(raw === null ? null : JSON.parse(raw))
  return parsed.success && parsed.data.length > 0 && parsed.data.every((f) => typeof f.words === 'string')
}

// What blocks a held document, by kind (for the round's totals only): its findings an owner cannot clear.
const BLOCKS: [RegExp, string][] = [
  [/page image reads/, 'scan: two readings disagree'],
  [/printed once and shown twice/, 'a word shown twice'],
  [/does not match the cited words/, 'text not the cited words'],
  [/neither used nor dropped/, 'words left unused'],
  [/not an amount|leaves out digits|no currency|cites the same words/, 'a price'],
  [/letters the PDF draws/, 'letters drawn as shapes'],
  [/range \[/, 'a range outside the page'],
]
export async function blockingKinds(docDir: string): Promise<string[]> {
  const raw = await readFile(join(docDir, HELD_FILE), 'utf8').catch(() => null)
  const parsed = z
    .array(z.object({ problem: z.string(), words: z.string().nullable().optional() }))
    .safeParse(raw === null ? null : JSON.parse(raw))
  if (!parsed.success) return []
  const kinds = parsed.data
    .filter((f) => typeof f.words !== 'string')
    .map((f) => BLOCKS.find(([re]) => re.test(f.problem))?.[1] ?? 'other')
  return [...new Set(kinds)]
}
