import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractPage } from '@make-it-accessible/pipeline/pdf/poppler'
import { centPartner, joinRuns } from '@make-it-accessible/pipeline/pdf/runs'
import { type Run } from '@make-it-accessible/pipeline/pdf/types'
import { moneyFromParts, parseMoney } from '@make-it-accessible/pipeline/text/money'
import { canon } from '@make-it-accessible/pipeline/text/normalize'
import { z } from 'zod'
import { DOCS_DIR, KEYS_DIR } from './paths.ts'

const OrderEntry = z.object({ anchor: z.string().min(1), kind: z.enum(['text', 'imageOnlyText']) })
const Product = z.object({
  anchor: z.string().min(1),
  articleNo: z.string().optional(),
  // null: the product has no picture, so C4 does not score it.
  alt: z.string().nullable().optional(),
  money: z.array(z.number().int()).min(1),
  old: z.array(z.number().int()),
  roleFree: z.array(z.number().int()).default([]),
  optional: z.array(z.number().int()).default([]),
  mustContain: z.array(z.string()),
})
const KeyPage = z.object({
  pdfPage: z.number().int().positive(),
  keyPage: z.number().int().positive(),
  heldOut: z.boolean().optional(),
  readingOrder: z.array(z.array(OrderEntry).min(1)).min(1),
  products: z.array(Product),
  headings: z.array(z.object({ anchor: z.string().min(1), level: z.number().int().min(1).max(6) })),
  tables: z.array(z.object({ header: z.array(z.string()), rows: z.array(z.array(z.string())) })),
  mustNotAppear: z.array(z.string()),
})
const KeyDoc = z.object({ doc: z.string(), pdf: z.string(), lang: z.string(), pages: z.array(KeyPage).min(1) })

export type KeyProduct = z.infer<typeof Product>
export type KeyPage = z.infer<typeof KeyPage>
export type KeyDoc = z.infer<typeof KeyDoc> & { pdfPath: string }

export async function loadKey(doc: string): Promise<KeyDoc> {
  const parsed = KeyDoc.parse(JSON.parse(await readFile(join(KEYS_DIR, `${doc}.json`), 'utf8')))
  return { ...parsed, pdfPath: join(DOCS_DIR, parsed.pdf) }
}

function pageAmounts(runs: readonly Run[]): Set<number> {
  const amounts = new Set<number>()
  for (const r of runs) {
    const cents = centPartner(r, runs)
    const value = cents
      ? moneyFromParts([
          { str: r.str, height: r.box.h },
          { str: cents.str, height: cents.box.h },
        ])
      : /[.,€£$]/.test(r.str)
        ? parseMoney(r.str)
        : null
    if (value !== null) amounts.add(value)
  }
  return amounts
}

const occurrences = (haystack: string, needle: string): number => haystack.split(canon(needle)).length - 1

export async function validateKey(key: KeyDoc): Promise<string[]> {
  const problems: string[] = []
  for (const page of key.pages) {
    const { runs } = await extractPage(key.pdfPath, page.pdfPage)
    const text = canon(joinRuns(runs))
    const amounts = pageAmounts(runs)
    const where = `${key.doc} p${page.keyPage}`
    const mustExist = (s: string, what: string): void => {
      if (occurrences(text, s) === 0) problems.push(`${where}: ${what} "${s}" not in the text layer`)
    }
    page.readingOrder
      .flat()
      .filter((e) => e.kind === 'text')
      .forEach((e) => {
        mustExist(e.anchor, 'reading-order anchor')
      })
    page.headings.forEach((h) => {
      mustExist(h.anchor, 'heading anchor')
    })
    // Header cells wrap over lines that the stream interleaves with other columns, so they are checked word by word.
    page.tables.forEach((t) => {
      t.header
        .flatMap((c) => c.split(/\s+/))
        .forEach((w) => {
          mustExist(w, 'table header word')
        })
      t.rows.flat().forEach((c) => {
        mustExist(c, 'table cell')
      })
    })
    for (const p of page.products) {
      p.mustContain.forEach((s) => {
        mustExist(s, `mustContain of ${p.anchor}`)
      })
      if (p.articleNo) mustExist(p.articleNo, 'article number')
      else if (occurrences(text, p.anchor) !== 1)
        problems.push(`${where}: product anchor "${p.anchor}" occurs ${occurrences(text, p.anchor)} times`)
      for (const m of [...p.money, ...p.optional])
        if (!amounts.has(m)) problems.push(`${where}: ${p.anchor} amount ${m} not printed on the page`)
      if (!p.roleFree.every((o) => p.money.includes(o)))
        problems.push(`${where}: ${p.anchor} roleFree amount not in money`)
      if (!p.old.every((o) => p.money.includes(o))) problems.push(`${where}: ${p.anchor} old price not in money`)
    }
  }
  return problems
}
