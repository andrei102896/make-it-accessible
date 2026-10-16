import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseExpiry, withNoindex } from './preview.ts'
import { PREVIEWS_DIR } from './paths.ts'
import { loadSources, REBUILT_DIR } from './sources.ts'

// pnpm preview:refresh [--copy <dir>]: every listed preview takes its rebuilt page (out/rebuilt/<slug>/page.html,
// matched by business title) under the same unlisted name, so the link a prospect holds shows the current renderer.
// `--copy` also writes each page into a folder (the Desktop review set). Publishing stays a separate step.
const at = process.argv.indexOf('--copy')
const copy = at >= 0 ? process.argv[at + 1] : undefined
const sources = await loadSources()
const rows = parseExpiry(await readFile(join(PREVIEWS_DIR, 'EXPIRY.csv'), 'utf8'))
let done = 0
for (const r of rows) {
  const s = sources.find((x) => x.title === r.business)
  if (!s) {
    console.info(`${r.business}: no source, kept as is`)
    continue
  }
  const html = withNoindex(await readFile(join(REBUILT_DIR, s.slug, 'page.html'), 'utf8'))
  await writeFile(join(PREVIEWS_DIR, r.file), html)
  if (copy) await writeFile(join(copy, r.file), html)
  done++
}
console.info(`${String(done)} of ${String(rows.length)} previews refreshed${copy ? ` and copied to ${copy}` : ''}.`)
