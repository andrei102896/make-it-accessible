import { z } from 'zod'
import { addTotals, CATEGORIES, DocRow, emptyRow, sha, type Totals } from './measure-rows.ts'

// A round's results and how they differ from another round's, set by set (verify-learn first: rules are judged on
// it), category by category in the order a reviewer reads them (measure-rows.ts).
export const SET_ORDER = ['verify-learn', 'working', 'verify-sealed'] as const
export type SetName = (typeof SET_ORDER)[number]
const Lines = z.array(z.string())
const SetResult = z.object({
  docs: z.record(z.string(), z.object({ row: DocRow, totals: z.record(z.string(), z.number()) })),
  fidelity: Lines,
})
export type SetResult = z.infer<typeof SetResult>
const Baseline = z.object({
  tree: z.string(),
  head: z.string(),
  at: z.string(),
  quick: z.boolean(),
  sets: z.partialRecord(z.enum(SET_ORDER), SetResult),
  rescore: Lines,
})
export type Baseline = z.infer<typeof Baseline>
export const parseBaseline = (raw: string): Baseline => Baseline.parse(JSON.parse(raw))

// The sealed half keeps no name and no line (EXECUTION_PLAN: reported in aggregate only): each document under its
// slug's hash, each line under its own, so a round still counts what changed there.
export const sealedOf = (r: SetResult): SetResult => ({
  docs: Object.fromEntries(
    Object.entries(r.docs).map(([slug, { row, totals }]) => {
      const hashed = emptyRow()
      for (const c of CATEGORIES) hashed[c] = row[c].map((l) => sha(l))
      return [sha(slug), { row: hashed, totals }]
    }),
  ),
  fidelity: [],
})

// A set's totals over the documents named (a quick round's, on both sides of its diff).
function totalsOf(set: SetResult | undefined, slugs: readonly string[]): Totals {
  const t: Totals = {}
  for (const s of slugs) addTotals(t, set?.docs[s]?.totals ?? {})
  return t
}

// The shares the eye reads: injected defects caught of those measurable, per defect.
function rates(t: Totals): string[] {
  const out: string[] = []
  for (const k of Object.keys(t).sort()) {
    const m = /^(print|content) (.+) caught$/.exec(k)
    const of = m && t[`${m[1] ?? ''} ${m[2] ?? ''} ${m[1] === 'print' ? 'measurable' : 'injected'}`]
    if (m && of) out.push(`${m[1] ?? ''} ${m[2] ?? ''} ${((100 * (t[k] ?? 0)) / of).toFixed(1)} %`)
  }
  return out
}

const LIMIT = 40

// The report: per set its totals (a changed one marked), then each category's added (+) and gone (-) lines by
// document, at most LIMIT a category on screen (all in `full`); the pages to open beside their PDF.
export function diff(now: Baseline, was: Baseline | null): { shown: string[]; full: string[]; open: string[] } {
  const shown: string[] = []
  const full: string[] = []
  const open: string[] = []
  const both = (l: string): void => {
    shown.push(l)
    full.push(l)
  }
  for (const name of SET_ORDER) {
    const set = now.sets[name]
    if (!set) continue
    const before = was?.sets[name]
    const sealed = name === 'verify-sealed'
    // A quick round is compared on its own documents only.
    const slugs = now.quick
      ? Object.keys(set.docs)
      : [...new Set([...Object.keys(set.docs), ...Object.keys(before?.docs ?? {})])]
    const [t, tb] = [totalsOf(set, slugs), before ? totalsOf(before, slugs) : null]
    both(`\n${name}: ${String(Object.keys(set.docs).length)} documents`)
    for (const k of [...new Set([...Object.keys(t), ...Object.keys(tb ?? {})])].sort()) {
      const [a, b] = [t[k] ?? 0, tb?.[k] ?? 0]
      both(`  ${!tb || a === b ? ' ' : '*'} ${k}: ${String(a)}${tb && a !== b ? ` (was ${String(b)})` : ''}`)
    }
    const [r, rb] = [rates(t), tb ? rates(tb) : []]
    for (const l of r) both(`  ${!tb || rb.includes(l) ? ' ' : '*'} ${l}`)
    if (!before) {
      both(`  no baseline for ${name} to compare with`)
      continue
    }
    for (const c of CATEGORIES) {
      const lines: string[] = []
      let docs = 0
      for (const slug of [...slugs].sort()) {
        const [x, y] = [set.docs[slug]?.row[c] ?? [], before.docs[slug]?.row[c] ?? []]
        const added = x.filter((l) => !y.includes(l))
        const gone = y.filter((l) => !x.includes(l))
        if (!added.length && !gone.length) continue
        docs++
        if (sealed) continue
        lines.push(...added.map((l) => `    ${slug}: + ${l}`), ...gone.map((l) => `    ${slug}: - ${l}`))
        if (c === 'pages')
          for (const l of added) {
            const page = /^p0*(\d+)\b/.exec(l)?.[1]
            if (page && !open.includes(`${slug} p${page}`)) open.push(`${slug} p${page}`)
          }
      }
      if (!docs) continue
      both(`  ${c}: ${String(docs)} documents changed`)
      shown.push(...lines.slice(0, LIMIT))
      if (lines.length > LIMIT) shown.push(`    … ${String(lines.length - LIMIT)} more in the full report`)
      full.push(...lines)
    }
    const fidelity = set.fidelity.filter((l) => !before.fidelity.includes(l))
    if (fidelity.length) both(`  set measures now:\n${fidelity.map((l) => `    ${l}`).join('\n')}`)
  }
  if (was) {
    const same = now.rescore.join('\n') === was.rescore.join('\n')
    both(`\nstage-0 rescore: ${same ? 'same' : 'DIFFERS'}`)
    if (!same) full.push(...now.rescore.map((l) => `  ${l}`))
  }
  return { shown, full, open }
}
