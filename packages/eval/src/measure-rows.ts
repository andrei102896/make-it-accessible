import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { PageScore } from '@make-it-accessible/pipeline/pdf/fidelity-types'
import { judgePage } from '@make-it-accessible/pipeline/pdf/fidelity-verdict'
import { ROOT } from './paths.ts'
import { heldErrors } from './preview.ts'
import { parseReport } from './report.ts'

// What one document of the round shows, as lines per category, in the order a reviewer reads them: what fell back or
// was refused first, then held content, the view each page opens in, check:page, injections, missing letters,
// cosmetic findings, the measures, every other log line, and last the pages that changed only.
const Lines = z.array(z.string())
export const DocRow = z.object({
  problems: Lines,
  held: Lines,
  view: Lines,
  check: Lines,
  injections: Lines,
  letters: Lines,
  cosmetic: Lines,
  measures: Lines,
  log: Lines,
  pages: Lines,
})
export type DocRow = z.infer<typeof DocRow>
export const CATEGORIES = DocRow.keyof().options
// A set's counts (pages, held, injected and caught…), summed over its documents.
export type Totals = Record<string, number>

export const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex').slice(0, 12)

const Measured = PageScore.extend({
  keyPage: z.number(),
  pdfPage: z.number(),
  sheetPx: z.number(),
  mutated: z.array(z.number()),
})
const Skipped = z.object({ keyPage: z.number(), skipped: z.enum(['scan', 'height', 'stall']), detail: z.string() })
export const FidelityFile = z.object({
  documents: z.array(z.object({ slug: z.string(), pages: z.array(z.union([Measured, Skipped])) })),
})
const Tally = z.object({
  caught: z.number(),
  missed: z.number(),
  unmeasurable: z.number(),
  lines: z.array(z.object({ text: z.string(), caught: z.boolean() })),
})
export const InjectedFile = z.record(z.string(), Tally)
export const ContentFile = z.object({
  clean: z.number(),
  held: z.number(),
  rows: z.array(
    z.object({ defect: z.string(), injected: z.number(), caught: z.number(), missed: z.array(z.string()) }),
  ),
})

// The paths the logs print (the repository, the document's folder) cut, so a line reads the same on every machine;
// a line timing a step ("… in 12 s") is no result.
export const cleanLines = (log: string, docDir: string): string[] =>
  log
    .split('\n')
    .map((l) => l.split(`${docDir}/`).join('').split(docDir).join('.').split(`${ROOT}/`).join('').trimEnd())
    .filter((l) => l && !/ in \d+ s$/.test(l))

const PROBLEM = /refused|still misplaced|^DEGRADED /
const VIEW = /: text view, |: \w[\w-]* first at /
const LETTERS = /lacks a letter of/

export type DocFiles = {
  dir: string
  rebuild: string
  fidelity: string
  injected: string
  content: string
  check: string
}

// The row of one rebuilt and judged document; the totals it adds to its set.
export async function docRow(f: DocFiles, notes: readonly string[]): Promise<{ row: DocRow; totals: Totals }> {
  const row = emptyRow()
  const totals: Totals = {}
  const add = (k: string, n = 1): void => {
    totals[k] = (totals[k] ?? 0) + n
  }
  add('documents')
  const text = (file: string): Promise<string> => readFile(file, 'utf8').catch(() => '')
  row.problems.push(...notes)
  for (const l of cleanLines(await text(f.rebuild), f.dir))
    (PROBLEM.test(l) ? row.problems : VIEW.test(l) ? row.view : LETTERS.test(l) ? row.letters : row.log).push(l)
  add('refused', row.problems.filter((l) => l.includes('refused')).length)
  add('letters missing', row.letters.length)
  const held = (await heldErrors(f.dir)).filter((l) => !l.endsWith('rebuild it'))
  row.held.push(...held)
  add('held findings', held.length)
  add('held documents', held.length ? 1 : 0)
  const report = await readFile(join(f.dir, 'report.json'), 'utf8').then(parseReport, () => null)
  for (const p of report?.pages ?? []) {
    row.view.push(`p${String(p.page)} ${p.view}${p.why ? `: ${p.why}` : ''}`)
    add(`pages ${p.view}`)
  }
  row.cosmetic.push(...(report?.notes ?? []).map((n) => `note: ${n}`))
  const check = cleanLines(await text(f.check), f.dir)
  row.check.push(...check)
  add('check issues', check.some((l) => /axe (?!ok)|OVERFLOW|DIFFERS|clipped|overflow/.test(l)) ? 1 : 0)
  // The measures: every page's verdict, its cosmetic findings by kind (lines), its printed shadows.
  const fidelity = await text(f.fidelity).then((raw) => (raw ? FidelityFile.parse(JSON.parse(raw)) : null))
  for (const p of fidelity?.documents.flatMap((d) => d.pages) ?? []) {
    if ('skipped' in p) {
      row.measures.push(`p${String(p.keyPage)} not measured: ${p.skipped}`)
      continue
    }
    for (const c of judgePage(p).cosmetic) {
      row.cosmetic.push(`p${String(p.keyPage)} ${c.kind}: ${String(c.lines.length)} lines`)
      add(`cosmetic ${c.kind} lines`, c.lines.length)
    }
  }
  row.measures.push(...cleanLines(await text(f.fidelity.replace(/\.json$/, '.log')), f.dir))
  for (const d of (await readdir(f.dir)).filter((x) => /^p\d+$/.test(x)).sort()) {
    const grid = await text(join(f.dir, d, 'backdrop.json'))
    const shadows = grid
      ? Object.keys(z.object({ shadows: z.record(z.string(), z.unknown()) }).parse(JSON.parse(grid)).shadows).length
      : 0
    if (shadows) row.cosmetic.push(`${d} shadows: ${String(shadows)}`)
    add('shadows', shadows)
  }
  const injected = await text(f.injected).then((raw) => (raw ? InjectedFile.parse(JSON.parse(raw)) : {}))
  for (const [m, t] of Object.entries(injected)) {
    row.injections.push(
      `${m}: caught ${String(t.caught)} of ${String(t.caught + t.missed)}, ${String(t.unmeasurable)} unmeasurable`,
    )
    row.injections.push(...t.lines.filter((l) => !l.caught).map((l) => `${m} missed: ${JSON.stringify(l.text)}`))
    add(`print ${m} caught`, t.caught)
    add(`print ${m} measurable`, t.caught + t.missed)
  }
  const content = await text(f.content).then((raw) => (raw ? ContentFile.parse(JSON.parse(raw)) : null))
  if (content) {
    row.injections.push(`content: ${String(content.clean)} pages clean, ${String(content.held)} held`)
    add('content clean pages', content.clean)
    add('content held pages', content.held)
    for (const r of content.rows) {
      row.injections.push(
        `${r.defect}: caught ${String(r.caught)} of ${String(r.injected)}`,
        ...r.missed.map((m) => `${r.defect} missed: ${m}`),
      )
      add(`content ${r.defect} caught`, r.caught)
      add(`content ${r.defect} injected`, r.injected)
    }
  }
  row.pages.push(...(await pageHashes(f.dir)))
  return { row, totals }
}

// Each page's own share of the page (its section of index.html and its folder's files) and the fonts beside it.
async function pageHashes(dir: string): Promise<string[]> {
  const html = await readFile(join(dir, 'index.html'), 'utf8').catch(() => '')
  const starts = [...html.matchAll(/<section[^>]*\bdata-page="(\d+)"/g)]
  const out = starts.map((m, i) => `p${m[1] ?? ''} section ${sha(html.slice(m.index, starts[i + 1]?.index))}`)
  out.push(`head ${sha(html.slice(0, starts[0]?.index ?? html.length))}`)
  for (const d of (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    const files = (await readdir(join(dir, d))).filter((x) => x !== 'fidelity.json').sort()
    const h = createHash('sha256')
    for (const x of files) h.update(x).update(await readFile(join(dir, d, x)))
    out.push(`${d} files ${h.digest('hex').slice(0, 12)}`)
  }
  return out
}

export const emptyRow = (): DocRow => ({
  problems: [],
  held: [],
  view: [],
  check: [],
  injections: [],
  letters: [],
  cosmetic: [],
  measures: [],
  log: [],
  pages: [],
})

export function addTotals(into: Totals, from: Totals): void {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n
}
