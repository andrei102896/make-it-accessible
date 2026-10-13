import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { hashes } from './file-hashes.ts'
import { ROOT } from './paths.ts'

// The tools a key writer runs with; anything else in its transcript discards the key.
export const WRITER_TOOLS = ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'] as const

const StageRecord = z
  .object({
    doc: z.string(),
    pdfPage: z.number(),
    rule: z.string(),
    pdf: z.string(),
    pdfSha256: z.string(),
    wordsSha256: z.string(),
    ledgerSha256: z.string(),
    files: z.record(z.string(), z.string()),
    writers: z.object({ a: z.record(z.string(), z.string()), b: z.record(z.string(), z.string()) }),
  })
  .loose()
export type StageRecord = z.infer<typeof StageRecord>

export const loadRecord = async (page: string): Promise<StageRecord> =>
  StageRecord.parse(
    JSON.parse(await readFile(join(ROOT, 'validation', 'private', 'stage', 'dev', `${page}.json`), 'utf8')),
  )

const Event = z
  .object({
    type: z.string(),
    subtype: z.string().optional(),
    message: z.object({ content: z.unknown() }).loose().optional(),
  })
  .loose()
const Init = z.object({
  cwd: z.string(),
  tools: z.array(z.string()),
  mcp_servers: z.array(z.unknown()),
  model: z.string(),
  permissionMode: z.string(),
})
const Result = z.object({
  is_error: z.boolean(),
  total_cost_usd: z.number().optional(),
  num_turns: z.number().optional(),
  permission_denials: z.array(z.unknown()),
})
const Block = z.object({ type: z.string(), id: z.string().optional(), tool_use_id: z.string().optional() }).loose()
const ToolUse = z.object({ name: z.string(), input: z.record(z.string(), z.unknown()) })

export type Audit = {
  ok: boolean
  problems: string[]
  costUsd: number | null
  turns: number | null
  compactions: number
}
export type Where = { pageDir: string; writer: 'a' | 'b'; model: string; record: StageRecord }

const inside = (path: string, dir: string): boolean => {
  const r = relative(dir, resolve(dir, path))
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

// One tool call against the writer's allowlist: read the evidence and its own folder, write its own key, run its check.
function allowed(name: string, input: Record<string, unknown>, own: string, evidence: string): boolean {
  const str = (k: string): string | undefined => (typeof input[k] === 'string' ? input[k] : undefined)
  const readable = (p: string | undefined): boolean =>
    p === undefined || [evidence, own].some((dir) => inside(resolve(own, p), dir))
  switch (name) {
    case 'Read':
      return str('file_path') !== undefined && readable(str('file_path'))
    case 'Glob':
    case 'Grep':
      return (
        readable(str('path')) &&
        [str('pattern'), str('glob')].every((g) => g === undefined || (!g.includes('..') && !isAbsolute(g)))
      )
    case 'Write':
    case 'Edit':
      return str('file_path') === join(own, 'key.json')
    case 'Bash':
      return str('command') === join(own, 'run.sh') || str('command') === './run.sh'
    default:
      return false
  }
}

export function transcriptProblems(lines: unknown[], where: Where): Omit<Audit, 'ok'> {
  const own = join(where.pageDir, where.writer)
  const evidence = join(where.pageDir, 'evidence')
  const problems: string[] = []
  const events = lines.map((l) => Event.parse(l))
  const init = Init.safeParse(events.find((e) => e.type === 'system' && e.subtype === 'init'))
  if (!init.success) problems.push('no init event')
  else {
    const i = init.data
    if ([...i.tools].sort().join() !== [...WRITER_TOOLS].join()) problems.push(`tools ${i.tools.join(',')}`)
    if (i.mcp_servers.length) problems.push('MCP servers were loaded')
    if (i.permissionMode !== 'dontAsk') problems.push(`permission mode ${i.permissionMode}`)
    if (i.model !== where.model) problems.push(`model ${i.model}`)
    if (resolve(i.cwd) !== own) problems.push(`ran in ${i.cwd}`)
  }
  const uses = new Map<string, z.infer<typeof ToolUse>>()
  const answered = new Set<string>()
  for (const e of events) {
    const content = e.message?.content
    if (!Array.isArray(content)) continue
    for (const raw of content) {
      const b = Block.parse(raw)
      if (b.type === 'tool_use' && b.id) uses.set(b.id, ToolUse.parse(raw))
      if (b.type === 'tool_result' && b.tool_use_id) answered.add(b.tool_use_id)
    }
  }
  for (const [id, use] of uses) {
    if (!allowed(use.name, use.input, own, evidence))
      problems.push(`${use.name} outside the allowlist: ${JSON.stringify(use.input).slice(0, 160)}`)
    if (!answered.has(id)) problems.push(`${use.name} call without a result`)
  }
  const result = Result.safeParse(events.findLast((e) => e.type === 'result'))
  if (!result.success) problems.push('no result event: the run did not finish')
  else {
    if (result.data.is_error) problems.push('the run ended in an error')
    if (result.data.permission_denials.length)
      problems.push(`${String(result.data.permission_denials.length)} denied tool calls`)
  }
  return {
    problems,
    costUsd: result.success ? (result.data.total_cost_usd ?? null) : null,
    turns: result.success ? (result.data.num_turns ?? null) : null,
    compactions: events.filter((e) => e.type === 'system' && (e.subtype ?? '').includes('compact')).length,
  }
}

// The writer's folder and the evidence after the run: unchanged evidence, its run.sh, its key on the staged evidence.
async function folderProblems(where: Where): Promise<string[]> {
  const { pageDir, writer, record } = where
  const problems: string[] = []
  const evidence = await hashes(join(pageDir, 'evidence'))
  const sorted = (h: Record<string, string>): string => JSON.stringify(Object.entries(h).sort())
  if (sorted(evidence) !== sorted(record.files)) problems.push('the evidence changed')
  const own = join(pageDir, writer)
  const names = (await readdir(own)).sort()
  if (names.join() !== 'key.json,run.sh') problems.push(`the writer folder holds ${names.join(', ')}`)
  const ownHashes = await hashes(own)
  if (ownHashes['run.sh'] !== record.writers[writer]['run.sh']) problems.push('run.sh changed')
  const keyPath = join(own, 'key.json')
  if (!existsSync(keyPath)) return [...problems, 'no key written']
  const key = z
    .object({
      doc: z.string(),
      pdfSha256: z.string(),
      pages: z.array(z.object({ pdfPage: z.number(), wordsSha256: z.string(), ledgerSha256: z.string() }).loose()),
    })
    .loose()
    .safeParse(JSON.parse(await readFile(keyPath, 'utf8')))
  if (!key.success) return [...problems, 'the key does not carry its evidence hashes']
  const [page, ...more] = key.data.pages
  const same =
    key.data.doc === record.doc &&
    key.data.pdfSha256 === record.pdfSha256 &&
    more.length === 0 &&
    page?.pdfPage === record.pdfPage &&
    page.wordsSha256 === record.wordsSha256 &&
    page.ledgerSha256 === record.ledgerSha256
  if (!same) problems.push('the key names other evidence than the staged page')
  return problems
}

export async function audit(transcript: string, where: Where): Promise<Audit> {
  const text = await readFile(transcript, 'utf8')
  const lines: unknown[] = []
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      lines.push(JSON.parse(line))
    } catch {
      return { ok: false, problems: ['the transcript is not JSON lines'], costUsd: null, turns: null, compactions: 0 }
    }
  }
  const run = transcriptProblems(lines, where)
  const problems = [...run.problems, ...(await folderProblems(where))]
  return { ...run, ok: problems.length === 0, problems }
}
