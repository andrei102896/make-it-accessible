import { canon, norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyPage } from '../keys.ts'
import { loose } from './text.ts'
import { readMoney, type Currency } from './money.ts'
import type { Cell, DomPage, PageScore, Row } from './types.ts'

const MONEY_CELL = /[€£$]|^-?\d*[.,](?:\d{2}|-)$/
const EMPTY: Cell = { text: '', prices: [] }

// "" is an unchecked cell; a price cell also matches a price rendered in it with the same amount and currency.
function cellMatches(key: string, cell: Cell, currency: Currency): boolean {
  if (key === '' || canon(key) === canon(cell.text) || ` ${norm(cell.text)} `.includes(` ${norm(key)} `)) return true
  const expected = readMoney(key)
  if (!MONEY_CELL.test(key) || !expected) return false
  return cell.prices.some((p) => {
    const shown = readMoney(p)
    return shown?.cents === expected.cents && shown.currency === (expected.currency ?? currency)
  })
}

// Key rows as wide as the header are checked column by column; older keys list a row's values as a set.
function rowMatches(cells: readonly string[], positional: boolean, row: Row, currency: Currency): boolean {
  if (row.header) return false
  if (!positional) return cells.every((c) => loose(row.text).includes(loose(c)))
  return row.cells.length === cells.length && cells.every((c, i) => cellMatches(c, row.cells[i] ?? EMPTY, currency))
}

export function structureScore(key: KeyPage, dom: DomPage, currency: Currency): PageScore['c5'] {
  const matched = key.headings
    .map((h) => ({ key: h.level, out: dom.headings.find((o) => loose(o.text).includes(loose(h.anchor)))?.level }))
    .filter((m): m is { key: number; out: number } => m.out !== undefined)
  const keyMin = Math.min(...matched.map((m) => m.key))
  const outMin = Math.min(...matched.map((m) => m.out))
  const headingsOk = matched.filter((m) => m.key - keyMin === m.out - outMin).length
  const rowErrors: string[] = []
  let rowsOk = 0
  let silentRows = 0
  for (const table of key.tables) {
    const positional = table.rows.every((r) => r.length === table.header.length)
    for (const cells of table.rows) {
      if (dom.rows.some((r) => rowMatches(cells, positional, r, currency))) {
        rowsOk++
        continue
      }
      // The row the output meant is the one sharing the most cells with the key row; its flag decides silent or flagged.
      const closest = dom.rows
        .filter((r) => !r.header)
        .map((r) => ({
          r,
          shared: cells.filter((c, i) => c !== '' && cellMatches(c, r.cells[i] ?? EMPTY, currency)).length,
        }))
        .sort((a, b) => b.shared - a.shared)[0]
      const flagged = closest !== undefined && closest.shared > 0 && closest.r.review
      if (!flagged) silentRows++
      rowErrors.push(`${cells.filter(Boolean).slice(0, 3).join(' | ')}${flagged ? ' (flagged)' : ' (silent)'}`)
    }
  }
  const rows = key.tables.reduce((n, t) => n + t.rows.length, 0)
  return { headingsOk, headings: key.headings.length, rowsOk, rows, silentRows, rowErrors }
}
