import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { compareKeys } from './compare-keys.ts'
import { loadKeyFile } from './keys.ts'
import { loadSplit } from './manifest.ts'

// Two blind keys of one dev or tuning page, difference by difference, for the arbiter; exit 1 when they differ.
const { positionals } = parseArgs({ allowPositionals: true })
const [fileA, fileB] = positionals
if (!fileA || !fileB) throw new Error('usage: pnpm keys:compare <a/key.json> <b/key.json>')
// The developer sees test keys as counts only (that mode comes with the test half), so refuse before any error
// message could quote one.
const split = await loadSplit()
for (const file of [fileA, fileB]) {
  const { doc } = z
    .object({ doc: z.string() })
    .loose()
    .parse(JSON.parse(await readFile(resolve(file), 'utf8')))
  if (split[doc] === undefined || split[doc] === 'test') throw new Error(`${file}: not a dev or tuning document`)
}
const [a, b] = await Promise.all([loadKeyFile(resolve(fileA)), loadKeyFile(resolve(fileB))])
if (!a.v3 || !b.v3) throw new Error('both keys must be version 3')

const diffs = compareKeys({ raw: a.v3.raw, pages: a.pages }, { raw: b.v3.raw, pages: b.pages })
for (const d of diffs) console.info(`${d.area} ${d.at}\n  a: ${d.a}\n  b: ${d.b}`)
for (const [side, key] of [
  ['a', a],
  ['b', b],
] as const)
  for (const d of key.disputes) console.info(`dispute ${side} p${String(d.keyPage)}: ${d.note}`)
const counts = Map.groupBy(diffs, (d) => d.area)
console.info(
  `${String(diffs.length)} differences${diffs.length ? `: ${[...counts].map(([k, v]) => `${k} ${String(v.length)}`).join(', ')}` : ''}; disputes a ${String(a.disputes.length)}, b ${String(b.disputes.length)}`,
)
process.exitCode = diffs.length || a.disputes.length || b.disputes.length ? 1 : 0
