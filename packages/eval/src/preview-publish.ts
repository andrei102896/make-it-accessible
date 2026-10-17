import { copyFile, cp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { assetsDir, parseExpiry } from './preview.ts'
import { PORTFOLIO_PREVIEW_DIR, PREVIEWS_DIR } from './paths.ts'

// pnpm preview:publish [--removed <file> ...]: copies every listed preview into the portfolio site's preview folder
// and removes the named ones there. The deploy itself (`vercel --prod` in the portfolio) is Andrei's: the Vercel CLI
// needs his login and a readable working directory, which the protected folder does not give this process.
const at = process.argv.indexOf('--removed')
const removed = at >= 0 ? process.argv.slice(at + 1) : []
const rows = parseExpiry(await readFile(join(PREVIEWS_DIR, 'EXPIRY.csv'), 'utf8'))
for (const r of rows) {
  await copyFile(join(PREVIEWS_DIR, r.file), join(PORTFOLIO_PREVIEW_DIR, r.file))
  // The page's pictures beside it (preview.ts withAssets), replaced whole so a page no longer printed drops them.
  const assets = assetsDir(r.file)
  await rm(join(PORTFOLIO_PREVIEW_DIR, assets), { recursive: true, force: true })
  const printed = await stat(join(PREVIEWS_DIR, assets)).catch(() => null)
  if (printed) await cp(join(PREVIEWS_DIR, assets), join(PORTFOLIO_PREVIEW_DIR, assets), { recursive: true })
}
for (const f of removed) {
  await rm(join(PORTFOLIO_PREVIEW_DIR, f), { force: true })
  await rm(join(PORTFOLIO_PREVIEW_DIR, assetsDir(f)), { recursive: true, force: true })
}
console.info(`${String(rows.length)} previews copied, ${String(removed.length)} removed.`)
console.info('Now, in ~/Desktop/portofolio:  vercel --prod')
