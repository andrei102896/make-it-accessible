import { joinRuns } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, ImageValue, Item, PageStructure, PriceValue, TextValue } from '../model/schema.ts'
import { parseMoney } from '../text/money.ts'

const UI = {
  de: { skip: 'Zum Inhalt springen', page: 'Seite', previous: 'statt', table: 'Tabelle' },
  en: { skip: 'Skip to content', page: 'Page', previous: 'was', table: 'Table' },
}
type Strings = (typeof UI)['de']

export type HtmlPage = {
  keyPage: number
  structure: PageStructure
  extraction: Extraction
  flagged: readonly string[]
  imageSrc: (path: string) => string | undefined
}
export type HtmlDocument = { lang: string; title: string; pages: HtmlPage[] }

const STYLE = `
:root { color-scheme: light dark; --fg: #1a1a1a; --bg: #ffffff; --muted: #555555; --line: #d0d0d0; --focus: #1d4ed8; }
@media (prefers-color-scheme: dark) { :root { --fg: #f2f2f2; --bg: #121212; --muted: #b8b8b8; --line: #444444; --focus: #93b4ff; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 1rem/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
main { max-width: 60rem; margin: 0 auto; padding: 1rem; }
.skip { position: absolute; left: -999rem; }
.skip:focus { left: 1rem; top: 1rem; background: var(--bg); padding: .5rem; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
section { border-top: 1px solid var(--line); margin-top: 2rem; }
.products { list-style: none; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
.products > li { border: 1px solid var(--line); padding: .75rem; }
.name { font-weight: 700; margin: 0 0 .25rem; }
.price[data-role="current"] { font-weight: 700; }
.qualifier, .unit { color: var(--muted); }
img { max-width: 100%; height: auto; }
.table { overflow-x: auto; }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--line); padding: .25rem .5rem; text-align: left; vertical-align: top; }
`

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderDocument(doc: HtmlDocument): string {
  const ui: Strings = doc.lang.startsWith('de') ? UI.de : UI.en
  const sections = doc.pages.map((p) => renderPage(p, ui)).join('\n')
  return `<!doctype html>
<html lang="${esc(doc.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#main">${ui.skip}</a>
<main id="main">
<h1>${esc(doc.title)}</h1>
${sections}
</main>
</body>
</html>
`
}

function renderPage(page: HtmlPage, ui: Strings): string {
  const runs = page.extraction.runs
  const text = (t: TextValue): string => {
    if ('seen' in t) return `<span data-seen>${esc(t.seen)}</span>`
    const words: Run[] = t.src.flatMap(([from, to]) => runs.slice(from, to + 1))
    return esc(t.text ?? joinRuns(words))
  }
  const flagged = (path: string): string =>
    page.flagged.some((f) => f === path || f.startsWith(`${path}.`)) ? ' data-review' : ''

  const price = (p: PriceValue): string => {
    const label = p.qualifier ? text(p.qualifier) : p.role === 'previous' ? ui.previous : ''
    const amount = parseMoney(p.value)
    return `<span class="price" data-role="${p.role}"${amount === null ? '' : ` data-amount="${amount}"`}>${label ? `<span class="qualifier">${label}</span> ` : ''}${esc(p.value)}</span>`
  }

  const image = (path: string, img: ImageValue): string => {
    const src = page.imageSrc(path)
    return src ? `<img src="${esc(src)}" alt="${esc(img.alt ?? '')}">` : ''
  }

  const block = (path: string, b: Block): string => {
    switch (b.kind) {
      case 'heading': {
        const level = Math.min(6, b.level + 2)
        return `<h${level}>${text(b.text)}</h${level}>`
      }
      case 'paragraph':
        return `<p>${text(b.text)}</p>`
      case 'list':
        return `<ul>${b.items.map((t) => `<li>${text(t)}</li>`).join('')}</ul>`
      case 'table': {
        const id = `${path.replace(/[^a-z0-9]/gi, '-')}-p${page.keyPage}`
        const caption = b.caption ? `<caption id="${id}">${text(b.caption)}</caption>` : ''
        const rows = b.rows.map((row, r) => {
          const cells = row.map((cell) => {
            const content = [cell.text ? text(cell.text) : '', ...(cell.prices ?? []).map(price)]
              .filter(Boolean)
              .join(' ')
            const span = `${cell.colSpan ? ` colspan="${cell.colSpan}"` : ''}${cell.rowSpan ? ` rowspan="${cell.rowSpan}"` : ''}`
            if (!cell.header) return `<td${span}>${content}</td>`
            const group =
              cell.header === 'col' ? (cell.colSpan ? 'colgroup' : 'col') : cell.rowSpan ? 'rowgroup' : 'row'
            return `<th scope="${group}"${span}>${content}</th>`
          })
          return `<tr${flagged(`${path}.rows[${r}]`)}>${cells.join('')}</tr>`
        })
        const name = b.caption ? `aria-labelledby="${id}"` : `aria-label="${ui.table}"`
        return `<div class="table" role="region" tabindex="0" ${name}><table>${caption}${rows.join('')}</table></div>`
      }
      case 'products':
        return `<ul class="products" role="list">${b.items.map((item, i) => product(`${path}.items[${i}]`, item)).join('')}</ul>`
      case 'figure':
        return image(`${path}.image`, b.image)
    }
  }

  const product = (path: string, item: Item): string => {
    const parts = [
      `<p class="name">${text(item.name)}</p>`,
      item.prices.length ? `<p class="prices">${item.prices.map(price).join(' ')}</p>` : '',
      item.unit ? `<p class="unit">${text(item.unit)}</p>` : '',
      ...item.details.map((d, i) => block(`${path}.details[${i}]`, d)),
      item.image ? image(`${path}.image`, item.image) : '',
    ]
    return `<li${flagged(path)}>${parts.filter(Boolean).join('')}</li>`
  }

  const id = `page-${page.keyPage}`
  const body = page.structure.blocks.map((b, i) => block(`blocks[${i}]`, b)).join('\n')
  return `<section aria-labelledby="${id}" data-page="${page.keyPage}">\n<h2 id="${id}">${ui.page} ${page.keyPage}</h2>\n${body}\n</section>`
}

export function imageBoxes(page: PageStructure): { path: string; box: readonly number[] }[] {
  const out: { path: string; box: readonly number[] }[] = []
  const block = (path: string, b: Block): void => {
    if (b.kind === 'figure') out.push({ path: `${path}.image`, box: b.image.box })
    if (b.kind === 'products')
      b.items.forEach((item, i) => {
        product(`${path}.items[${i}]`, item)
      })
  }
  const product = (path: string, item: Item): void => {
    item.details.forEach((d, i) => {
      block(`${path}.details[${i}]`, d)
    })
    if (item.image) out.push({ path: `${path}.image`, box: item.image.box })
  }
  page.blocks.forEach((b, i) => {
    block(`blocks[${i}]`, b)
  })
  return out
}
