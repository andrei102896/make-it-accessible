import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Poppler's command-line tools, bounded in time and output.
const run = promisify(execFile)
// Slowest call on the set (2026-10-18): 6.6 s, pdftoppm on Kenny & Ziggy's p1 at 300 dpi; an untrusted PDF that
// hangs is killed here, never holding the worker.
const POPPLER_TIMEOUT_MS = 120_000
const limits = { timeout: POPPLER_TIMEOUT_MS, killSignal: 'SIGKILL' } as const
export const poppler = (file: string, args: readonly string[], options: { maxBuffer?: number } = {}) =>
  run(file, args, { ...options, ...limits, encoding: 'utf8' })
export const popplerBytes = (file: string, args: readonly string[], options: { maxBuffer?: number } = {}) =>
  run(file, args, { ...options, ...limits, encoding: 'buffer' })
export const MAX_BUFFER = 64 * 1024 * 1024
