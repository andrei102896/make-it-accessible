import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { PageStructure } from '@make-it-accessible/pipeline/model/schema'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { ICON_AT } from '@make-it-accessible/pipeline/validate/iconmarks'
import { readFromImage, type Validation } from '@make-it-accessible/pipeline/validate/validate'

// A held detail a person checked against the PDF by hand (CLIENT_FLOW §4): recorded beside the run (`pnpm run approve`),
// bound to the words the page publishes there, never to an error. It goes live; the owner is told and can correct it.
export const APPROVED_FILE = 'approved.json'
export const Approval = z.object({
  pdfPage: z.number(),
  path: z.string(),
  problem: z.string(),
  words: z.string(),
  // The detail in the owner's words, for the report ("STILL / SPARKLING WATER, 330ml 2.50 and 750ml 4.25").
  label: z.string(),
  name: z.string(),
  at: z.string(),
})
export type Approval = z.infer<typeof Approval>

// The run's approvals; a file that does not parse is none of them, said in held.json, never a throw into the build.
export async function readApprovals(docDir: string): Promise<{ approvals: Approval[]; unreadable: boolean }> {
  const raw = await readFile(join(docDir, APPROVED_FILE), 'utf8').catch(() => null)
  if (raw === null) return { approvals: [], unreadable: false }
  try {
    return { approvals: z.array(Approval).parse(JSON.parse(raw)), unreadable: false }
  } catch {
    return { approvals: [], unreadable: true }
  }
}

const Cited = z.array(z.tuple([z.number(), z.number()]))
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// What the page publishes at a finding's path: its node as JSON, each citation as the words it shows. Null where no
// approval may hold: the page, an unresolved path, a finding naming another path too (consistency.ts).
export function wordsAt(page: PageStructure, e: Extraction, path: string, problem: string): string | null {
  // An unnamed icon's finding names its place and the words beside it: those are what a person checked.
  if (path.startsWith(ICON_AT)) return problem
  if (path === 'page' || /\bblocks\[\d+\]/.test(problem)) return null
  let node: unknown = page
  for (const [, key, index] of path.matchAll(/([A-Za-z]+)|\[(\d+)\]/g)) {
    const next: unknown = index !== undefined ? (Array.isArray(node) ? node[Number(index)] : undefined) : undefined
    node = key !== undefined ? (isRecord(node) && !Array.isArray(node) ? node[key] : undefined) : next
    if (node === undefined) return null
  }
  const hidden = new Set(e.hidden)
  return JSON.stringify(node, (key, value: unknown) => {
    const src = key === 'src' ? Cited.safeParse(value) : null
    if (!src?.success) return value
    return src.data
      .flatMap(([from, to]) => e.runs.slice(from, to + 1))
      .filter((r) => !hidden.has(r.id))
      .map((r) => r.str)
      .join(' ')
  })
}

export type Held = { pdfPage: number; path: string; problem: string; words: string | null }
export type Checked = { pdfPage: number; label: string; name: string; at: string }
type Page = {
  pdfPage: number
  validation: Pick<Validation, 'errors' | 'review' | 'generated'>
  structure: PageStructure
  extraction: Extraction
}

// What holds a document: unconverted pages, errors, and each doubt no approval matches exactly (page, path, problem,
// words); a void approval holds too, so a rule change never silently takes back a decision.
export function heldOf(
  expected: readonly number[],
  pages: readonly Page[],
  approvals: readonly Approval[] = [],
  unreadable = false,
): { held: Held[]; checked: Checked[] } {
  const built = new Set(pages.map((p) => p.pdfPage))
  const held: Held[] = expected
    .filter((n) => !built.has(n))
    .map((pdfPage) => ({
      pdfPage,
      path: 'page',
      problem: 'the page did not convert (failure.txt in its folder)',
      words: null,
    }))
  if (unreadable)
    held.push({
      pdfPage: expected[0] ?? 1,
      path: APPROVED_FILE,
      problem: `${APPROVED_FILE} unreadable: no approval applied`,
      words: null,
    })
  const checked: Checked[] = []
  for (const p of pages) {
    held.push(...p.validation.errors.map((f) => ({ pdfPage: p.pdfPage, ...f, words: null })))
    for (const f of [...p.validation.review, ...p.validation.generated.filter(readFromImage)]) {
      const words = wordsAt(p.structure, p.extraction, f.path, f.problem)
      const mine = approvals.filter((a) => a.pdfPage === p.pdfPage && a.path === f.path && a.problem === f.problem)
      const match = words !== null ? mine.find((a) => a.words === words) : undefined
      if (match) {
        checked.push({ pdfPage: p.pdfPage, label: match.label, name: match.name, at: match.at })
        continue
      }
      held.push({ pdfPage: p.pdfPage, ...f, words })
      if (mine.length)
        held.push({
          pdfPage: p.pdfPage,
          path: f.path,
          problem: 'an approval recorded for this detail no longer matches its words',
          words: null,
        })
    }
  }
  return { held, checked }
}
