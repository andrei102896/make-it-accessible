import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { heldErrors, parseExpiry, writePreview } from './preview.ts'
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
  const held = await heldErrors(join(REBUILT_DIR, s.slug))
  if (held.length) {
    // A held document (content errors) keeps its last published page; Andrei decides whether to withdraw it.
    console.error(`${r.business}: held, preview not refreshed:\n  ${held.join('\n  ')}`)
    continue
  }
  const html = await readFile(join(REBUILT_DIR, s.slug, 'page.html'), 'utf8')
  await writePreview(html, join(REBUILT_DIR, s.slug), PREVIEWS_DIR, r.file)
  if (copy) await writePreview(html, join(REBUILT_DIR, s.slug), copy, r.file)
  done++
}
console.info(`${String(done)} of ${String(rows.length)} previews refreshed${copy ? ` and copied to ${copy}` : ''}.`)
