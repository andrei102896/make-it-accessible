import { readFile, stat } from 'node:fs/promises'
import { poppler } from './exec.ts'
import { Refused } from './refused.ts'
import { inflatedSize, MAX_DOCUMENT_INFLATED } from './streams.ts'

// What a document may be before any work starts, about 3× the most measured on the 66 test documents (2026-10-19:
// Lidl DE 73 pages and 89 MB, the largest page Kenny & Ziggy's 684 × 1656 pt); A0 bounds a page's area.
export const LIMITS = {
  bytes: 300 * 1000 * 1000,
  pages: 250,
  pageArea: 2384 * 3370,
  inflated: MAX_DOCUMENT_INFLATED,
}
export type Limits = typeof LIMITS

// A PDF that does not allow copying its text: an unprotected export is needed.
export const copyForbidden = (info: string): boolean => /^Encrypted:\s+yes\b.*\bcopy:no\b/m.test(info)

const checked = new Map<string, Promise<number>>()
// The document's page count once it passes, else Refused with the reason a client is told; checked once per file.
export function preflight(pdf: string, limits: Limits = LIMITS): Promise<number> {
  const key = `${pdf}\u0000${JSON.stringify(limits)}`
  const known = checked.get(key) ?? check(pdf, limits)
  checked.set(key, known)
  return known
}

async function check(pdf: string, limits: Limits): Promise<number> {
  if ((await stat(pdf)).size > limits.bytes)
    throw new Refused(`the PDF is larger than ${String(limits.bytes / 1e6)} MB`)
  const { stdout } = await poppler('pdfinfo', [pdf])
  if (copyForbidden(stdout))
    throw new Refused('the PDF does not allow copying its text; an unprotected export is needed')
  const pages = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1] ?? 0)
  if (!pages) throw new Refused('the PDF has no readable page')
  if (pages > limits.pages) throw new Refused(`the PDF has ${String(pages)} pages, more than ${String(limits.pages)}`)
  // Every page's size, read only once the count is bounded (plain pdfinfo prints the first page's alone).
  const sizes = (await poppler('pdfinfo', ['-f', '1', '-l', String(pages), pdf])).stdout
  for (const [, w, h] of sizes.matchAll(/size:\s+([\d.]+) x ([\d.]+)/g))
    if (Number(w) * Number(h) > limits.pageArea) throw new Refused('a page is larger than A0')
  // Inflated once up front, so a decompression bomb is refused before pdf.js or a model call (none of it is kept).
  inflatedSize(await readFile(pdf), { left: limits.inflated })
  return pages
}
