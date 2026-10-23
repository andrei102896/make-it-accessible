import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { PageScore } from '@make-it-accessible/pipeline/pdf/fidelity-types'
import { judgePage } from '@make-it-accessible/pipeline/pdf/fidelity-verdict'
import { parseExtraction } from '@make-it-accessible/pipeline/pdf/types'
import { ROOT } from './paths.ts'
import { heldErrors } from './preview.ts'
import { parseReport } from './report.ts'

// What one document of the round shows, as lines per category, in the order a reviewer reads them: what fell back or
// was refused first, then held content, the view each page opens in, check:page, injections, cosmetic findings,
// the measures, every other log line, and last the pages that changed only.
const Lines = z.array(z.string())
export const DocRow = z.object({
  problems: Lines,
  held: Lines,
  view: Lines,
  check: Lines,
  injections: Lines,
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

const Measured = PageScore.extend({ keyPage: z.number(), pdfPage: z.number(), sheetPx: z.number() })
const Skipped = z.object({ keyPage: z.number(), skipped: z.enum(['scan', 'height', 'stall']), detail: z.string() })
export const FidelityFile = z.object({
  documents: z.array(z.object({ slug: z.string(), pages: z.array(z.union([Measured, Skipped])) })),
})
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

const PROBLEM = /refused|^DEGRADED /

export type DocFiles = {
  dir: string
  rebuild: string
  fidelity: string
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
  for (const l of cleanLines(await text(f.rebuild), f.dir)) (PROBLEM.test(l) ? row.problems : row.log).push(l)
  add('refused', row.problems.filter((l) => l.includes('refused')).length)
  // A held.json missing or unreadable in a folder this round built is a problem, never "nothing held".
  const [held, unread] = partition(await heldErrors(f.dir), (l) => !l.endsWith('rebuild it'))
  row.held.push(...held)
  row.problems.push(...unread)
  add('held findings', held.length)
  add('held documents', held.length ? 1 : 0)
  const report = await readFile(join(f.dir, 'report.json'), 'utf8').then(parseReport, () => null)
  for (const p of report?.pages ?? []) {
    row.view.push(`p${String(p.page)} ${p.view}${p.why ? `: ${p.why}` : ''}`)
    add(`pages ${p.view}`)
    row.held.push(...p.checked.map((c) => `p${String(p.page)} checked by ${c.name}: ${c.label}`))
    add('details checked by hand', p.checked.length)
  }
  // Lines the printed view shows under 4.5:1 (3:1 large) as printed, per printed sheet (html/placed.ts `--low`).
  const html = await readFile(join(f.dir, 'index.html'), 'utf8').catch(() => '')
  const sheets = [
    ...[...html.matchAll(/<section[^>]*\bdata-page="(\d+)"[^>]*--ar:[\s\S]*?<\/section>/g)].map(([s, p]) => [
      s,
      `p${p ?? ''}`,
    ]),
    // The masthead stands over the first sheet, outside its section.
    ...[...html.matchAll(/<header class="masthead[^"]*">[\s\S]*?<\/header>/g)].map(([s]) => [s, 'masthead']),
  ]
  for (const [sheet = '', at = ''] of sheets) {
    const low = sheet.split('--low:1').length - 1
    if (low) row.view.push(`${at} printed lines under contrast: ${String(low)}`)
    add('printed lines under contrast', low)
  }
  add('approvals no longer matching', held.filter((l) => l.endsWith('no longer matches its words')).length)
  const check = cleanLines(await text(f.check), f.dir)
  row.check.push(...check)
  add(
    'check issues',
    !check.length || check.some((l) => /axe (?!ok)|OVERFLOW|DIFFERS|clipped|overflow/.test(l)) ? 1 : 0,
  )
  for (const l of check) {
    const m = /boxes cut (\d+) \(prices (\d+)\), overlapping (\d+)/.exec(l)
    add('printed boxes cut', Number(m?.[1] ?? 0))
    add('printed prices cut', Number(m?.[2] ?? 0))
    add('printed boxes overlapping', Number(m?.[3] ?? 0))
    add('text view spans restyled', Number(/spans restyled (\d+)/.exec(l)?.[1] ?? 0))
  }
  // The measures: every page's whole-page findings, its printed shadows.
  const fidelity = await text(f.fidelity).then((raw) => (raw ? FidelityFile.parse(JSON.parse(raw)) : null))
  for (const p of fidelity?.documents.flatMap((d) => d.pages) ?? []) {
    if ('skipped' in p) {
      row.measures.push(`p${String(p.keyPage)} not measured: ${p.skipped}`)
      continue
    }
    for (const c of judgePage(p)) {
      row.cosmetic.push(`p${String(p.keyPage)} ${c.kind}`)
      add(`cosmetic ${c.kind} pages`)
    }
  }
  row.measures.push(...cleanLines(await text(f.fidelity.replace(/\.json$/, '.log')), f.dir))
  for (const d of (await readdir(f.dir)).filter((x) => /^p\d+$/.test(x)).sort()) {
    // Words styled by their line's piece, and lines in mixed styles whose words did not match (pdf/face.ts).
    const read = await text(join(f.dir, d, 'extraction.json'))
    let e = null
    try {
      e = read ? parseExtraction(read) : null
    } catch {
      row.problems.push(`${d} extraction.json unreadable`)
    }
    const styled = e?.runs.filter((r) => r.styled).length ?? 0
    if (e?.unmatched) row.measures.push(`${d} lines in mixed styles unmatched: ${String(e.unmatched)}`)
    add('words styled by their piece', styled)
    add('mixed-style lines unmatched', e?.unmatched ?? 0)
    const grid = await text(join(f.dir, d, 'backdrop.json'))
    const shadows = grid
      ? Object.keys(z.object({ shadows: z.record(z.string(), z.unknown()) }).parse(JSON.parse(grid)).shadows).length
      : 0
    if (shadows) row.cosmetic.push(`${d} shadows: ${String(shadows)}`)
    add('shadows', shadows)
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
  cosmetic: [],
  measures: [],
  log: [],
  pages: [],
})

const partition = <T>(xs: readonly T[], keep: (x: T) => boolean): [T[], T[]] => [
  xs.filter(keep),
  xs.filter((x) => !keep(x)),
]

export function addTotals(into: Totals, from: Totals): void {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n
}
