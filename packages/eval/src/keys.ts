import { z } from 'zod'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canon } from '@make-it-accessible/pipeline/text/normalize'
import { provenAmounts } from './key-proof.ts'
import { KeyDocV3Schema, type KeyDocV3 } from './key-schema-v3.ts'
import { KeyDocSchema, type KeyPage, type KeyProduct, type KeySection } from './key-schema.ts'
import { renderedCells, validateV3Page } from './key-v3-check.ts'
import { fromV3Page, ledgerSha256 } from './key-v3.ts'
import { ledger, type Occurrence } from './ledger.ts'
import { loadSplit, type KeySet } from './manifest.ts'
import { DOCS_DIR, KEYS_DIR, SEALED_DIR, WORDS_DIR } from './paths.ts'
import { frozenWords } from './snapshot.ts'
import { pageWords, type Word } from './words.ts'

export type { KeyPage, KeyPrice, KeyProduct, KeySection, TextPrice } from './key-schema.ts'
type Evidence = { words: Word[]; occurrences: Occurrence[]; text: string; sha256: string }
// v3: the file as written and, per key page, the snapshot evidence its claims refer to.
export type KeyDoc = ReturnType<typeof KeyDocSchema.parse> & {
  pdfPath: string
  v3?: { raw: KeyDocV3; evidence: Map<number, Evidence> }
}

export const keyPath = (doc: string): string => {
  const sealed = join(SEALED_DIR, `${doc}.json`)
  return existsSync(sealed) ? sealed : join(KEYS_DIR, `${doc}.json`)
}

// The test half's word snapshots are sealed like its keys, wherever the key file is being written.
export const wordsDir = async (doc: string): Promise<string> =>
  (await loadSplit())[doc] === 'test' ? join(SEALED_DIR, 'words') : WORDS_DIR

// Version-3 fields have no meaning in a stage-0 file; finding one means the file is not what it claims to be.
function stageZeroOnly(key: ReturnType<typeof KeyDocSchema.parse>): void {
  const misplaced = key.pages.some(
    (p) =>
      p.strict ||
      p.textPrices.length > 0 ||
      p.pricedCells !== undefined ||
      p.renderedRows.length > 0 ||
      p.products.some((x) => x.prices !== undefined || x.id !== undefined || x.parent !== undefined),
  )
  if (misplaced) throw new Error(`${key.doc}: a stage-0 key uses version-3 fields; write it as version 3`)
}

async function parseKey(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error(`${path} is not valid JSON`)
  }
}

export const fileSha256 = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')

export async function loadKeyFile(path: string, pdfOverride?: string): Promise<KeyDoc> {
  const json = await parseKey(path)
  const version = typeof json === 'object' && json !== null && 'version' in json ? json.version : undefined
  if (version !== 3) {
    const parsed = KeyDocSchema.parse(json)
    stageZeroOnly(parsed)
    // Stage-0 keys write an unchecked cell as "".
    const pages = parsed.pages.map((p) => ({
      ...p,
      tables: p.tables.map((t) => ({ ...t, rows: t.rows.map((r) => r.map((c) => (c === '' ? null : c))) })),
    }))
    return { ...parsed, pages, pdfPath: pdfOverride ?? join(DOCS_DIR, parsed.pdf) }
  }
  const checked = KeyDocV3Schema.safeParse(json)
  // A sealed key's schema errors would quote its content.
  if (!checked.success)
    throw path.startsWith(SEALED_DIR)
      ? new Error(`${path}: ${String(checked.error.issues.length)} schema problems`)
      : new Error(`${path}:\n${z.prettifyError(checked.error)}`)
  const raw = checked.data
  const pdfPath = pdfOverride ?? join(DOCS_DIR, raw.pdf)
  // Every reader of a key (validation, runs, rescoring, aggregation) loads it here, so the evidence is checked here.
  if (raw.pdfSha256 !== (await fileSha256(pdfPath)))
    throw new Error(`${raw.doc}: the PDF is not the one the key was written against`)
  // The document id names files; only a document of the split may.
  if ((await loadSplit())[raw.doc] === undefined) throw new Error(`${raw.doc}: not a document of validation/split.json`)
  const where = { dir: await wordsDir(raw.doc), doc: raw.doc }
  const evidence = new Map<number, Evidence>()
  const pages: KeyPage[] = []
  for (const page of raw.pages) {
    const { words, sha256 } = await frozenWords(where, page.pdfPage)
    const occurrences = ledger(words)
    const at = `${raw.doc} p${String(page.keyPage)}`
    if (page.wordsSha256 !== sha256)
      throw new Error(`${at}: the word snapshot is not the one the key was written against`)
    if (page.ledgerSha256 !== ledgerSha256(occurrences))
      throw new Error(`${at}: the reader now segments this page differently; migrate the key explicitly`)
    evidence.set(page.keyPage, { words, occurrences, text: canon(words.map((w) => w.str).join(' ')), sha256 })
    pages.push(fromV3Page(page, occurrences))
  }
  const { doc, pdf, lang, currency, sections, sectionOrders, disputes } = raw
  const meta = { doc, pdf, lang, currency, sectionOrders, disputes, ...(sections ? { sections } : {}) }
  return { ...meta, pages, pdfPath, v3: { raw, evidence } }
}

export const loadKey = (doc: string): Promise<KeyDoc> => loadKeyFile(keyPath(doc))

// The text layer of each key page: the frozen snapshot for version-3 keys, a live extraction for stage-0 keys.
export async function keyWords(key: KeyDoc): Promise<Map<number, Word[]>> {
  const words = new Map<number, Word[]>()
  for (const page of key.pages)
    words.set(page.keyPage, key.v3?.evidence.get(page.keyPage)?.words ?? (await pageWords(key.pdfPath, page.pdfPage)))
  return words
}

const occurrences = (haystack: string, needle: string): number => haystack.split(canon(needle)).length - 1

type Check = { where: string; text: string; amounts: Set<number>; problems: string[] }

// Stage-0 products: amounts per product, proven against the text layer.
function checkLegacyProduct(p: KeyProduct, c: Check): void {
  p.mustContain.forEach((s) => {
    if (occurrences(c.text, s) === 0)
      c.problems.push(`${c.where}: mustContain of ${p.anchor} "${s}" not in the text layer`)
  })
  if (p.articleNo) {
    if (occurrences(c.text, p.articleNo) === 0)
      c.problems.push(`${c.where}: article number "${p.articleNo}" not in the text layer`)
  } else if (occurrences(c.text, p.anchor) !== 1)
    c.problems.push(`${c.where}: product anchor "${p.anchor}" occurs ${occurrences(c.text, p.anchor)} times`)
  if (p.prices) {
    c.problems.push(`${c.where}: ${p.anchor} keys prices per amount; new keys use version 3`)
    return
  }
  const money = p.money ?? []
  for (const m of [...money, ...p.optional])
    if (!c.amounts.has(m)) c.problems.push(`${c.where}: ${p.anchor} amount ${m} not printed on the page`)
  if (!p.roleFree.every((o) => money.includes(o)))
    c.problems.push(`${c.where}: ${p.anchor} roleFree amount not in money`)
  if (!p.old.every((o) => money.includes(o))) c.problems.push(`${c.where}: ${p.anchor} old price not in money`)
}

// Rules every key shares: anchors, tables, required and slug text. `fromRender`: cells read from the image, not the text layer.
function checkPage(page: KeyPage, c: Check, strict: boolean, fromRender: ReadonlySet<string> = new Set()): void {
  // Anchors are unique in canon form (NFKC, case and spacing ignored), unless an entry names which occurrence it means.
  const once = (s: string, what: string, nth?: number): void => {
    const n = occurrences(c.text, s)
    if (n === 0) c.problems.push(`${c.where}: ${what} "${s}" not in the text layer`)
    else if (nth !== undefined && n < nth) c.problems.push(`${c.where}: ${what} "${s}" occurs ${n} times, not ${nth}`)
    else if (nth === undefined && n > 1 && strict)
      c.problems.push(`${c.where}: ${what} "${s}" occurs ${n} times; anchors are unique`)
  }
  const mustExist = (s: string, what: string): void => {
    if (occurrences(c.text, s) === 0) c.problems.push(`${c.where}: ${what} "${s}" not in the text layer`)
  }
  if (page.expect === 'unsupported') {
    const content = [page.readingOrder, page.products, page.headings, page.tables, page.mustContain]
    if (content.some((list) => list.length)) c.problems.push(`${c.where}: an unsupported page keys no content`)
    return
  }
  if (!page.readingOrder.length) c.problems.push(`${c.where}: a full key needs a reading order`)
  page.readingOrder
    .flat()
    .filter((e) => e.kind === 'text')
    .forEach((e) => {
      once(e.anchor, 'reading-order anchor', e.occurrence)
    })
  page.headings.forEach((h) => {
    once(h.anchor, 'heading anchor', h.occurrence)
  })
  // Header cells wrap over lines that the stream interleaves with other columns, so they are checked word by word.
  page.tables.forEach((t) => {
    t.header
      .flatMap((cell) => cell.split(/\s+/))
      .forEach((w) => {
        mustExist(w, 'table header word')
      })
    t.rows.flat().forEach((cell) => {
      if (cell && !fromRender.has(cell)) mustExist(cell, 'table cell')
    })
    if (strict && t.rows.some((r) => r.length !== t.header.length))
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
}

function checkSections(key: KeyDoc, texts: Map<number, string>, strict: boolean, problems: string[]): void {
  const orders: KeySection[][] = key.sections ? [key.sections, ...key.sectionOrders] : key.sectionOrders
  if (!key.sections && key.sectionOrders.length) problems.push(`${key.doc}: sectionOrders without sections`)
  for (const order of orders) {
    if (key.sections && strict)
      key.pages
        .filter((p) => !order.some((s) => s.keyPage === p.keyPage))
        .forEach((p) => problems.push(`${key.doc}: key page ${p.keyPage} is missing from a section order`))
    for (const section of order) {
      const text = texts.get(section.keyPage)
      if (text === undefined) problems.push(`${key.doc}: section for unknown key page ${section.keyPage}`)
      else
        section.anchors.forEach((a) => {
          const n = occurrences(text, a)
          if (n === 0) problems.push(`${key.doc} p${section.keyPage}: section anchor "${a}" not in the text layer`)
          else if (n > 1 && strict)
            problems.push(`${key.doc} p${section.keyPage}: section anchor "${a}" occurs ${n} times`)
        })
    }
  }
}

// What `keys:check` and the tests print: a sealed key shows only its problem count unless asked for details.
export const visibleProblems = (problems: readonly string[], sealed: boolean, details: boolean): string[] => [
  ...(sealed && !details ? [] : problems),
  problems.length ? `${String(problems.length)} problems` : 'key valid',
]

export async function validateKey(key: KeyDoc, set: KeySet = 'tuning'): Promise<string[]> {
  const problems: string[] = []
  const texts = new Map<number, string>()
  if (set !== 'tuning' && !key.v3) problems.push(`${key.doc}: dev and test keys use version 3`)
  for (const page of key.pages) {
    const where = `${key.doc} p${page.keyPage}`
    const evidence = key.v3?.evidence.get(page.keyPage)
    const rawPage = key.v3?.raw.pages.find((p) => p.keyPage === page.keyPage)
    if (evidence && rawPage) {
      texts.set(page.keyPage, evidence.text)
      problems.push(
        ...validateV3Page(rawPage, evidence.occurrences, evidence.words, evidence.text).map((p) => `${key.doc} ${p}`),
      )
      checkPage(
        page,
        { where, text: evidence.text, amounts: new Set(), problems },
        true,
        renderedCells(rawPage, evidence.occurrences),
      )
      continue
    }
    const words = await pageWords(key.pdfPath, page.pdfPage)
    const text = canon(words.map((w) => w.str).join(' '))
    texts.set(page.keyPage, text)
    const check = { where, text, amounts: provenAmounts(words), problems }
    checkPage(page, check, false)
    if (page.expect === 'content')
      page.products.forEach((p) => {
        checkLegacyProduct(p, check)
      })
  }
  checkSections(key, texts, key.v3 !== undefined, problems)
  // Decisions per printed page count only printed pages with products, found through their product anchors.
  if (key.v3 && key.sections)
    for (const page of key.pages.filter((p) => p.products.length)) {
      const anchors = page.products.map((p) => p.anchor)
      const own = key.sections.filter((s) => s.keyPage === page.keyPage)
      if (own.length && !own.some((s) => s.anchors.some((a) => anchors.includes(a))))
        problems.push(`${key.doc} p${page.keyPage}: no printed page of it names a product anchor`)
    }
  key.disputes.forEach((d) => problems.push(`${key.doc} p${d.keyPage}: open dispute: ${d.note}`))
  return problems
}
