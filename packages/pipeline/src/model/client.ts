import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { SYSTEM_PROMPT } from './prompt.ts'

// Slowest page on record: 161 s (cost.json, 2026-10-18); a call past this is killed and the page fails, never hangs.
const MODEL_TIMEOUT_MS = 600_000

const ModelUsage = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
})
const ResultEvent = z.object({
  type: z.literal('result'),
  result: z.string().optional(),
  is_error: z.boolean().optional(),
  modelUsage: z.record(z.string(), ModelUsage).optional(),
})

export type Usage = { input: number; cacheWrite: number; cacheRead: number; output: number }
export type ModelCall = { raw: string; usage: Usage; ms: number }
export type ModelOptions = { model: string; effort: string }

// Stage 0 runs on Andrei's Claude subscription through Claude Code headless mode; the MVP swaps this for @anthropic-ai/sdk.
export async function callModel(
  imagePaths: string | readonly string[],
  userText: string,
  options: ModelOptions,
  systemPrompt = SYSTEM_PROMPT,
): Promise<ModelCall> {
  const images = await Promise.all(
    [imagePaths].flat().map(async (path) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: (await readFile(path)).toString('base64') },
    })),
  )
  const message = {
    type: 'user',
    message: { role: 'user', content: [...images, { type: 'text', text: userText }] },
  }
  const args = [
    '-p',
    '--model',
    options.model,
    '--effort',
    options.effort,
    '--system-prompt',
    systemPrompt,
    '--tools',
    '',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
  ]
  const started = Date.now()
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: MODEL_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`claude exited ${String(code)}: ${err.slice(0, 500)}`))
    })
    child.stdin.end(`${JSON.stringify(message)}\n`)
  })
  const result = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => ResultEvent.safeParse(JSON.parse(line)))
    .find((event) => event.success)?.data
  if (!result || result.is_error || result.result === undefined)
    throw new Error(`model call failed: ${stdout.slice(-500)}`)
  const usage = result.modelUsage?.[options.model]
  if (!usage) throw new Error(`no usage reported for ${options.model}`)
  return {
    raw: result.result,
    ms: Date.now() - started,
    usage: {
      input: usage.inputTokens,
      cacheWrite: usage.cacheCreationInputTokens,
      cacheRead: usage.cacheReadInputTokens,
      output: usage.outputTokens,
    },
  }
}
