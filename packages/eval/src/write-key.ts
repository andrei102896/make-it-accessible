import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { audit, loadRecord, WRITER_TOOLS } from './key-audit.ts'
import { fileSha256 } from './keys.ts'
import { loadLayoutLabels } from './manifest.ts'
import { ROOT } from './paths.ts'

// One blind key writer for one staged dev page: a headless Claude Code process confined to its folder, then audited.
const { values } = parseArgs({
  options: {
    page: { type: 'string' },
    writer: { type: 'string' },
    model: { type: 'string', default: 'claude-opus-5-5' },
    effort: { type: 'string', default: 'high' },
    budget: { type: 'string', default: '30' },
    minutes: { type: 'string', default: '90' },
    out: { type: 'string' },
  },
})
const page = z
  .string()
  .regex(/^\d{2}_[a-z_]+-p\d{2}$/)
  .parse(values.page)
const writer = z.enum(['a', 'b']).parse(values.writer)
const model = values.model
const budget = z.coerce.number().positive().parse(values.budget)
const minutes = z.coerce.number().positive().parse(values.minutes)
const pageDir = join(values.out ?? join(ROOT, '..', 'mia-keys'), 'dev', page)
const own = join(pageDir, writer)
const evidence = join(pageDir, 'evidence')
const PRIVATE = join(ROOT, 'validation', 'private')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const record = await loadRecord(page)

// A rerun starts from the staged folder: an earlier key is archived out of the writer's reach.
const present = (await readdir(own)).filter((n) => n !== 'run.sh')
if (present.some((n) => n !== 'key.json')) throw new Error(`${own} holds ${present.join(', ')}; clean it by hand`)
if ((await fileSha256(join(own, 'run.sh'))) !== record.writers[writer]['run.sh']) throw new Error('run.sh changed')
if (present.length) {
  const attempt = join(PRIVATE, 'attempts', 'dev', `${page}-${writer}-${stamp}`)
  await mkdir(attempt, { recursive: true })
  await rename(join(own, 'key.json'), join(attempt, 'key.json'))
}

const layouts = await loadLayoutLabels()
const layout = layouts[record.pdf]?.[record.pdfPage - 1]
if (!layout) throw new Error(`${page}: no layout label`)
const briefPath = join(ROOT, 'validation', 'WRITER_BRIEF.md')
const fill: Record<string, string> = {
  doc: record.doc,
  pdfPage: String(record.pdfPage),
  evidence,
  own,
  layout,
  rule: record.rule,
}
const brief = (await readFile(briefPath, 'utf8')).replace(/\{\{(\w+)\}\}/g, (_, k: string) => fill[k] ?? `{{${k}}}`)
if (brief.includes('{{')) throw new Error('the brief has an unfilled placeholder')

// Only what a writer must reach; Glob and Grep follow the Read rules.
const allowedTools = [
  `Read(/${evidence}/**)`,
  `Read(/${own}/**)`,
  `Glob(/${evidence}/**)`,
  `Glob(/${own}/**)`,
  `Grep(/${evidence}/**)`,
  `Grep(/${own}/**)`,
  `Write(/${own}/key.json)`,
  `Edit(/${own}/key.json)`,
  `Bash(${own}/run.sh)`,
  'Bash(./run.sh)',
]
const args = [
  '-p',
  brief,
  '--model',
  model,
  '--effort',
  values.effort,
  '--safe-mode',
  '--setting-sources',
  '',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--no-session-persistence',
  '--exclude-dynamic-system-prompt-sections',
  '--tools',
  WRITER_TOOLS.join(','),
  '--permission-mode',
  'dontAsk',
  '--allowedTools',
  ...allowedTools,
  '--add-dir',
  evidence,
  '--max-budget-usd',
  String(budget),
  '--output-format',
  'stream-json',
  '--verbose',
]
// No inherited secrets or settings: the process gets what Claude Code needs to run and authenticate.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TMPDIR'].includes(k) || k.startsWith('ANTHROPIC_'),
  ),
)

// Evidence the key's check reads must not appear or change while it runs (keys:check never writes it).
const snapshots = async (): Promise<string> => {
  const dirs = [join(ROOT, 'validation', 'words'), join(ROOT, 'validation', 'sealed', 'words')]
  const rows: string[] = []
  for (const dir of dirs.filter((d) => existsSync(d)))
    for (const name of (await readdir(dir)).sort()) {
      const info = await stat(join(dir, name))
      rows.push(`${dir}/${name} ${String(info.size)} ${String(info.mtimeMs)}`)
    }
  return rows.join('\n')
}

const runs = join(PRIVATE, 'transcripts', 'dev')
await mkdir(runs, { recursive: true })
const transcript = join(runs, `${page}-${writer}-${stamp}.jsonl`)
const before = await snapshots()
const started = Date.now()
let flushed: Promise<unknown> = Promise.resolve()
const code = await new Promise<number | null>((done, fail) => {
  const child = spawn('claude', args, {
    cwd: own,
    env: { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  const out = createWriteStream(transcript)
  const err = createWriteStream(`${transcript}.err`)
  child.stdout.pipe(out)
  child.stderr.pipe(err)
  flushed = Promise.all([finished(out), finished(err)])
  const timer = setTimeout(
    () => {
      if (child.pid) process.kill(-child.pid, 'SIGKILL')
    },
    minutes * 60 * 1000,
  )
  child.on('error', fail)
  child.on('close', (c) => {
    clearTimeout(timer)
    done(c)
  })
})
// The audit reads the whole transcript, so the file must be flushed after the process exits.
await flushed
const result = await audit(transcript, { pageDir, writer, model, record })
const problems = [
  ...(code === 0 ? [] : [`claude exited ${String(code)}`]),
  ...((await snapshots()) === before ? [] : ['word snapshots changed during the run']),
  ...result.problems,
]
const report = {
  page,
  writer,
  model,
  effort: values.effort,
  briefSha256: await fileSha256(briefPath),
  transcript,
  minutes: Math.round((Date.now() - started) / 600) / 100,
  costUsd: result.costUsd,
  turns: result.turns,
  compactions: result.compactions,
  ok: problems.length === 0,
  problems,
}
const audits = join(PRIVATE, 'audits', 'dev')
await mkdir(audits, { recursive: true })
await writeFile(join(audits, `${page}-${writer}-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`)
console.info(
  `${page} ${writer}: ${report.ok ? 'audit clean' : `DISCARD (${problems.join('; ')})`}, $${String(report.costUsd)}, ${String(report.minutes)} min, ${String(report.compactions)} compactions`,
)
process.exitCode = report.ok ? 0 : 1
