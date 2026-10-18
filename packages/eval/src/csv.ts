// CSV as Python's csv module writes it (outreach/targets.csv): CRLF lines, a field quoted only when it holds a comma,
// a quote or a line break, quotes doubled inside.
const EOL = '\r\n'

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i)
    if (quoted) {
      if (c === '"' && text.charAt(i + 1) === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text.charAt(i + 1) === '\n') i++
      rows.push([...row, field])
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}

const quoted = (f: string): string => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)
export const formatCsv = (rows: readonly (readonly string[])[]): string =>
  rows.map((r) => r.map(quoted).join(',')).join(EOL) + EOL
