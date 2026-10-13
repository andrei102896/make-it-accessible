import { canon, norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyPage } from '../keys.ts'
import { loose } from './text.ts'
import { readMoney, type Currency } from './money.ts'
import type { Cell, DomPage, PageScore, Row } from './types.ts'

type KeyCell = string | null
const MONEY_CELL = /[€£$]|^-?\d*[.,](?:\d{2}|-)$/
const EMPTY: Cell = { text: '', prices: [] }

// null is an unchecked cell, "" must stay empty; a price cell also matches the same amount and currency rendered in it.
function cellMatches(key: KeyCell, cell: Cell, currency: Currency): boolean {
  if (key === null) return true
  if (key === '') return loose(cell.text) === ''
  if (canon(key) === canon(cell.text) || ` ${norm(cell.text)} `.includes(` ${norm(key)} `)) return true
  const expected = readMoney(key)
  if (!MONEY_CELL.test(key) || !expected) return false
  return cell.prices.some((p) => {
    const shown = readMoney(p)
    return shown?.cents === expected.cents && shown.currency === (expected.currency ?? currency)
  })
}

// Column by column; one output cell may hold adjacent key cells ("6630" and "21'9\"" as "6630 21'9\"").
function aligned(keys: readonly KeyCell[], cells: readonly Cell[], currency: Currency): boolean {
  const [cell, ...rest] = cells
  const [first, ...others] = keys
  if (cell === undefined || first === undefined) return cell === undefined && first === undefined
  if (cellMatches(first, cell, currency) && aligned(others, rest, currency)) return true
  for (let k = 2; k <= keys.length; k++) {
    // An empty key cell is a column the output must keep, never one merged away.
    if (keys.slice(0, k).includes('')) break
    const joined = keys.slice(0, k).filter(Boolean).join(' ')
    if (joined && loose(cell.text) === loose(joined) && aligned(keys.slice(k), rest, currency)) return true
  }
  return false
}

// Key rows as wide as the header are checked column by column; older keys list a row's values as a set.
function rowMatches(cells: readonly KeyCell[], positional: boolean, row: Row, currency: Currency): boolean {
  if (row.header) return false
  if (!positional) return cells.every((c) => c === null || loose(row.text).includes(loose(c)))
  return aligned(cells, row.cells, currency)
}

// The row the output meant is the one sharing the most cells with the key row; its flag decides silent or flagged.
function closestFlagged(cells: readonly KeyCell[], rows: readonly Row[], currency: Currency): boolean {
  const closest = rows
    .filter((r) => !r.header)
    .map((r) => ({
      r,
      shared: cells.filter((c, i) => c !== null && c !== '' && cellMatches(c, r.cells[i] ?? EMPTY, currency)).length,
    }))
    .sort((a, b) => b.shared - a.shared)[0]
  return closest !== undefined && closest.shared > 0 && closest.r.review
}

// A header row spanning every column is a title or a section ("Caravans"), not a column header.
const spansAll = (r: Row): boolean => r.cells.length > 1 && new Set(r.cells.map((c) => c.text)).size === 1

// Published header text of each column: the header rows above the first data row, merged cells repeated.
function headerText(rows: readonly Row[], column: number): string {
  const body = rows.findIndex((r) => !r.header)
  return rows
    .slice(0, body < 0 ? rows.length : body)
    .filter((r) => !spansAll(r))
    .map((r) => r.cells[column]?.text ?? '')
    .join(' ')
}

type Table = KeyPage['tables'][number]
type Outcome = { ok: number; silent: number; errors: string[]; headerErrors: string[] }

// Version-3 keys: one output table answers each key table, its rows one to one, its headers column by column.
// rendered: key rows holding an amount read from the render; their output row must be flagged.
function strictTable(table: Table, rows: readonly Row[], currency: Currency, rendered: ReadonlySet<number>): Outcome {
  const free = rows.filter((r) => !r.header)
  const out: Outcome = { ok: 0, silent: 0, errors: [], headerErrors: [] }
  // The most specific key rows choose first, so a row with unchecked cells cannot take another row's match.
  const specific = (r: readonly KeyCell[]): number => r.filter((c) => c !== null && c !== '').length
  const order = table.rows.map((cells, i) => ({ cells, i })).sort((a, b) => specific(b.cells) - specific(a.cells))
  for (const { cells, i } of order) {
    // A row read from the render prefers a flagged twin, any other row an unflagged one.
    const matching = free.filter((r) => rowMatches(cells, true, r, currency))
    const row = matching.find((r) => r.review === rendered.has(i)) ?? matching[0]
    const at = row ? free.indexOf(row) : -1
    if (row) {
      free.splice(at, 1)
      if (rendered.has(i) && !row.review) {
        out.silent++
        out.errors.push(
          `${cells.filter(Boolean).slice(0, 3).join(' | ')}: read from the render but not flagged (silent)`,
        )
      } else out.ok++
      continue
    }
    const flagged = closestFlagged(cells, rows, currency)
    if (!flagged) out.silent++
    out.errors.push(`${cells.filter(Boolean).slice(0, 3).join(' | ')}${flagged ? ' (flagged)' : ' (silent)'}`)
  }
  table.header.forEach((h, i) => {
    if (h && loose(headerText(rows, i)) !== loose(h)) out.headerErrors.push(`column ${String(i + 1)}: "${h}"`)
  })
  return out
}

// Each output table answers at most one key table; the best-fitting pairs are made first.
function pairTables(tables: readonly Table[], dom: DomPage, currency: Currency): Row[][] {
  const outputs = [...new Set(dom.rows.map((r) => r.table))].map((id) => dom.rows.filter((r) => r.table === id))
  const fit = (t: Table, rows: readonly Row[]): number =>
    t.rows.filter((k) => rows.some((r) => rowMatches(k, true, r, currency))).length
  const pairs = tables
    .flatMap((t, ti) => outputs.map((rows, oi) => ({ ti, oi, n: fit(t, rows) })))
    .sort((a, b) => b.n - a.n)
  const chosen = new Map<number, number>()
  for (const { ti, oi } of pairs) if (!chosen.has(ti) && ![...chosen.values()].includes(oi)) chosen.set(ti, oi)
  return tables.map((_, ti) => outputs[chosen.get(ti) ?? -1] ?? [])
}

function looseTable(table: Table, dom: DomPage, currency: Currency): Outcome {
  const positional = table.rows.every((r) => r.length === table.header.length)
  const out: Outcome = { ok: 0, silent: 0, errors: [], headerErrors: [] }
  for (const cells of table.rows) {
    if (dom.rows.some((r) => rowMatches(cells, positional, r, currency))) {
      out.ok++
      continue
    }
    const flagged = closestFlagged(cells, dom.rows, currency)
    if (!flagged) out.silent++
    out.errors.push(`${cells.filter(Boolean).slice(0, 3).join(' | ')}${flagged ? ' (flagged)' : ' (silent)'}`)
  }
  return out
}

export function structureScore(key: KeyPage, dom: DomPage, currency: Currency): PageScore['c5'] {
  const matched = key.headings
    // A repeated heading names its n-th occurrence, in reading order as in the output.
    .map((h) => ({
      key: h.level,
      out: dom.headings.filter((o) => loose(o.text).includes(loose(h.anchor)))[(h.occurrence ?? 1) - 1]?.level,
    }))
    .filter((m): m is { key: number; out: number } => m.out !== undefined)
  const keyMin = Math.min(...matched.map((m) => m.key))
  const outMin = Math.min(...matched.map((m) => m.out))
  const headingsOk = matched.filter((m) => m.key - keyMin === m.out - outMin).length
  const paired = key.strict ? pairTables(key.tables, dom, currency) : []
  const outcomes = key.tables.map((t, i) =>
    key.strict
      ? strictTable(
          t,
          paired[i] ?? [],
          currency,
          new Set(key.renderedRows.filter(([ti]) => ti === i).map(([, r]) => r)),
        )
      : looseTable(t, dom, currency),
  )
  return {
    headingsOk,
    headings: key.headings.length,
    rowsOk: outcomes.reduce((n, o) => n + o.ok, 0),
    rows: key.tables.reduce((n, t) => n + t.rows.length, 0),
    silentRows: outcomes.reduce((n, o) => n + o.silent, 0),
    rowErrors: outcomes.flatMap((o) => o.errors),
    headerErrors: outcomes.flatMap((o) => o.headerErrors),
    unchecked: key.tables.reduce((n, t) => n + t.rows.flat().filter((c) => c === null).length, 0),
  }
}
