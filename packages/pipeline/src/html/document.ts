import { amountOf, centPartner, joinRuns } from '../pdf/runs.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { Block, ImageValue, Item, PageStructure, PriceValue, TextValue } from '../model/schema.ts'
import { formatMoney, pageCurrency } from '../text/money.ts'
import { css } from './style.ts'
import type { Theme } from './theme.ts'

const UI = {
  de: { skip: 'Zum Inhalt springen', page: 'Seite', previous: 'statt', table: 'Tabelle', contents: 'Inhalt' },
  en: { skip: 'Skip to content', page: 'Page', previous: 'was', table: 'Table', contents: 'Contents' },
}
type Strings = (typeof UI)['de']

export type HtmlPage = {
  keyPage: number
  structure: PageStructure
  extraction: Extraction
  flagged: readonly string[]
  imageSrc: (path: string) => string | undefined
}
export type HtmlDocument = { lang: string; title: string; pages: HtmlPage[]; theme?: Theme | null }
type Rendered = { html: string; toc: { id: string; label: string }[] }

// Long documents get a contents list; a page marker on a one- or two-page document is for screen readers only.
const TOC_PAGES = 3

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderDocument(doc: HtmlDocument): string {
  const ui: Strings = doc.lang.startsWith('de') ? UI.de : UI.en
  const long = doc.pages.length >= TOC_PAGES
  const rendered = doc.pages.map((p, i) => renderPage(p, ui, doc.lang, i, long))
  const seen = new Set<string>()
  const toc = rendered
    .flatMap((r) => r.toc)
    .filter((t) => !seen.has(t.label.toLowerCase()) && seen.add(t.label.toLowerCase()))
  const nav =
    long && toc.length
      ? `<nav class="toc" aria-label="${ui.contents}"><details><summary>${ui.contents}</summary><ol>${toc.map((t) => `<li><a href="#${t.id}">${t.label}</a></li>`).join('')}</ol></details></nav>`
      : ''
  return `<!doctype html>
<html lang="${esc(doc.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>${css(doc.theme ?? null)}</style>
</head>
<body>
<a class="skip" href="#main">${ui.skip}</a>
<main id="main">
<div class="band"><h1>${esc(doc.title)}</h1></div>
${nav}
${rendered.map((r) => r.html).join('\n')}
</main>
</body>
</html>
`
}

function renderPage(page: HtmlPage, ui: Strings, lang: string, index: number, long: boolean): Rendered {
  const runs = page.extraction.runs
  const toc: Rendered['toc'] = []
  const topLevel = Math.min(...page.structure.blocks.flatMap((b) => (b.kind === 'heading' ? [b.level] : [])))
  const text = (t: TextValue): string => {
    if ('seen' in t) return `<span data-seen>${esc(t.seen)}</span>`
    const words: Run[] = t.src.flatMap(([from, to]) => runs.slice(from, to + 1))
    return esc(t.text ?? joinRuns(words))
  }
  // The narrowest element carrying a finding is marked, so a reviewer (and the scorer) sees what was flagged.
  const flagged = (path: string, exact = false): string =>
    page.flagged.some((f) => f === path || (!exact && (f.startsWith(`${path}.`) || f.startsWith(`${path}[`))))
      ? ' data-review'
      : ''

  const currency = pageCurrency(joinRuns(runs))
  // Bare digits read as fused cents ("269" = 2,69) only on a page that prints euro/cent pairs; elsewhere they are shown as printed.
  const fusedCents = runs.some((r) => centPartner(r, runs) !== undefined)
  const price = (path: string, p: PriceValue): string => {
    const label = p.qualifier ? text(p.qualifier) : p.role === 'previous' ? ui.previous : ''
    const cited = p.src.flatMap(([from, to]) => runs.slice(from, to + 1))
    const amount = amountOf(cited, currency)
    const proven = amount?.currency && (!amount.fromBareDigits || fusedCents) ? amount.currency : null
    const printed = joinRuns(cited)
    const whole = amount !== null && amount.cents % 100 === 0 && !/\d[.,]\d/.test(printed)
    const shown = amount && proven ? formatMoney(amount.cents, lang, proven, whole) : printed
    const data = amount && proven ? ` data-amount="${String(amount.cents)}"` : ''
    const qualifier = label ? `<span class="qualifier">${label}</span> ` : ''
    return `<span class="price" data-role="${p.role}"${data}${flagged(path)}>${qualifier}<span class="amount">${esc(shown)}</span></span>`
  }

  const image = (path: string, img: ImageValue): string => {
    const src = page.imageSrc(path)
    return src ? `<img src="${esc(src)}" alt="${esc(img.alt ?? '')}"${flagged(path)}>` : ''
  }

  const block = (path: string, b: Block): string => {
    switch (b.kind) {
      case 'heading': {
        const level = Math.min(6, b.level + 2)
        const label = text(b.text)
        // Top-level headings of the page's highest level make the contents list.
        const listed = /^blocks\[\d+\]$/.test(path) && b.level === topLevel
        const id = listed ? ` id="s${String(index)}-${path.replace(/\D/g, '')}"` : ''
        if (listed) toc.push({ id: `s${String(index)}-${path.replace(/\D/g, '')}`, label })
        return `<h${level}${id}${flagged(path)}>${label}</h${level}>`
      }
      case 'paragraph':
        return `<p${flagged(path)}>${text(b.text)}</p>`
      case 'list':
        return `<ul${flagged(path, true)}>${b.items.map((t, i) => `<li${flagged(`${path}.items[${i}]`)}>${text(t)}</li>`).join('')}</ul>`
      case 'table': {
        const id = `${path.replace(/[^a-z0-9]/gi, '-')}-p${page.keyPage}`
        const caption = b.caption ? `<caption id="${id}"${flagged(`${path}.caption`)}>${text(b.caption)}</caption>` : ''
        const rows = b.rows.map((row, r) => {
          const cells = row.map((cell, c) => {
            const at = `${path}.rows[${r}][${c}]`
            const content = [
              cell.text ? text(cell.text) : '',
              ...(cell.prices ?? []).map((p, i) => price(`${at}.prices[${i}]`, p)),
            ]
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
        return `<div class="table" role="region" tabindex="0" ${name}${flagged(path, true)}><table>${caption}${rows.join('')}</table></div>`
      }
      case 'products':
        // A list without pictures reads as a menu (name and price on one line); with pictures, as cards.
        return `<ul class="products ${b.items.some((i) => i.image) ? 'cards' : 'menu'}" role="list"${flagged(path, true)}>${b.items.map((item, i) => product(`${path}.items[${i}]`, item)).join('')}</ul>`
      case 'figure':
        return image(`${path}.image`, b.image)
    }
  }

  const product = (path: string, item: Item): string => {
    const parts = [
      item.image ? image(`${path}.image`, item.image) : '',
      `<p class="name"${flagged(`${path}.name`)}>${text(item.name)}</p>`,
      item.prices.length
        ? `<p class="prices">${item.prices.map((p, i) => price(`${path}.prices[${i}]`, p)).join(' ')}</p>`
        : '',
      item.unit ? `<p class="unit"${flagged(`${path}.unit`)}>${text(item.unit)}</p>` : '',
      ...item.details.map((d, i) => block(`${path}.details[${i}]`, d)),
    ]
    return `<li${flagged(path, true)}>${parts.filter(Boolean).join('')}</li>`
  }

  const id = `page-${page.keyPage}`
  // Consecutive pictures share one gallery grid.
  const parts: string[] = []
  page.structure.blocks.forEach((b, i) => {
    const html = block(`blocks[${i}]`, b)
    const gallery = b.kind === 'figure' && page.structure.blocks[i - 1]?.kind === 'figure'
    if (gallery) parts[parts.length - 1] = (parts.at(-1) ?? '').replace(/<\/div>$/, `${html}</div>`)
    else parts.push(b.kind === 'figure' ? `<div class="gallery">${html}</div>` : html)
  })
  const marker = long ? '' : ' class="sr-only"'
  const html = `<section aria-labelledby="${id}" data-page="${page.keyPage}">\n<h2 id="${id}"${marker}>${ui.page} ${page.keyPage}</h2>\n${parts.join('\n')}\n</section>`
  return { html, toc }
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
