import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { pageWords, type Word } from './words.ts'

const Words = z.array(
  z.object({ str: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(), line: z.string() }).strict(),
)
type Where = { dir: string; doc: string }

const wordsSha256 = (words: readonly Word[]): string => createHash('sha256').update(JSON.stringify(words)).digest('hex')

// Named by document and page, so copies of the PDF under other names share one snapshot.
export const snapshotPath = (where: Where, page: number): string =>
  join(where.dir, `${where.doc}-p${String(page)}.json`)

// The frozen words a key's occurrence ids refer to; written on first use, then read, so a Poppler upgrade cannot move them.
export async function snapshotWords(
  pdfPath: string,
  page: number,
  where: Where,
): Promise<{ words: Word[]; sha256: string }> {
  const path = snapshotPath(where, page)
  if (existsSync(path)) {
    const words = Words.parse(JSON.parse(await readFile(path, 'utf8')))
    return { words, sha256: wordsSha256(words) }
  }
  const words = await pageWords(pdfPath, page)
  await mkdir(where.dir, { recursive: true })
  await writeFile(path, JSON.stringify(words))
  return { words, sha256: wordsSha256(words) }
}

// True when Poppler now extracts other words than the snapshot holds; the snapshot stays authoritative.
export async function snapshotDrift(pdfPath: string, page: number, where: Where): Promise<boolean> {
  const { sha256 } = await snapshotWords(pdfPath, page, where)
  return wordsSha256(await pageWords(pdfPath, page)) !== sha256
}
