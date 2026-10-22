import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { APPROVED_FILE, readApprovals, type Approval } from './approved.ts'
import { HELD_FILE } from './preview.ts'
import { loadSources, REBUILT_DIR, VERIFY_FILE } from './sources.ts'

// pnpm run approve <slug> <pdfPage> <path> --label "<owner's words>" --name <who> [--verify]: records a held detail checked
// against the PDF by hand, with the words the rebuilt page publishes there (approved.ts); rerender to apply it.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string' },
    name: { type: 'string' },
    verify: { type: 'boolean', default: false },
  },
})
const [slug, page, path] = positionals
const { label, name } = values
if (!slug || !page || !path || !label || !name)
  throw new Error('usage: pnpm run approve <slug> <pdfPage> <path> --label "<owner words>" --name <who> [--verify]')
const source = (await loadSources(values.verify ? VERIFY_FILE : undefined)).find((s) => s.slug === slug)
if (!source) throw new Error(`${slug}: not in the ${values.verify ? 'verification' : 'working'} set`)

// The finding as the last build held it: only one with the words it publishes, never an error or a page.
const held = z
  .array(z.object({ pdfPage: z.number(), path: z.string(), problem: z.string(), words: z.string().nullable() }))
  .safeParse(JSON.parse(await readFile(join(REBUILT_DIR, slug, HELD_FILE), 'utf8')))
if (!held.success) throw new Error(`${slug}: its held.json names no words (built before approvals): rerender it first`)
const finding = held.data.find((h) => h.pdfPage === Number(page) && h.path === path)
const { approvals, unreadable } = await readApprovals(source.run)
if (unreadable) throw new Error(`${join(source.run, APPROVED_FILE)}: unreadable, fix it by hand first`)
// A detail already released is relabelled only: its words, who checked it and when stay as recorded.
const recorded = approvals.find((a) => a.pdfPage === Number(page) && a.path === path)
const approvalOf = (): Approval => {
  if (finding) {
    if (finding.words === null)
      throw new Error(`${slug} p${page} ${path}: ${finding.problem}; no approval can release it`)
    return { ...finding, words: finding.words, label, name, at: new Date().toISOString() }
  }
  if (recorded) return { ...recorded, label }
  throw new Error(`${slug} p${page} ${path}: not held (rerender ${slug} first)`)
}
const approval = approvalOf()
const next = [...approvals.filter((a) => a.pdfPage !== approval.pdfPage || a.path !== approval.path), approval]
// The only record of a person's decision: the old file kept beside it, the new one written whole or not at all.
const file = join(source.run, APPROVED_FILE)
if (approvals.length) await copyFile(file, `${file}.bak`)
await writeFile(`${file}.part`, `${JSON.stringify(next, null, 2)}\n`)
await rename(`${file}.part`, file)
const did = finding ? `approved by ${name}` : `relabelled (checked by ${approval.name}, ${approval.at})`
console.info(`${slug} p${page} ${path}: ${did} (${String(next.length)} in ${file}); now pnpm rerender ${slug}`)
