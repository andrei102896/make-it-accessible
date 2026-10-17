import type { Block, PriceValue, TextValue } from '../model/schema.ts'

// What a table needs from the page renderer: its text (plain, or with printed links) and price rendering, review
// marks, the whole-amount scope, how an unnamed table is labelled, and whether the document is a menu.
export type TableTools = {
  text: (t: TextValue) => string
  linked: (t: TextValue) => string
  price: (path: string, p: PriceValue) => string
  flagged: (path: string, exact?: boolean) => string
  // The printed view's placement (placed.ts): the table as a frame, each cell's text in it.
  place: (path: string) => string
  withWhole: <T>(prices: readonly PriceValue[], render: () => T) => T
  keyPage: number
  lastHeading: string | null
  tableLabel: string
  menu: boolean
}
type Table = Extract<Block, { kind: 'table' }>

// A two-column table without headers or caption whose second column holds only prices is a price list printed as
// rows (Carmine's beers): on a menu it renders as menu rows, never as a ruled table.
const isPriceList = (b: Table): boolean =>
  b.caption === undefined &&
  b.rows.length > 0 &&
  b.rows.every(
    ([head, cell, ...more]) =>
      head?.text !== undefined &&
      !head.prices?.length &&
      head.header !== 'col' &&
      cell !== undefined &&
      cell.text === undefined &&
      cell.header === undefined &&
      (cell.prices?.length ?? 0) > 0 &&
      !more.length,
  )

// A cell's text in its own placed element only in the printed view; elsewhere the cell is as before.
const placedIn = (where: string, html: string): string => (where ? `<span${where}>${html}</span>` : html)

export function renderTable(path: string, b: Table, tools: TableTools): string {
  const { text, linked, price, flagged } = tools
  const prices = b.rows.flatMap((row) => row.flatMap((cell) => cell.prices ?? []))
  if (tools.menu && isPriceList(b))
    return tools.withWhole(prices, () => {
      const rows = b.rows.map((row, r) => {
        const at = `${path}.rows[${String(r)}]`
        const own = (row[1]?.prices ?? []).map((p, i) => price(`${at}[1].prices[${String(i)}]`, p)).join(' ')
        const head = row[0]?.text ? text(row[0].text) : ''
        return `<li${flagged(at)}><p class="name"${tools.place(`${at}[0]`)}>${head}</p><p class="prices"><span role="text">${own}</span></p></li>`
      })
      return `<ul class="products menu" role="list"${flagged(path, true)}${tools.place(path)}>${rows.join('')}</ul>`
    })
  return tools.withWhole(prices, () => {
    const id = `${path.replace(/[^a-z0-9]/gi, '-')}-p${String(tools.keyPage)}`
    const caption = b.caption ? `<caption id="${id}"${flagged(`${path}.caption`)}>${text(b.caption)}</caption>` : ''
    const rows = b.rows.map((row, r) => {
      const cells = row.map((cell, c) => {
        const at = `${path}.rows[${String(r)}][${String(c)}]`
        const content = [
          cell.text ? placedIn(tools.place(at), linked(cell.text)) : '',
          ...(cell.prices ?? []).map((p, i) => price(`${at}.prices[${String(i)}]`, p)),
        ]
          .filter(Boolean)
          .join(' ')
        const span = `${cell.colSpan ? ` colspan="${String(cell.colSpan)}"` : ''}${cell.rowSpan ? ` rowspan="${String(cell.rowSpan)}"` : ''}`
        // A cell holding only prices is a money column: right-aligned, figures lined up.
        const num = cell.prices?.length && !cell.text ? ' class="num"' : ''
        if (!cell.header) return `<td${span}${num}>${content}</td>`
        const group = cell.header === 'col' ? (cell.colSpan ? 'colgroup' : 'col') : cell.rowSpan ? 'rowgroup' : 'row'
        return `<th scope="${group}"${span}>${content}</th>`
      })
      return `<tr${flagged(`${path}.rows[${String(r)}]`)}>${cells.join('')}</tr>`
    })
    // Leading rows of column headers are the table's head: printed again on every page, ruled off below. A header
    // cell spanning down into the body would be cut at the boundary, so then there is no head.
    const head = b.rows.findIndex((row) => !row.every((cell) => cell.header === 'col'))
    const leading = head === -1 ? rows.length : head
    const crossing = b.rows.slice(0, leading).some((row, r) => row.some((cell) => r + (cell.rowSpan ?? 1) > leading))
    const split = crossing ? 0 : leading
    const thead = split ? `<thead>${rows.slice(0, split).join('')}</thead>` : ''
    // Without a caption, the table is named by the heading it sits under, so two tables never share a name.
    const named = b.caption ? id : tools.lastHeading
    const name = named ? `aria-labelledby="${named}"` : `aria-label="${tools.tableLabel}"`
    return `<div class="table" role="region" tabindex="0" ${name}${flagged(path, true)}${tools.place(path)}><table ${name}>${caption}${thead}<tbody>${rows.slice(split).join('')}</tbody></table></div>`
  })
}
