import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { loadKeyFile, validateKey, visibleProblems, wordsDir } from './keys.ts'
import { snapshotDrift } from './snapshot.ts'
import { loadSplit } from './manifest.ts'

// One key file against its PDF; problems of a sealed test key print only with --details (key writers, Andrei).
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pdf: { type: 'string' },
    set: { type: 'string', default: 'dev' },
    details: { type: 'boolean', default: false },
    expect: { type: 'string' },
  },
})
const [file] = positionals
if (!file)
  throw new Error(
    'usage: pnpm keys:check <key.json> [--pdf <file.pdf>] [--set dev|test] [--details] [--expect <doc>:<pdfPage>]',
  )
// A key writer's key may name only its own page: its doc and pages pick the files validation reads.
if (values.expect) {
  const [doc, page] = values.expect.split(':')
  const own = z
    .object({ doc: z.literal(doc), pages: z.array(z.object({ pdfPage: z.literal(Number(page)) }).loose()).length(1) })
    .loose()
    .safeParse(JSON.parse(await readFile(resolve(file), 'utf8')))
  if (!own.success) throw new Error(`the key must be the key of ${values.expect} alone`)
}
const key = await loadKeyFile(resolve(file), values.pdf === undefined ? undefined : resolve(values.pdf))
const set = z.enum(['dev', 'test']).parse(values.set)
const sealed = set === 'test' || (await loadSplit())[key.doc] === 'test'
const problems = await validateKey(key, set)
const where = { dir: await wordsDir(key.doc), doc: key.doc }
for (const page of key.v3?.raw.pages ?? [])
  if (await snapshotDrift(key.pdfPath, page.pdfPage, where))
    console.warn(
      `warning: Poppler now reads p${String(page.keyPage)} differently; the frozen snapshot stays authoritative`,
    )
visibleProblems(problems, sealed, values.details).forEach((line) => {
  console.info(line)
})
process.exitCode = problems.length ? 1 : 0
