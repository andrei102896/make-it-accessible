import { copyFile, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { formatTargets, parseTargets, SentEmailSchema, type SentEmail, type Target } from './outreach.ts'
import { OUTREACH_DIR } from './paths.ts'

const TARGETS = join(OUTREACH_DIR, 'targets.csv')

export const readTargets = async (): Promise<Target[]> => parseTargets(await readFile(TARGETS, 'utf8'))

// targets.csv is the only record of the wave (gitignored): the previous copy is kept and the new one replaces it whole.
export async function writeTargets(targets: readonly Target[]): Promise<void> {
  const text = formatTargets(targets)
  parseTargets(text)
  await copyFile(TARGETS, `${TARGETS}.bak`)
  await writeFile(`${TARGETS}.tmp`, text)
  await rename(`${TARGETS}.tmp`, TARGETS)
}

// The first emails as drafted, batch1.json, batch2.json… in the order written.
export async function readBatches(): Promise<SentEmail[][]> {
  const files = (await readdir(OUTREACH_DIR))
    .filter((f) => /^batch\d+\.json$/.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  return Promise.all(
    files.map(async (f) => z.array(SentEmailSchema).parse(JSON.parse(await readFile(join(OUTREACH_DIR, f), 'utf8')))),
  )
}

// The local day, not UTC's: run early in Romania (UTC+3), UTC would still be yesterday.
export const localDay = (d: Date): string => d.toLocaleDateString('en-CA')
