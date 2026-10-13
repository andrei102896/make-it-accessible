import { canon } from '@make-it-accessible/pipeline/text/normalize'
import type { CellV3, KeyPageV3 } from './key-schema-v3.ts'
import type { KeyPage, KeyPrice, KeyProduct } from './key-schema.ts'
import type { Occurrence } from './ledger.ts'
import { CURRENCY_HEADER, moneyInText } from './score/money.ts'

const count = (text: string, needle: string): number => text.split(canon(needle)).length - 1
const order = (id: string): number => Number(id.slice(1))
const cellKey = (t: number, r: number, c: number): string => `${String(t)}.${String(r)}.${String(c)}`

// Merged cells repeat their neighbour; unchecked cells become null, the scorer's "not checked".
function resolveCells(rows: readonly (readonly CellV3[])[]): (string | null)[][] {
  const out: (string | null)[][] = []
  rows.forEach((row, r) => {
    const resolved: (string | null)[] = []
    row.forEach((cell, c) => {
      if (typeof cell === 'string') resolved.push(cell)
      else if ('unchecked' in cell) resolved.push(null)
      else resolved.push(cell.same === 'above' ? (out[r - 1]?.[c] ?? null) : (resolved[c - 1] ?? null))
    })
    out.push(resolved)
  })
  return out
}

// A cell is a price cell when it prints a currency or sits under a currency header; spec values are not.
const pricedCell = (page: KeyPageV3, t: number, c: number, cell: string): boolean =>
  moneyInText(cell).some((m) => m.currency !== null) || CURRENCY_HEADER.test(page.tables[t]?.header[c] ?? '')

function claimedPrices(page: KeyPageV3, byId: Map<string, Occurrence>): Map<string, KeyPrice[]> {
  const prices = new Map<string, KeyPrice[]>()
  const claims = Object.entries(page.occurrences).sort(([a], [b]) => order(a) - order(b))
  for (const [id, claim] of claims) {
    const o = byId.get(id)
    if (!o || (claim.kind !== 'price' && claim.kind !== 'text')) continue
    const owner = claim.kind === 'price' ? claim.product : ''
    const printed = claim.value ? claim.value.currency : o.currency
    prices.set(owner, [
      ...(prices.get(owner) ?? []),
      {
        printed: claim.value?.printed ?? o.text,
        cents: claim.value?.cents ?? o.cents ?? 0,
        role: claim.role,
        currency: claim.currency !== undefined ? claim.currency : printed,
        conditions: claim.kind === 'price' ? claim.conditions : [],
        ...(o.unreadable ? { seen: true as const } : {}),
      },
    ])
  }
  return prices
}

// A version-3 page as the scorer reads it: prices come from the claimed occurrences.
export function fromV3Page(page: KeyPageV3, occurrences: readonly Occurrence[]): KeyPage {
  const byId = new Map(occurrences.map((o) => [o.id, o]))
  const prices = claimedPrices(page, byId)
  const products = page.products.map((p): KeyProduct => ({
    id: p.id,
    anchor: p.anchor,
    alt: p.alt,
    mustContain: p.mustContain,
    prices: [...(prices.get(p.id) ?? []), ...p.seen.map((s): KeyPrice => ({ ...s, seen: true }))],
    old: [],
    roleFree: [],
    optional: [],
    ...(p.parent === undefined ? {} : { parent: p.parent }),
    ...(p.articleNo === undefined ? {} : { articleNo: p.articleNo }),
  }))
  const pricedCells = Object.values(page.occurrences).filter((c) => {
    if (c.kind !== 'cell') return false
    const cell = page.tables[c.table]?.rows[c.row]?.[c.col]
    return typeof cell === 'string' && pricedCell(page, c.table, c.col, cell)
  }).length
  return {
    pdfPage: page.pdfPage,
    keyPage: page.keyPage,
    type: page.type,
    expect: page.expect,
    readingOrder: page.readingOrder,
    products,
    headings: page.headings,
    tables: page.tables.map((t) => ({ header: t.header, rows: resolveCells(t.rows) })),
    mustNotAppear: page.mustNotAppear,
    mustContain: page.mustContain,
    outsideTrim: page.outsideTrim,
    strict: true,
    textPrices: prices.get('') ?? [],
    pricedCells,
  }
}

function checkValueClaim(
  claim: Extract<KeyPageV3['occurrences'][string], { kind: 'price' | 'text' }>,
  o: Occurrence,
  where: string,
): string[] {
  const problems: string[] = []
  if (o.unreadable && !claim.value) problems.push(`${where}: ${o.id} is unreadable; give its value from the render`)
  if (!o.unreadable && claim.value && claim.misread !== 'confirmed')
    problems.push(`${where}: ${o.id} "${o.text}" overrides a readable value; open misread until Andrei confirms`)
  const printed = claim.value ? claim.value.currency : o.currency
  if (printed !== null && claim.currency !== undefined && claim.currency !== printed)
    problems.push(`${where}: ${o.id} prints ${printed}, claimed ${String(claim.currency)}`)
  if (claim.kind === 'price' && claim.role === 'unknown' && !claim.reason)
    problems.push(`${where}: ${o.id} leaves the role open without a reason`)
  return problems
}

function checkTables(page: KeyPageV3, byId: Map<string, Occurrence>, where: string): string[] {
  const problems: string[] = []
  const claims = new Map<string, Occurrence[]>()
  for (const [id, claim] of Object.entries(page.occurrences)) {
    const o = byId.get(id)
    if (claim.kind !== 'cell' || !o) continue
    const key = cellKey(claim.table, claim.row, claim.col)
    claims.set(key, [...(claims.get(key) ?? []), o])
  }
  page.tables.forEach((t, ti) => {
    t.rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const key = cellKey(ti, ri, ci)
        const claimed = claims.get(key) ?? []
        claims.delete(key)
        if (typeof cell !== 'string') {
          if ('same' in cell && (cell.same === 'above' ? ri === 0 : ci === 0))
            problems.push(`${where}: cell ${key} repeats a neighbour it does not have`)
          if (claimed.length) problems.push(`${where}: cell ${key} is not a written cell but is claimed`)
          return
        }
        const amounts = moneyInText(cell).map((m) => m.cents)
        // A price cell claims each printed amount once; a spec value may be claimed as a cell or as not a price.
        if (pricedCell(page, ti, ci, cell) ? claimed.length !== amounts.length : claimed.length > amounts.length)
          problems.push(
            `${where}: cell ${key} "${cell}" has ${String(amounts.length)} amounts, claimed ${String(claimed.length)}`,
          )
        claimed
          .filter((o) => !o.unreadable && !amounts.includes(o.cents ?? NaN))
          .forEach((o) => problems.push(`${where}: ${o.id} "${o.text}" does not read as cell ${key} "${cell}"`))
      })
    })
  })
  for (const key of claims.keys()) problems.push(`${where}: a claim names cell ${key}, which the key does not have`)
  return problems
}

function checkClaims(page: KeyPageV3, occurrences: readonly Occurrence[], where: string): string[] {
  const problems: string[] = []
  const byId = new Map(occurrences.map((o) => [o.id, o]))
  const products = new Set(page.products.map((p) => p.id))
  for (const o of occurrences)
    if (!(o.id in page.occurrences)) problems.push(`${where}: ${o.id} "${o.text}" is not claimed`)
  for (const [id, claim] of Object.entries(page.occurrences)) {
    const o = byId.get(id)
    if (!o) problems.push(`${where}: ${id} is not an occurrence of this page's words`)
    else if (claim.kind === 'price' || claim.kind === 'text') {
      if (claim.kind === 'price' && !products.has(claim.product))
        problems.push(`${where}: ${id} claims unknown product "${claim.product}"`)
      problems.push(...checkValueClaim(claim, o, where))
    }
  }
  return [...problems, ...checkTables(page, byId, where)]
}

// Version-3 rules beyond the ones every key shares: claims, products and their anchors, words printed with prices.
export function validateV3Page(page: KeyPageV3, occurrences: readonly Occurrence[], text: string): string[] {
  const where = `p${String(page.keyPage)}`
  if (page.expect === 'unsupported') {
    const content = [page.products, page.tables, page.readingOrder, Object.keys(page.occurrences)]
    return content.some((list) => list.length) ? [`${where}: an unsupported page keys no content`] : []
  }
  const problems = checkClaims(page, occurrences, where)
  const printed = (s: string, what: string): void => {
    if (count(text, s) === 0) problems.push(`${where}: ${what} "${s}" not in the text layer`)
  }
  const ids = page.products.map((p) => p.id)
  const readable = new Set(occurrences.flatMap((o) => (o.unreadable || o.cents === null ? [] : [o.cents])))
  const priced = new Set(Object.values(page.occurrences).flatMap((c) => (c.kind === 'price' ? [c.product] : [])))
  for (const p of page.products) {
    if (ids.filter((i) => i === p.id).length > 1) problems.push(`${where}: product id "${p.id}" is not unique`)
    if (p.parent !== undefined && !ids.includes(p.parent))
      problems.push(`${where}: ${p.id} names unknown parent "${p.parent}"`)
    const n = count(text, p.anchor)
    if (n === 0 || (n > 1 && p.parent === undefined && !p.articleNo))
      problems.push(`${where}: product anchor "${p.anchor}" occurs ${String(n)} times`)
    if (p.articleNo) printed(p.articleNo, 'article number')
    p.mustContain.forEach((s) => {
      printed(s, `mustContain of ${p.id}`)
    })
    // A price in the text layer is claimed through its occurrence; only an image-only price is `seen`.
    p.seen
      .filter((s) => readable.has(s.cents))
      .forEach((s) =>
        problems.push(`${where}: ${p.id} seen price "${s.printed}" is in the text layer; claim its occurrence`),
      )
    p.seen
      .flatMap((s) => s.conditions)
      .forEach((c) => {
        printed(c, `condition of ${p.id}`)
      })
    if (!priced.has(p.id) && !p.seen.length) problems.push(`${where}: product ${p.id} has no price`)
  }
  Object.values(page.occurrences)
    .flatMap((c) => (c.kind === 'price' ? c.conditions : []))
    .forEach((c) => {
      printed(c, 'price condition')
    })
  return problems
}
