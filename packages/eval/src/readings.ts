import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReadingStore } from '@make-it-accessible/pipeline/pdf/ocr'
import { ROOT } from './paths.ts'

// Page readings on disk, one file per key (docs/INFRA_RESEARCH.md: a database row and an S3 object when live).
const READINGS_DIR = join(ROOT, 'out', 'cache', 'ocr')

export const folderStore = (dir = READINGS_DIR): ReadingStore => ({
  get: (key) => readFile(join(dir, `${key}.tsv`), 'utf8').catch(() => null),
  put: async (key, tsv) => {
    await mkdir(dir, { recursive: true })
    // Written whole or not at all: a reading cut short by a crash is never read back.
    const part = join(dir, `${key}.${String(process.pid)}.part`)
    await writeFile(part, tsv)
    await rename(part, join(dir, `${key}.tsv`))
  },
})
