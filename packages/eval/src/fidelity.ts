import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { measureDocument, type PageFidelity } from './fidelity-measure.ts'
import { pageDir } from './process.ts'
import { OUT_DIR } from './paths.ts'
import { loadSources, REBUILT_DIR, sourcePdf, VERIFY_FILE } from './sources.ts'

// pnpm fidelity [--verify [--sealed]] [<slug>…]: every rebuilt document's pages measured against their PDF
// (fidelity-measure.ts); numbers per page beside validation.json, the set's distributions on the console.
const args = process.argv.slice(2)
const verify = args.includes('--verify')
const sealed = args.includes('--sealed')
const slugs = args.filter((a) => !a.startsWith('--'))
// Labels for the printout only; a rule needs the verification set's numbers first (EXECUTION_PLAN 2.1).
const BANDS = {
  mass: [0.6, 1.5],
  colour: 0.08,
  shift: 0.3,
  width: [0.85, 1.15],
  gap: 0.5,
  cells: 10,
  narrowed: 0.85,
} as const

const all = await loadSources(verify ? VERIFY_FILE : undefined)
const sources = all.filter((s) => (!sealed || s.group === 'verify-sealed') && (!slugs.length || slugs.includes(s.slug)))
const browser = await chromium.launch()
const documents: { slug: string; pages: PageFidelity[] }[] = []
try {
  for (const s of sources) {
    const dir = join(REBUILT_DIR, s.slug)
    if (!existsSync(join(dir, 'index.html'))) {
      console.error(`${s.slug}: not rebuilt (pnpm rerender ${s.slug}${verify ? ' --verify' : ''})`)
      continue
    }
    const started = Date.now()
    const pages = await measureDocument(browser, dir, sourcePdf(s))
    for (const p of pages) await writeFile(join(pageDir(dir, p.keyPage), 'fidelity.json'), JSON.stringify(p, null, 2))
    documents.push({ slug: s.slug, pages })
    const label = sealed ? '•' : s.slug
    for (const p of pages)
      console.info(
        'skipped' in p
          ? `${label} p${String(p.keyPage)}: skipped, ${p.skipped}`
          : `${label} p${String(p.keyPage)}: ${summary(p)}`,
      )
    console.info(`${label}: ${String(pages.length)} pages in ${((Date.now() - started) / 1000).toFixed(0)} s`)
  }
} finally {
  await browser.close()
}
await writeFile(
  join(OUT_DIR, 'fidelity.json'),
  JSON.stringify({ set: verify ? (sealed ? 'verify-sealed' : 'verify') : 'working', documents }, null, 2),
)
report(documents.flatMap((d) => d.pages))

function summary(p: Extract<PageFidelity, { lines: unknown }>): string {
  const ratios = p.lines.filter((l) => l.mass.pdf > 0).map((l) => l.mass.ours / l.mass.pdf)
  const shadowed = p.lines.filter((l) => l.shadowed).length
  return `${String(p.lines.length)} lines${shadowed ? ` (${String(shadowed)} with a printed shadow)` : ''}, mass median ${q(ratios, 0.5).toFixed(2)} max ${q(ratios, 1).toFixed(2)}, outside pdf-only ${String(p.outside.pdfOnly)} ours-only ${String(p.outside.oursOnly)} (busy ${String(p.outside.busy)} of ${String(p.outside.cells + p.outside.busy)}), ground offset ${p.groundOffset.toFixed(3)}`
}

// Percentiles per metric over every measured line, and the share of lines and pages past each band.
function report(pages: PageFidelity[]): void {
  const measured = pages.flatMap((p) => ('lines' in p ? [p] : []))
  const lines = measured.flatMap((p) => p.lines)
  const mass = lines.filter((l) => l.mass.pdf > 0).map((l) => l.mass.ours / l.mass.pdf)
  const colour = lines.flatMap((l) => (l.colour === null ? [] : [l.colour]))
  const spans = lines.flatMap((l) => (l.extent?.ours && l.extent.pdf ? [{ o: l.extent.ours, p: l.extent.pdf }] : []))
  const shift = spans.map(({ o, p }) => Math.max(Math.abs(o.start - p.start), Math.abs(o.end - p.end)))
  const width = spans.map(({ o, p }) => (o.end - o.start) / Math.max(1e-6, p.end - p.start))
  const gap = spans.map(({ o, p }) => o.gap - p.gap)
  const pct = (xs: number[]): string =>
    `p50 ${q(xs, 0.5).toFixed(2)} p90 ${q(xs, 0.9).toFixed(2)} p99 ${q(xs, 0.99).toFixed(2)}`
  const share = (hits: number, of: number): string => (of ? `${((100 * hits) / of).toFixed(1)} %` : '–')
  const pastMass = mass.filter((r) => r < BANDS.mass[0] || r > BANDS.mass[1]).length
  const pagesPast = measured.filter((p) =>
    p.lines.some(
      (l) =>
        !l.shadowed &&
        l.mass.pdf > 0 &&
        (l.mass.ours / l.mass.pdf < BANDS.mass[0] || l.mass.ours / l.mass.pdf > BANDS.mass[1]),
    ),
  ).length
  console.info(
    `\npages ${String(pages.length)}, measured ${String(measured.length)}, lines ${String(lines.length)}, unmeasured lines ${share(lines.length - mass.length, lines.length)}`,
  )
  console.info(
    `mass ratio: ${pct(mass)}; past [${BANDS.mass.join(', ')}]: lines ${share(pastMass, mass.length)}, pages ${share(pagesPast, measured.length)}`,
  )
  console.info(
    `colour: ${pct(colour)}; past ${String(BANDS.colour)}: ${share(colour.filter((c) => c > BANDS.colour).length, colour.length)}`,
  )
  console.info(
    `span shift: ${pct(shift)}; past ${String(BANDS.shift)} h: ${share(shift.filter((v) => v > BANDS.shift).length, shift.length)}`,
  )
  console.info(
    `span width: ${pct(width)}; past [${BANDS.width.join(', ')}]: ${share(width.filter((v) => v < BANDS.width[0] || v > BANDS.width[1]).length, width.length)}`,
  )
  console.info(
    `gap difference: ${pct(gap)}; past ${String(BANDS.gap)} h: ${share(gap.filter((v) => v > BANDS.gap).length, gap.length)}`,
  )
  const narrowed = lines.filter((l) => l.fit.k <= BANDS.narrowed).length
  console.info(
    `face width: lines narrowed to ${String(BANDS.narrowed)} or less of their box: ${share(narrowed, lines.length)} (a stand-in wider than the print)`,
  )
  const cells = measured.map((p) => p.outside.pdfOnly)
  console.info(
    `outside cells pdf-only: ${pct(cells)}; pages past ${String(BANDS.cells)}: ${share(cells.filter((v) => v >= BANDS.cells).length, cells.length)}`,
  )
}

function q(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0
}
