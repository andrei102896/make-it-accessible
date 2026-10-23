import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { z } from 'zod'
import { diff, parseBaseline, sealedOf, type Baseline, type SetName, type SetResult } from './measure-diff.ts'
import { clean, drain, runJob, type Job, type Ran } from './measure-jobs.ts'
import { docRow, emptyRow, FidelityFile, sha } from './measure-rows.ts'
import type { PageFidelity } from './fidelity-measure.ts'
import { report, verdicts } from './fidelity-report.ts'
import { OUT_DIR, ROOT } from './paths.ts'
import { loadSources, REBUILT_DIR, VERIFY_FILE, type Source } from './sources.ts'

// pnpm measure [--quick] [--sealed] [--against=<ref>] [--status] [--jobs=N, calibration only]: the round (rebuild,
// whole-page check, injected content defects, check:page, stage-0 rescore) as child processes of the same CLIs, JOBS at a time; a
// result that slept, fell back or failed is run again alone, as the sequential round ran it, before it is read.
const { values } = parseArgs({
  options: {
    quick: { type: 'boolean', default: false },
    sealed: { type: 'boolean', default: false },
    against: { type: 'string' },
    status: { type: 'boolean', default: false },
    jobs: { type: 'string' },
  },
})
// Children at once: the fastest count whose rebuilt folders are byte-identical to the sequential round (CASES).
const JOBS = Number(values.jobs ?? 6)
const DIR = join(OUT_DIR, 'measure')
const ROUND = join(DIR, 'round')
const RUNNING = join(DIR, 'RUNNING')
const SRC = join(ROOT, 'packages', 'eval', 'src')
// The stage-0 runs rescored each round (docs/STAGE0.md, runs 2 and 3: the four documents with prices).
const STAGE0 = ['2026-10-12T17-38-47-757Z', '2026-10-12T17-40-38-807Z']
// The quick round: a fixed varied list of the working set (local), plus this many verify-learn documents.
const QUICK_FILE = join(ROOT, 'validation', 'private', 'measure-quick.json')
const QUICK_LEARN = 6

const exec = promisify(execFile)
const git = async (args: string[], env = process.env): Promise<string> =>
  (await exec('git', args, { cwd: ROOT, env })).stdout.trim()

// The working tree as git would commit it (a temporary index; the repository's own index and files untouched).
async function treeOfWorkingCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'measure-'))
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') }
    await git(['read-tree', 'HEAD'], env)
    await git(['add', '-A'], env)
    return await git(['write-tree'], env)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const tree = await treeOfWorkingCopy()
const file = (t: string, quick = false): string => join(DIR, `${t}${quick ? '-quick' : ''}.json`)
if (values.status) {
  const done = existsSync(file(tree))
  console.info(`${tree}: ${done ? 'a complete full round is recorded' : 'no complete full round for this tree'}`)
  process.exit(done ? 0 : 1)
}
await mkdir(DIR, { recursive: true })
const running = await readFile(RUNNING, 'utf8').catch(() => null)
if (running !== null) {
  const pid = Number(running)
  const alive = (() => {
    try {
      return process.kill(pid, 0)
    } catch {
      return false
    }
  })()
  if (alive) throw new Error(`a round is running (pid ${String(pid)})`)
  console.info(`the round started by pid ${String(pid)} was interrupted: its results were never read`)
}
await writeFile(RUNNING, String(process.pid))
await rm(ROUND, { recursive: true, force: true })
// Kept awake while this process lives: a sleeping Mac fires every pending deadline on waking.
if (process.platform === 'darwin') spawn('caffeinate', ['-dis', '-w', String(process.pid)], { stdio: 'ignore' }).unref()
const started = Date.now()

type Doc = { set: SetName; source: Source; key: string }
const quick = values.quick
  ? z.object({ working: z.array(z.string()) }).parse(JSON.parse(await readFile(QUICK_FILE, 'utf8')))
  : null
const working = (await loadSources()).filter((s) => !quick || quick.working.includes(s.slug))
const verify = await loadSources(VERIFY_FILE)
const learn = verify
  .filter((s) => s.group === 'verify-learn')
  .sort((a, b) => sha(a.slug).localeCompare(sha(b.slug)))
  .slice(0, quick ? QUICK_LEARN : undefined)
const docs: Doc[] = [
  ...working.map((source) => ({ set: 'working' as const, source, key: source.slug })),
  ...learn.map((source) => ({ set: 'verify-learn' as const, source, key: source.slug })),
  ...(values.sealed && !quick
    ? verify
        .filter((s) => s.group === 'verify-sealed')
        .map((source) => ({ set: 'verify-sealed' as const, source, key: sha(source.slug) }))
    : []),
]

// Each document's jobs and files: its rebuild, then its judges once the rebuild ended well; its content injections
// beside them (they read the saved run, not the rebuild).
const at = (d: Doc, kind: string, ext = 'log'): string => join(ROUND, d.set, `${d.key}.${kind}.${ext}`)
const flags = (d: Doc): string[] => [
  ...(d.set === 'working' ? [] : ['--verify']),
  ...(d.set === 'verify-sealed' ? ['--sealed'] : []),
]
const node = (script: string, d: Doc, kind: string, args: string[]): Job => ({
  name: `${d.set} ${d.key} ${kind}`,
  args: [join(SRC, script), ...args],
  log: at(d, kind),
})
const rebuild = (d: Doc): Job =>
  node('rerender.ts', d, 'rebuild', [d.source.slug, ...(d.set === 'working' ? [] : ['--verify'])])
const judges = (d: Doc): Job[] => [
  node('fidelity.ts', d, 'fidelity', [...flags(d), `--out=${at(d, 'fidelity', 'json')}`, d.source.slug]),
  node('check-page.ts', d, 'check', [join(REBUILT_DIR, d.source.slug, 'page.html')]),
]
const content = (d: Doc): Job =>
  node('inject-run.ts', d, 'content', [...flags(d), `--out=${at(d, 'content', 'json')}`, d.source.slug])
const rescores: Job[] = STAGE0.map((run) => ({
  name: `rescore ${run}`,
  args: [join(SRC, 'run.ts'), '--rescore', join(OUT_DIR, run)],
  log: join(ROUND, 'rescore', `${run}.log`),
}))

const byJob = new Map<Job, Doc>()
const tagged = (d: Doc, jobs: Job[]): Job[] => {
  for (const j of jobs) byJob.set(j, d)
  return jobs
}
// A rebuild has ended well when it exited 0 having written this round's report.json.
const built = new Set<Doc>()
const rebuilt = async (r: Ran): Promise<boolean> => {
  const d = byJob.get(r.job)
  const report = d && (await stat(join(REBUILT_DIR, d.source.slug, 'report.json')).catch(() => null))
  const ok = r.code === 0 && report !== null && report !== undefined && report.mtimeMs >= r.started
  if (ok && d) built.add(d)
  return ok
}
const again: Job[] = []
await drain([...docs.flatMap((d) => tagged(d, [rebuild(d), content(d)])), ...rescores], JOBS, async (r) => {
  console.info(`${clean(r) ? '  ' : '! '}${r.job.name} ${(r.ms / 1000).toFixed(0)} s`)
  if (!clean(r)) {
    again.push(r.job)
    return []
  }
  const d = byJob.get(r.job)
  return d && r.job.log.endsWith('.rebuild.log') ? ((await rebuilt(r)) ? tagged(d, judges(d)) : []) : []
})

// Run again alone, nothing else running: the sequential round's conditions. Still marked: a real result, named.
const notes = new Map<Doc, string[]>()
const note = (d: Doc, r: Ran): void => {
  const why = [...r.degraded, ...(r.code === 0 ? [] : [`${r.job.name} exited ${String(r.code)}`])]
  if (why.length) notes.set(d, [...(notes.get(d) ?? []), ...why.map((l) => `alone: ${l}`)])
}
let interrupted = false
for (const job of again) {
  const d = byJob.get(job)
  const r = await runJob(job)
  console.info(`alone: ${job.name} ${(r.ms / 1000).toFixed(0)} s${r.slept ? ', SLEPT' : ''}`)
  if (r.slept) interrupted = true
  if (d) note(d, r)
  if (d && job.log.endsWith('.rebuild.log') && (await rebuilt(r)))
    for (const j of tagged(d, judges(d))) {
      const jr = await runJob(j)
      if (jr.slept) interrupted = true
      note(d, jr)
    }
}
const minutes = ((Date.now() - started) / 60_000).toFixed(1)
if (interrupted) {
  console.info(`INTERRUPTED: the Mac slept during a job run alone; nothing of this round is a result (${minutes} min)`)
  process.exit(1)
}

// The round's record, written whole or not at all, then compared.
const sets: Partial<Record<SetName, SetResult>> = {}
for (const d of docs) {
  const set = (sets[d.set] ??= { docs: {}, fidelity: [] })
  // A folder no rebuild of this round finished holds an earlier build's files (or the saved run's): never read.
  if (!built.has(d)) {
    const row = emptyRow()
    row.problems.push(
      ...(notes.get(d) ?? []),
      `not rebuilt: ${(await readFile(at(d, 'rebuild'), 'utf8')).trim().split('\n').at(-1) ?? ''}`,
    )
    set.docs[d.source.slug] = { row, totals: { documents: 1, 'not rebuilt': 1 } }
    continue
  }
  set.docs[d.source.slug] = await docRow(
    {
      dir: join(REBUILT_DIR, d.source.slug),
      rebuild: at(d, 'rebuild'),
      fidelity: at(d, 'fidelity', 'json'),
      content: at(d, 'content', 'json'),
      check: at(d, 'check'),
    },
    notes.get(d) ?? [],
  )
}
// Each set's measures as `pnpm fidelity` prints them: cells the PDF draws and ours lacks, findings by kind.
for (const [name, set] of Object.entries(sets)) {
  const measured: { slug: string; pages: PageFidelity[] }[] = []
  for (const d of docs.filter((x) => x.set === name)) {
    const raw = await readFile(at(d, 'fidelity', 'json'), 'utf8').catch(() => null)
    if (raw !== null) measured.push(...FidelityFile.parse(JSON.parse(raw)).documents)
  }
  set.fidelity = [...report(measured.flatMap((m) => m.pages)), ...verdicts(measured, name === 'verify-sealed')]
}
if (sets['verify-sealed']) sets['verify-sealed'] = sealedOf(sets['verify-sealed'])
const rescore: string[] = []
for (const j of rescores) {
  const log = (await readFile(j.log, 'utf8')).split('\n')
  const copy = log.find((l) => l.startsWith('rescored copy '))?.slice('rescored copy '.length)
  rescore.push(...log.filter((l) => l && !l.startsWith('rescored copy ')))
  // The rescored copy is derived and the saved run stays: the score is what the round keeps.
  if (copy && STAGE0.some((run) => copy.startsWith(join(OUT_DIR, `${run}-rescore-`))))
    await rm(copy, { recursive: true, force: true })
}
const head = await git(['rev-parse', 'HEAD'])
const now: Baseline = { tree, head, at: new Date().toISOString(), quick: values.quick, sets, rescore }
const target = file(tree, values.quick)
await writeFile(`${target}.part`, JSON.stringify(now))
await rename(`${target}.part`, target)
await rm(RUNNING, { force: true })

// Compared with the committed code's full round by default (HEAD's tree; HEAD~1's when nothing is uncommitted).
const headTree = await git(['rev-parse', 'HEAD^{tree}'])
const ref = values.against ?? (headTree === tree ? 'HEAD~1' : 'HEAD')
const againstTree = await git(['rev-parse', `${ref}^{tree}`]).catch(() => ref)
const was = await readFile(file(againstTree), 'utf8').then(parseBaseline, () => null)
const { shown, full, open } = diff(now, was)
console.info(`\nCOMPLETE ${tree}: ${String(docs.length)} documents in ${minutes} min${values.quick ? ' (quick)' : ''}`)
console.info(
  was ? `against ${ref} (${againstTree})` : `no full round recorded for ${ref} (${againstTree}) to compare with`,
)
console.info(shown.join('\n'))
await writeFile(join(DIR, 'diff.txt'), full.join('\n'))
await writeFile(join(DIR, 'open.txt'), open.map((p) => `${p}\n`).join(''))
console.info(
  `\nfull report: ${join(DIR, 'diff.txt')}; pages to open beside their PDF: ${String(open.length)} (open.txt)`,
)
