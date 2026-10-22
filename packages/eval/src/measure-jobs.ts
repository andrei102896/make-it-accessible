import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'
import { DEGRADED } from '@make-it-accessible/pipeline/degraded'

// One CLI of the round run as a child process (its own browser, pdf.js and memory, as when run by hand), its stdout
// and stderr in one log file.
export type Job = { name: string; args: readonly string[]; log: string }
export type Ran = { job: Job; code: number | null; slept: boolean; degraded: string[]; started: number; ms: number }

const exec = promisify(execFile)
// Children still running: stopped with the round, so none goes on writing out/rebuilt after it (RUNNING stays: the
// next round says this one was interrupted).
const live = new Set<ChildProcess>()
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    for (const child of live) child.kill('SIGKILL')
    process.exit(1)
  })

// The Mac's last wake time: a job during which it changed slept, and its deadlines fired on waking (Node's clocks
// count through sleep, so no clock difference shows it). Empty off macOS.
export async function waketime(): Promise<string> {
  if (process.platform !== 'darwin') return ''
  return (await exec('sysctl', ['-n', 'kern.waketime'])).stdout.trim()
}

export async function runJob(job: Job): Promise<Ran> {
  await mkdir(dirname(job.log), { recursive: true })
  const woke = await waketime()
  const started = Date.now()
  const log = createWriteStream(job.log)
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, job.args, { stdio: ['ignore', 'pipe', 'pipe'] })
    live.add(child)
    child.stdout.pipe(log, { end: false })
    child.stderr.pipe(log, { end: false })
    child.on('error', reject)
    child.on('close', (code) => {
      live.delete(child)
      resolve(code)
    })
  })
  await new Promise<void>((resolve) => log.end(resolve))
  const lines = (await readFile(job.log, 'utf8')).split('\n')
  return {
    job,
    code,
    slept: (await waketime()) !== woke,
    degraded: lines.filter((l) => l.startsWith(`${DEGRADED} `)),
    started,
    ms: Date.now() - started,
  }
}

// A result is read only when its job ran through awake, without a fallback, and ended well.
export const clean = (r: Ran): boolean => r.code === 0 && !r.slept && !r.degraded.length

// Runs `jobs` `n` at a time; `then` may queue follow-up jobs (a document's judges after its rebuild), run first.
export async function drain(jobs: Job[], n: number, then: (r: Ran) => Promise<Job[]>): Promise<void> {
  const queue = [...jobs]
  let active = 0
  await new Promise<void>((resolve, reject) => {
    const next = (): void => {
      if (!queue.length && !active) resolve()
      while (active < n && queue.length) {
        const job = queue.shift()
        if (!job) break
        active++
        runJob(job)
          .then(then)
          .then((more) => {
            queue.unshift(...more)
            active--
            next()
          }, reject)
      }
    }
    next()
  })
}
