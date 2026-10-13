import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { z } from 'zod'
import { KeyDocV3Schema } from './key-schema-v3.ts'
import { hashes } from './file-hashes.ts'
import { fileSha256 } from './keys.ts'
import { ledger } from './ledger.ts'
import { DOCS_DIR, ROOT, WORDS_DIR } from './paths.ts'
import { snapshotPath, snapshotWords } from './snapshot.ts'
import { drawPage } from './stage-draw.ts'
import type { Rect } from './stage-geometry.ts'
import type { Word } from './words.ts'

// Builds one folder per selected page for two blind key writers: read-only evidence, and one output folder each.
const run = promisify(execFile)
const Selection = z.object({
  selection: z.record(
    z.string(),
    z.object({
      pdf: z.string(),
      set: z.enum(['dev', 'test']),
      pages: z.array(z.object({ pdfPage: z.number().int().positive(), rule: z.string() })),
    }),
  ),
})
const WRITERS = ['a', 'b'] as const

const { values } = parseArgs({
  options: { set: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' } },
})
// The test half is staged later, with counts-only output and a root the developer never reads (docs/HARDENING.md).
if (values.set !== 'dev') throw new Error('usage: pnpm keys:stage --set dev [--out <dir>] [--only <doc>-p<NN>]')
const out = values.out ?? join(ROOT, '..', 'mia-keys')

// MediaBox (the frame of renders and words) and TrimBox of one page, in points from the top left.
async function boxes(pdf: string, page: number): Promise<{ size: { w: number; h: number }; trim: Rect }> {
  const p = String(page)
  const { stdout } = await run('pdfinfo', ['-f', p, '-l', p, '-box', pdf])
  const box = (name: string): number[] => {
    const line = stdout.split('\n').find((l) => new RegExp(`^Page\\s+${p}\\s+${name}:`).test(l))
    const nums = line?.split(':')[1]?.trim().split(/\s+/).map(Number) ?? []
    if (nums.length !== 4) throw new Error(`pdfinfo gives no ${name} for page ${p}`)
    return nums
  }
  const [mx1 = 0, my1 = 0, mx2 = 0, my2 = 0] = box('MediaBox')
  const [tx1 = 0, ty1 = 0, tx2 = 0, ty2 = 0] = box('TrimBox')
  return { size: { w: mx2 - mx1, h: my2 - my1 }, trim: { x: tx1 - mx1, y: my2 - ty2, w: tx2 - tx1, h: ty2 - ty1 } }
}

// The snapshot's words by Poppler line: `flow.block.line | [index]word …`.
const lines = (words: readonly Word[]): string => {
  const rows: { line: string; text: string }[] = []
  words.forEach((w, i) => {
    const row = rows.at(-1)
    const cell = ` [${String(i)}]${w.str}`
    if (row?.line === w.line) row.text += cell
    else rows.push({ line: w.line, text: cell })
  })
  return rows.map((r) => `${r.line} |${r.text}\n`).join('')
}

// The only repository command a writer runs: the check of its own key, bound to its own page. The ledger's output is
// already in the evidence.
const runSh = (doc: string, page: number, key: string, pdf: string): string => `#!/bin/sh
set -eu
exec node '${join(ROOT, 'packages/eval/src/keys-check.ts')}' '${key}' --pdf '${pdf}' --details --expect '${doc}:${String(page)}'
`

const README = (dpi: number): string => `# Evidence for one page (read-only)

- \`page.png\`: the whole page at ${String(dpi)} DPI; the trim box is dashed green.
- \`overlay.png\`: the same with every ledger occurrence outlined and labelled (red; unreadable ones blue).
- \`tiles/rRcC.png\`: the page at 300 DPI in overlapping pieces, with rulers in PDF points every 50 pt; \`overlays/\` holds the
  same tiles with the outlines. \`tiles.json\` gives each tile's and crop's box in PDF points from the top left, the frame of
  the snapshot words and of an image amount's \`box\`.
- \`crops/<id>.png\`: each occurrence with its surroundings, at the DPI listed in \`tiles.json\`.
- \`ledger.json\`: the output of \`pnpm ledger <doc> <page> --details\`: the hashes to copy into the key, the occurrences, every snapshot word with
  its index \`i\`. \`lines.txt\`: the same words by Poppler line (\`flow.block.line | [index]word …\`); a word's text block is the
  first two parts of its line id.
- \`key.skeleton.json\`: the key to fill (the hashes and every occurrence id are in it); \`key.schema.json\`: its JSON Schema.
- \`KEY_POLICY.md\`: the rules; \`KEYS.md\`: key conventions and freeze log.
`

async function readOnly(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }))
    await chmod(join(entry.parentPath, entry.name), entry.isDirectory() ? 0o555 : 0o444)
  await chmod(dir, 0o555)
}

// Width and height from a PNG header.
const pngSize = (png: Buffer): { w: number; h: number } => ({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) })

async function stagePage(doc: string, pdfName: string, page: number, rule: string, commit: string): Promise<void> {
  const name = `${doc}-p${String(page).padStart(2, '0')}`
  const final = join(out, 'dev', name)
  if (existsSync(final)) {
    console.info(`${name}: already staged, left as it is`)
    return
  }
  // Built aside and renamed when complete, so a failed run never leaves a folder that looks staged.
  const dir = `${final}.partial`
  if (existsSync(dir)) {
    await run('chmod', ['-R', 'u+w', dir])
    await rm(dir, { recursive: true })
  }
  const evidence = join(dir, 'evidence')
  for (const sub of ['tiles', 'overlays', 'crops']) await mkdir(join(evidence, sub), { recursive: true })
  const source = join(DOCS_DIR, pdfName)
  const pdf = join(evidence, pdfName)
  await copyFile(source, pdf)
  const pdfSha256 = await fileSha256(source)
  if ((await fileSha256(pdf)) !== pdfSha256) throw new Error(`${name}: the PDF copy differs from the original`)
  const where = { dir: WORDS_DIR, doc }
  const { words, sha256: wordsSha256 } = await snapshotWords(source, page, where)
  // The snapshot is the frozen evidence; a writer must not be able to rewrite what its key's hashes prove.
  await chmod(snapshotPath(where, page), 0o444)
  const cli = await run('node', [join(ROOT, 'packages/eval/src/ledger-cli.ts'), doc, String(page), '--details'])
  const printed = z.object({ ledgerSha256: z.string(), wordsSha256: z.string() }).loose().parse(JSON.parse(cli.stdout))
  if (printed.wordsSha256 !== wordsSha256) throw new Error(`${name}: the ledger read another snapshot`)
  await writeFile(join(evidence, 'ledger.json'), cli.stdout)
  await writeFile(join(evidence, 'lines.txt'), lines(words))
  const occurrences = ledger(words)
  const { size, trim } = await boxes(source, page)
  const render = join(tmpdir(), `mia-stage-${name}`)
  const args = ['-q', '-f', String(page), '-l', String(page), '-r', '300', '-png', '-singlefile', source, render]
  let drawn
  try {
    await run('pdftoppm', args)
    const rendered = pngSize(await readFile(`${render}.png`))
    if (Math.abs(rendered.w - (size.w * 300) / 72) > 2 || Math.abs(rendered.h - (size.h * 300) / 72) > 2)
      throw new Error(`${name}: the render is not the MediaBox the words are measured in`)
    const marks = occurrences.map((o) => ({ id: o.id, box: o.box, unreadable: o.unreadable }))
    drawn = await drawPage(`${render}.png`, size, marks, trim, evidence)
  } finally {
    await rm(`${render}.png`, { force: true })
  }
  await writeFile(join(evidence, 'tiles.json'), `${JSON.stringify({ page: size, trim, ...drawn }, null, 2)}\n`)
  await writeFile(join(evidence, 'README.md'), README(drawn.overview.dpi))
  for (const f of ['KEY_POLICY.md', 'KEYS.md']) await copyFile(join(ROOT, 'validation', f), join(evidence, f))
  const schema = z.toJSONSchema(KeyDocV3Schema, { io: 'input', unrepresentable: 'any' })
  await writeFile(join(evidence, 'key.schema.json'), `${JSON.stringify(schema, null, 2)}\n`)
  const skeleton = {
    version: 3,
    doc,
    pdf: pdfName,
    pdfSha256,
    lang: '<BCP 47 tag of the document language, e.g. de-DE>',
    currency: '<EUR | GBP | CHF | USD: the currency the document prices in>',
    pages: [
      {
        pdfPage: page,
        keyPage: 1,
        type: '<grid | pricelist | table | text>',
        wordsSha256,
        ledgerSha256: printed.ledgerSha256,
        readingOrder: [],
        products: [],
        occurrences: Object.fromEntries(occurrences.map((o) => [o.id, '<claim>'])),
      },
    ],
  }
  await writeFile(join(evidence, 'key.skeleton.json'), `${JSON.stringify(skeleton, null, 2)}\n`)
  for (const w of WRITERS) {
    await mkdir(join(dir, w))
    const sh = runSh(doc, page, join(final, w, 'key.json'), join(final, 'evidence', pdfName))
    await writeFile(join(dir, w, 'run.sh'), sh, { mode: 0o755 })
  }
  const record = {
    doc,
    pdfPage: page,
    set: 'dev',
    rule,
    commit,
    pdf: pdfName,
    pdfSha256,
    wordsSha256,
    ledgerSha256: printed.ledgerSha256,
    policySha256: await fileSha256(join(ROOT, 'validation', 'KEY_POLICY.md')),
    schemaSha256: await fileSha256(join(ROOT, 'packages/eval/src/key-schema-v3.ts')),
    files: await hashes(evidence),
    writers: { a: await hashes(join(dir, 'a')), b: await hashes(join(dir, 'b')) },
  }
  await writeFile(join(evidence, 'stage.json'), `${JSON.stringify(record, null, 2)}\n`)
  // A copy inside the repository, out of the writers' reach, is what the transcript audit compares against.
  const ledgerOfRecord = join(ROOT, 'validation', 'private', 'stage', 'dev')
  await mkdir(ledgerOfRecord, { recursive: true })
  await copyFile(join(evidence, 'stage.json'), join(ledgerOfRecord, `${name}.json`))
  await readOnly(evidence)
  await rename(dir, final)
  console.info(`${name}: ${String(occurrences.length)} occurrences, ${String(drawn.tiles.length)} tiles`)
}

const { selection } = Selection.parse(JSON.parse(await readFile(join(ROOT, 'validation', 'selection.json'), 'utf8')))
// Evidence must be reproducible from a commit: the record names it, and the audit rebuilds from it.
if ((await run('git', ['status', '--porcelain'], { cwd: ROOT })).stdout.trim() !== '')
  throw new Error('commit or stash your changes first: staged evidence must come from a commit')
const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim()
for (const [doc, entry] of Object.entries(selection)) {
  if (entry.set !== 'dev') continue
  for (const { pdfPage, rule } of entry.pages) {
    if (values.only && values.only !== `${doc}-p${String(pdfPage).padStart(2, '0')}`) continue
    await stagePage(doc, entry.pdf, pdfPage, rule, commit)
  }
}
