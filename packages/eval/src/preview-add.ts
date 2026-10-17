import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expiryRow, formatExpiry, parseExpiry, previewFile, writePreview } from './preview.ts'
import { PREVIEWS_DIR } from './paths.ts'

// pnpm preview:add <page.html> "<Business name>": copies the page into previews/ under an unlisted name and
// records when it must be deleted. Publishing is a separate step (pnpm preview:publish).
const [page, business] = process.argv.slice(2)
if (!page || !business) throw new Error('usage: pnpm preview:add <page.html> "<Business name>"')
const file = previewFile(business)
await writePreview(await readFile(page, 'utf8'), dirname(page), PREVIEWS_DIR, file)
const expiry = join(PREVIEWS_DIR, 'EXPIRY.csv')
const rows = parseExpiry(await readFile(expiry, 'utf8').catch(() => 'file,business,added,deleteBy\n'))
rows.push(expiryRow(file, business, new Date()))
await writeFile(expiry, formatExpiry(rows))
console.info(file)
