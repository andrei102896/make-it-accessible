import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expired, formatExpiry, parseExpiry } from './preview.ts'
import { PREVIEWS_DIR } from './paths.ts'

// pnpm preview:expire [--remove <file>]: deletes previews past their date (or the one named) and their rows;
// run pnpm preview:publish afterwards so the links stop working.
const named = process.argv.indexOf('--remove') >= 0 ? process.argv[process.argv.indexOf('--remove') + 1] : undefined
const expiry = join(PREVIEWS_DIR, 'EXPIRY.csv')
const rows = parseExpiry(await readFile(expiry, 'utf8'))
const gone = named ? rows.filter((r) => r.file === named) : expired(rows, new Date())
if (named && !gone.length) throw new Error(`${named} is not in EXPIRY.csv`)
for (const r of gone) await rm(join(PREVIEWS_DIR, r.file), { force: true })
await writeFile(expiry, formatExpiry(rows.filter((r) => !gone.includes(r))))
console.info(
  gone.length ? `removed ${String(gone.length)}: ${gone.map((r) => r.file).join(', ')}` : 'nothing to remove',
)
