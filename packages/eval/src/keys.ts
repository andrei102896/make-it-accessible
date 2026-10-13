import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractPage } from '@make-it-accessible/pipeline/pdf/poppler'
import { centPartner, joinRuns } from '@make-it-accessible/pipeline/pdf/runs'
import { type Run } from '@make-it-accessible/pipeline/pdf/types'
import { moneyFromParts, parseMoney } from '@make-it-accessible/pipeline/text/money'
import { canon } from '@make-it-accessible/pipeline/text/normalize'
import { KeyDocSchema, type KeyPage, type KeyProduct } from './key-schema.ts'
import type { KeySet } from './manifest.ts'
import { DOCS_DIR, KEYS_DIR } from './paths.ts'
import { readMoney } from './score/money.ts'

export type { KeyPage, KeyPrice, KeyProduct, KeySection } from './key-schema.ts'
export type KeyDoc = ReturnType<typeof KeyDocSchema.parse> & { pdfPath: string }

export async function loadKey(doc: string): Promise<KeyDoc> {
  const parsed = KeyDocSchema.parse(JSON.parse(await readFile(join(KEYS_DIR, `${doc}.json`), 'utf8')))
  return { ...parsed, pdfPath: join(DOCS_DIR, parsed.pdf) }
}

// Amounts printed on the page; `pairs` only those printed as large euros with small cents (two words).
function pageAmounts(runs: readonly Run[]): { amounts: Set<number>; pairs: Set<number> } {
  const amounts = new Set<number>()
  const pairs = new Set<number>()
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
    if (value !== null && cents) pairs.add(value)
  }
  return { amounts, pairs }
}

const occurrences = (haystack: string, needle: string): number => haystack.split(canon(needle)).length - 1

type Check = { where: string; text: string; amounts: Set<number>; pairs: Set<number>; problems: string[] }

function checkProduct(p: KeyProduct, c: Check, set: KeySet, currency: string): void {
  const mustExist = (s: string, what: string): void => {
    if (occurrences(c.text, s) === 0) c.problems.push(`${c.where}: ${what} "${s}" not in the text layer`)
  }
  p.mustContain.forEach((s) => {
    mustExist(s, `mustContain of ${p.anchor}`)
  })
  if (p.articleNo) mustExist(p.articleNo, 'article number')
  else if (occurrences(c.text, p.anchor) !== 1)
    c.problems.push(`${c.where}: product anchor "${p.anchor}" occurs ${occurrences(c.text, p.anchor)} times`)
  if (p.prices) {
    for (const price of p.prices) {
      const read = readMoney(price.printed)
      // Euros with small cents are two words; such an amount is proven by the pair, not by the printed string.
      const printed = occurrences(c.text, price.printed) > 0 || c.pairs.has(price.cents)
      if (!printed) c.problems.push(`${c.where}: ${p.anchor} price "${price.printed}" not printed on the page`)
      if (read?.cents !== price.cents && !c.pairs.has(price.cents))
        c.problems.push(`${c.where}: ${p.anchor} "${price.printed}" does not read as ${price.cents}`)
      if (read?.currency && read.currency !== price.currency)
        c.problems.push(
          `${c.where}: ${p.anchor} "${price.printed}" is ${read.currency}, keyed ${String(price.currency)}`,
        )
      if (price.currency !== null && price.currency !== currency && !read?.currency)
        c.problems.push(
          `${c.where}: ${p.anchor} "${price.printed}" has no printed currency but differs from the document's`,
        )
    }
  } else {
    if (set !== 'tuning') c.problems.push(`${c.where}: ${p.anchor} uses stage-0 money fields; new keys use prices`)
    const money = p.money ?? []
    for (const m of [...money, ...p.optional])
      if (!c.amounts.has(m)) c.problems.push(`${c.where}: ${p.anchor} amount ${m} not printed on the page`)
    if (!p.roleFree.every((o) => money.includes(o)))
      c.problems.push(`${c.where}: ${p.anchor} roleFree amount not in money`)
    if (!p.old.every((o) => money.includes(o))) c.problems.push(`${c.where}: ${p.anchor} old price not in money`)
  }
}

function checkPage(page: KeyPage, c: Check, set: KeySet, currency: string): void {
  const mustExist = (s: string, what: string): void => {
    if (occurrences(c.text, s) === 0) c.problems.push(`${c.where}: ${what} "${s}" not in the text layer`)
  }
  if (page.expect === 'unsupported') {
    const content = [page.readingOrder, page.products, page.headings, page.tables, page.mustContain]
    if (content.some((list) => list.length)) c.problems.push(`${c.where}: an unsupported page keys no content`)
    return
  }
  if (page.scope === 'full' && !page.readingOrder.length)
    c.problems.push(`${c.where}: a full key needs a reading order`)
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
      .flatMap((cell) => cell.split(/\s+/))
      .forEach((w) => {
        mustExist(w, 'table header word')
      })
    t.rows.flat().forEach((cell) => {
      mustExist(cell, 'table cell')
    })
    if (set !== 'tuning' && t.rows.some((r) => r.length !== t.header.length))
      c.problems.push(`${c.where}: new keys write every table row as wide as its header`)
  })
  page.mustContain.forEach((m) => {
    if (typeof m === 'string') mustExist(m, 'page mustContain')
    else if (!/\d/.test(m.text))
      c.problems.push(`${c.where}: seen text "${m.text}" has no digit; it belongs in C3 anchors`)
  })
  page.outsideTrim.forEach((s) => {
    mustExist(s, 'outside-trim text')
  })
  page.products.forEach((p) => {
    checkProduct(p, c, set, currency)
  })
}

export async function validateKey(key: KeyDoc, set: KeySet = 'tuning'): Promise<string[]> {
  const problems: string[] = []
  const texts = new Map<number, string>()
  for (const page of key.pages) {
    const { runs } = await extractPage(key.pdfPath, page.pdfPage)
    const text = canon(joinRuns(runs))
    texts.set(page.keyPage, text)
    checkPage(page, { where: `${key.doc} p${page.keyPage}`, text, ...pageAmounts(runs), problems }, set, key.currency)
  }
  for (const section of key.sections ?? []) {
    const text = texts.get(section.keyPage)
    if (text === undefined) problems.push(`${key.doc}: section for unknown key page ${section.keyPage}`)
    else
      section.anchors
        .filter((a) => occurrences(text, a) === 0)
        .forEach((a) => problems.push(`${key.doc} p${section.keyPage}: section anchor "${a}" not in the text layer`))
  }
  return problems
}
