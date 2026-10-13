import { createHash } from 'node:crypto'
import type { CellV3, ClaimV3, ConditionV3, KeyPageV3, ManualV3 } from './key-schema-v3.ts'
import type { KeyPage, KeyPrice, KeyProduct } from './key-schema.ts'
import type { Occurrence } from './ledger.ts'
import { CURRENCY_HEADER, moneyInText, type Currency } from './score/money.ts'

// One amount a claim can point at: a ledger occurrence or a manual entry.
export type Source = { id: string; text: string; occurrence?: Occurrence; manual?: ManualV3 }
export type Amount = { printed: string; cents: number; currency: Currency | null }

const order = (id: string): number => Number(id.slice(1)) + (id.startsWith('m') ? 1e9 : 0)

// What freezes the meaning of occurrence ids: a segmentation change must be an explicit key migration.
export const ledgerSha256 = (occurrences: readonly Occurrence[]): string =>
  createHash('sha256').update(JSON.stringify(occurrences)).digest('hex')

export function sources(page: KeyPageV3, occurrences: readonly Occurrence[]): Map<string, Source> {
  return new Map([
    ...occurrences.map((o): [string, Source] => [o.id, { id: o.id, text: o.text, occurrence: o }]),
    ...Object.entries(page.manual).map(([id, m]): [string, Source] => [id, { id, text: m.printed, manual: m }]),
  ])
}

// The value a claim stands for: its own correction, else the manual entry, else what the reader read.
export function valueOf(claim: ClaimV3, source: Source): Amount | null {
  if ('value' in claim && claim.value) return claim.value
  if (source.manual)
    return { printed: source.manual.printed, cents: source.manual.cents, currency: source.manual.currency }
  const o = source.occurrence
  return o && !o.unreadable && o.cents !== null ? { printed: o.text, cents: o.cents, currency: o.currency } : null
}

export const conditionText = (c: ConditionV3): string => (typeof c === 'string' ? c : c.text)

// Not provable from the text layer: an unreadable occurrence or a price only in the image.
export const fromRender = (s: Source): boolean => s.occurrence?.unreadable === true || s.manual?.source === 'image'

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
export const pricedCell = (page: KeyPageV3, t: number, c: number, cell: string): boolean =>
  moneyInText(cell).some((m) => m.currency !== null) || CURRENCY_HEADER.test(page.tables[t]?.header[c] ?? '')

function claimedPrices(page: KeyPageV3, all: Map<string, Source>): Map<string, KeyPrice[]> {
  const prices = new Map<string, KeyPrice[]>()
  const claims = Object.entries(page.occurrences).sort(([a], [b]) => order(a) - order(b))
  for (const [id, claim] of claims) {
    const source = all.get(id)
    if (!source || (claim.kind !== 'price' && claim.kind !== 'text')) continue
    const value = valueOf(claim, source)
    const owner = claim.kind === 'price' ? claim.product : ''
    prices.set(owner, [
      ...(prices.get(owner) ?? []),
      {
        printed: value?.printed ?? source.text,
        cents: value?.cents ?? 0,
        role: claim.role,
        currency: claim.currency !== undefined ? claim.currency : (value?.currency ?? null),
        conditions: claim.conditions.map(conditionText),
        // A price or a condition read from the render puts the price under review.
        ...(fromRender(source) || claim.conditions.some((c) => typeof c !== 'string') ? { seen: true as const } : {}),
      },
    ])
  }
  return prices
}

// A version-3 page as the scorer reads it: prices come from the claimed amounts.
export function fromV3Page(page: KeyPageV3, occurrences: readonly Occurrence[]): KeyPage {
  const all = sources(page, occurrences)
  const prices = claimedPrices(page, all)
  const products = page.products.map((p): KeyProduct => ({
    id: p.id,
    anchor: p.anchor,
    alt: p.alt,
    mustContain: p.mustContain,
    prices: prices.get(p.id) ?? [],
    old: [],
    roleFree: [],
    optional: [],
    ...(p.parent === undefined ? {} : { parent: p.parent }),
    ...(p.articleNo === undefined ? {} : { articleNo: p.articleNo }),
  }))
  const renderedRows = Object.entries(page.occurrences).flatMap(([id, c]): [number, number][] => {
    const source = all.get(id)
    return c.kind === 'cell' && source && fromRender(source) ? [[c.table, c.row]] : []
  })
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
    renderedRows,
  }
}
