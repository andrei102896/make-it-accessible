import { amountOf, centPartner, joinRuns } from '../pdf/runs.ts'
import { fitScale } from '../pdf/raster.ts'
import type { Extraction, Run } from '../pdf/types.ts'
import type { DocumentType, HeadingClass } from '../model/brief.ts'
import type { Block, ImageValue, Item, PageStructure, PriceValue, TextValue } from '../model/schema.ts'
import { formatMoney, pageCurrency } from '../text/money.ts'
import { runningFigures, textBlocks, visibleText } from './source.ts'
import {
  dietTag,
  emphasizeMoney,
  esc,
  isAddOn,
  isBadge,
  bandTitle,
  legendLine,
  legendOf,
  linkify,
  noteTargets,
  trailingCodes,
  type Legend,
} from './inline.ts'
import { navigation, type TocEntry } from './nav.ts'
import { type Strings, UI } from './strings.ts'
import { css } from './style.ts'
import type { Theme } from './theme.ts'

export type HtmlPage = {
  keyPage: number
  structure: PageStructure
  extraction: Extraction
  flagged: readonly string[]
  imageSrc: (path: string) => string | undefined
}
// `kind`, `headings` and `validity` come from the document brief; without one the page is laid out from its blocks.
export type HtmlDocument = {
  lang: string
  title: string
  pages: HtmlPage[]
  theme?: Theme | null
  kind?: DocumentType | null
  headings?: HeadingClass | null
  validity?: string | null
}
type Rendered = { html: string; toc: TocEntry[] }
type Context = { ui: Strings; lang: string; index: number; long: boolean; legend: Legend; running: Set<string> }

// Long documents get a contents list; a page marker on a one- or two-page document is for screen readers only.
const TOC_PAGES = 3
// A lone picture keeps its printed size class (share of the page width); pictures printed together are tiles.
const SMALL_FIGURE = 1 / 3
const LARGE_FIGURE = 0.6

export function renderDocument(doc: HtmlDocument): string {
  const ui: Strings = doc.lang.startsWith('de') ? UI.de : UI.en
  const long = doc.pages.length >= TOC_PAGES
  // Only a menu's legend: elsewhere "V Micro" or "AAA Batterien" are product words, not codes.
  const legend = doc.kind === 'menu' ? legendOf(textBlocks(doc.pages)) : new Map<string, string>()
  const running = runningFigures(doc.pages)
  const rendered = doc.pages.map((p, index) =>
    renderPage(p, { ui, lang: doc.lang, index, long, legend, running: running[index] ?? new Set() }),
  )
  const parts = doc.title.split(' · ')
  // The band already names the document; a contents entry saying the same again is left out.
  const same = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const seen = new Set([doc.title, ...parts].map(same))
  const toc = rendered.flatMap((r) => r.toc).filter((t) => !seen.has(same(t.label)) && seen.add(same(t.label)))
  const kind = doc.kind ?? null
  const nav = navigation(kind, toc, long, ui)
  const validity = doc.validity ? `<p class="validity">${esc(doc.validity)}</p>` : ''
  const title = bandTitle(parts)
  // The legend once more before the first dish; the printed one stays where the PDF has it.
  const key = legendLine(legend)
  // With a contents list, every printed page ends with a way back to it (outside the page, so never scored).
  const backLabel = nav.startsWith('<nav class="chips"') ? ui.sections : ui.contents
  const back =
    nav && doc.pages.length > 1
      ? `\n<p class="back"><a href="#contents">${backLabel} <span aria-hidden="true">↑</span></a></p>`
      : ''
  return `<!doctype html>
<html lang="${esc(doc.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>${css(doc.theme ?? null, doc.headings ?? null)}</style>
</head>
<body class="doc-${kind ?? 'auto'}">
<a class="skip" href="#main">${ui.skip}</a>
<main id="main">
<div class="band"><h1>${title}</h1>${validity}</div>
${nav}${key}
${rendered.map((r) => r.html + back).join('\n')}
</main>
</body>
</html>
`
}

function renderPage(page: HtmlPage, { ui, lang, index, long, legend, running }: Context): Rendered {
  const e = page.extraction
  const runs = e.runs
  const toc: Rendered['toc'] = []
  // The page's highest top-level heading sets the scale; a page with nested headings only uses theirs.
  const levels = (blocks: readonly Block[]): number[] =>
    blocks.flatMap((b) =>
      b.kind === 'heading' ? [b.level] : b.kind === 'products' ? b.items.flatMap((i) => levels(i.details)) : [],
    )
  const topLevel = Math.min(...page.structure.blocks.flatMap((b) => (b.kind === 'heading' ? [b.level] : [])))
  const scale = Number.isFinite(topLevel) ? topLevel : Math.min(...levels(page.structure.blocks))
  const raw = (t: TextValue): string => visibleText(t, e)
  const text = (t: TextValue): string => ('seen' in t ? `<span data-seen>${esc(t.seen)}</span>` : esc(raw(t)))
  // The narrowest element carrying a finding is marked, so a reviewer (and the scorer) sees what was flagged.
  const flagged = (path: string, exact = false): string =>
    page.flagged.some((f) => f === path || (!exact && (f.startsWith(`${path}.`) || f.startsWith(`${path}[`))))
      ? ' data-review'
      : ''

  const hidden = new Set(e.hidden)
  const onPage = runs.filter((r) => !hidden.has(r.id))
  const currency = pageCurrency(joinRuns(onPage))
  // Bare digits read as fused cents ("269" = 2,69) only on a page that prints euro/cent pairs; elsewhere they are shown as printed.
  const fusedCents = onPage.some((r) => centPartner(r, onPage) !== undefined)
  const cited = (p: PriceValue): Run[] =>
    p.src.flatMap(([from, to]) => runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
  // Prices in one list or table show decimals the same way: whole only when every amount in it is whole.
  let wholeHere = false
  const allWhole = (prices: readonly PriceValue[]): boolean =>
    prices.every((p) => (amountOf(cited(p), currency)?.cents ?? 0) % 100 === 0)
  const price = (path: string, p: PriceValue): string => {
    const label = p.qualifier ? text(p.qualifier) : p.role === 'previous' ? ui.previous : ''
    const words = cited(p)
    const amount = amountOf(words, currency)
    const proven = amount?.currency && (!amount.fromBareDigits || fusedCents) ? amount.currency : null
    const printed = joinRuns(words)
    const whole = wholeHere && amount !== null && amount.cents % 100 === 0
    const shown = amount && proven ? formatMoney(amount.cents, lang, proven, whole) : printed
    const data = amount && proven ? ` data-amount="${String(amount.cents)}"` : ''
    const qualifier = label ? `<span class="qualifier">${label}</span> ` : ''
    return `<span class="price" data-role="${p.role}"${data}${flagged(path)}>${qualifier}<span class="amount">${esc(shown)}</span></span>`
  }

  const { width: pageWidth } = fitScale(e.width, e.height)
  const image = (path: string, img: ImageValue, figure: 'alone' | 'grouped' | null = null): string => {
    const src = page.imageSrc(path)
    if (!src) return ''
    const share = img.box[2] / pageWidth
    // A picture printed in the same place on other pages is page furniture: small and decorative.
    const repeat = running.has(path)
    const alt = repeat ? '' : (img.alt ?? '')
    const size =
      figure === null
        ? ''
        : img.alt === null || repeat || (figure === 'alone' && share < SMALL_FIGURE)
          ? 'fig-s'
          : share > LARGE_FIGURE
            ? 'fig-l'
            : figure === 'alone'
              ? 'fig-m'
              : ''
    return `<img src="${esc(src)}" alt="${esc(alt)}"${size ? ` class="${size}"` : ''}${flagged(path)}>`
  }

  // A note printed right under a menu-style list describes the items it names, or the whole list when it names none.
  const notes = new Map<string, { id: string; items: number[] | null }>()
  page.structure.blocks.forEach((b, i) => {
    const next = page.structure.blocks[i + 1]
    if (b.kind !== 'products' || b.items.some((it) => it.image) || next?.kind !== 'paragraph') return
    const items = noteTargets(
      raw(next.text),
      b.items.map((it) => raw(it.name)),
    )
    notes.set(`blocks[${String(i)}]`, { id: `note-${String(e.pdfPage)}-${String(i + 1)}`, items })
  })

  let lastHeading: string | null = null
  const block = (path: string, b: Block): string => {
    switch (b.kind) {
      case 'heading': {
        // Each page's highest heading is an h3 under its "Page N" h2, whatever level the model gave it.
        const level = Math.max(3, Math.min(6, b.level - scale + 3))
        const label = text(b.text)
        if (!label) return ''
        // Top-level headings of the page's highest level make the contents list.
        const listed = /^blocks\[\d+\]$/.test(path) && b.level === topLevel
        const id = listed
          ? `s${String(index)}-${path.replace(/\D/g, '')}`
          : `h${String(index)}${path.replace(/\D+/g, '-')}`
        if (listed) toc.push({ id, label })
        lastHeading = id
        return `<h${level} id="${id}"${flagged(path)}>${label}</h${level}>`
      }
      case 'paragraph': {
        const words = raw(b.text)
        if (!words) return ''
        const body = 'seen' in b.text ? text(b.text) : linkify(words)
        return `<p${flagged(path)}>${body}</p>`
      }
      case 'list':
        return `<ul${flagged(path, true)}>${b.items.map((t, i) => `<li${flagged(`${path}.items[${i}]`)}>${'seen' in t ? text(t) : linkify(raw(t))}</li>`).join('')}</ul>`
      case 'table':
        return table(path, b)
      case 'products': {
        const outer = wholeHere
        wholeHere = allWhole(b.items.flatMap((item) => item.prices))
        const cards = b.items.some((i) => i.image)
        const note = notes.get(path)
        const items = b.items
          .map((item, i) => {
            const html = (cards ? card : dish)(`${path}.items[${i}]`, item)
            return note?.items?.includes(i) ? html.replace(/^<li/, `<li aria-describedby="${note.id}"`) : html
          })
          .join('')
        wholeHere = outer
        // A list without pictures reads as a menu (name and price on one line); with pictures, as cards.
        return `<ul class="products ${cards ? 'cards' : 'menu'}" role="list"${flagged(path, true)}>${items}</ul>`
      }
      case 'figure': {
        const top = /^blocks\[(\d+)\]$/.exec(path)?.[1]
        const blocks = page.structure.blocks
        const i = Number(top)
        const grouped = top !== undefined && (blocks[i - 1]?.kind === 'figure' || blocks[i + 1]?.kind === 'figure')
        return image(`${path}.image`, b.image, grouped ? 'grouped' : 'alone')
      }
    }
  }

  const table = (path: string, b: Extract<Block, { kind: 'table' }>): string => {
    const outer = wholeHere
    wholeHere = allWhole(b.rows.flatMap((row) => row.flatMap((cell) => cell.prices ?? [])))
    const id = `${path.replace(/[^a-z0-9]/gi, '-')}-p${page.keyPage}`
    const caption = b.caption ? `<caption id="${id}"${flagged(`${path}.caption`)}>${text(b.caption)}</caption>` : ''
    const rows = b.rows.map((row, r) => {
      const cells = row.map((cell, c) => {
        const at = `${path}.rows[${r}][${c}]`
        const content = [
          cell.text ? ('seen' in cell.text ? text(cell.text) : linkify(raw(cell.text))) : '',
          ...(cell.prices ?? []).map((p, i) => price(`${at}.prices[${i}]`, p)),
        ]
          .filter(Boolean)
          .join(' ')
        const span = `${cell.colSpan ? ` colspan="${cell.colSpan}"` : ''}${cell.rowSpan ? ` rowspan="${cell.rowSpan}"` : ''}`
        // A cell holding only prices is a money column: right-aligned, figures lined up.
        const num = cell.prices?.length && !cell.text ? ' class="num"' : ''
        if (!cell.header) return `<td${span}${num}>${content}</td>`
        const group = cell.header === 'col' ? (cell.colSpan ? 'colgroup' : 'col') : cell.rowSpan ? 'rowgroup' : 'row'
        return `<th scope="${group}"${span}>${content}</th>`
      })
      return `<tr${flagged(`${path}.rows[${r}]`)}>${cells.join('')}</tr>`
    })
    // Leading rows of column headers are the table's head: printed again on every page, ruled off below. A header
    // cell spanning down into the body would be cut at the boundary, so then there is no head.
    const head = b.rows.findIndex((row) => !row.every((cell) => cell.header === 'col'))
    const leading = head === -1 ? rows.length : head
    const crossing = b.rows.slice(0, leading).some((row, r) => row.some((cell) => r + (cell.rowSpan ?? 1) > leading))
    const split = crossing ? 0 : leading
    const thead = split ? `<thead>${rows.slice(0, split).join('')}</thead>` : ''
    // Without a caption, the table is named by the heading it sits under, so two tables never share a name.
    const named = b.caption ? id : lastHeading
    const name = named ? `aria-labelledby="${named}"` : `aria-label="${ui.table}"`
    wholeHere = outer
    return `<div class="table" role="region" tabindex="0" ${name}${flagged(path, true)}><table ${name}>${caption}${thead}<tbody>${rows.slice(split).join('')}</tbody></table></div>`
  }

  const name = (path: string, item: Item, codes: readonly string[] = [], shown = text(item.name)): string =>
    `<p class="name"${flagged(`${path}.name`)}>${shown}${codes.map((c) => ` ${dietTag(c, legend)}`).join('')}</p>`
  // role="text" makes VoiceOver read a price with its previous price as one phrase, not one stop per line.
  const prices = (path: string, item: Item): string =>
    item.prices.length
      ? `<p class="prices"><span role="text">${item.prices.map((p, i) => price(`${path}.prices[${i}]`, p)).join(' ')}</span></p>`
      : ''
  const unit = (path: string, item: Item): string =>
    item.unit ? `<p class="unit"${flagged(`${path}.unit`)}>${text(item.unit)}</p>` : ''

  // A dish: name and price on one line, the description below; the legend's codes move next to the name.
  const dish = (path: string, item: Item): string => {
    const own = trailingCodes(raw(item.name), legend)
    const codes = [...own.codes]
    const details = item.details.map((d, i) => {
      const at = `${path}.details[${i}]`
      if (d.kind !== 'paragraph' || 'seen' in d.text) return block(at, d)
      const { rest, codes: found } = trailingCodes(raw(d.text), legend)
      codes.push(...found)
      if (!rest) return ''
      const body = isAddOn(rest) ? emphasizeMoney(linkify(rest)) : linkify(rest)
      return `<p class="${isAddOn(rest) ? 'addon' : 'desc'}"${flagged(at)}>${body}</p>`
    })
    const shown = own.codes.length ? esc(own.rest) : text(item.name)
    return `<li${flagged(path, true)}>${name(path, item, codes, shown)}${prices(path, item)}${unit(path, item)}${details.join('')}</li>`
  }

  // A card: picture, name, offer, then the rest; each part sits on a row shared with the cards beside it
  // (subgrid), so prices line up across a row while the reading order stays name then price.
  const card = (path: string, item: Item): string => {
    const offered = item.prices.some((p) => p.role === 'previous' || p.role === 'discount')
    const details = item.details.map((d, i) => {
      const at = `${path}.details[${i}]`
      if (offered && d.kind === 'paragraph' && !('seen' in d.text) && isBadge(raw(d.text)))
        return `<p class="tag"${flagged(at)}>${text(d.text)}</p>`
      return block(at, d)
    })
    const more = details.join('') ? `<div class="more">${details.join('')}</div>` : ''
    const picture = item.image ? image(`${path}.image`, item.image) : ''
    return `<li${flagged(path, true)}>${picture}${name(path, item)}<div class="offer">${prices(path, item)}${unit(path, item)}</div>${more}</li>`
  }

  const id = `page-${e.pdfPage}`
  // Consecutive pictures share one gallery, a small ornament stands on its own line; a note describing a whole list
  // shares one group with it.
  const parts: string[] = []
  let gallery = false
  page.structure.blocks.forEach((b, i) => {
    const html = block(`blocks[${i}]`, b)
    const previous = page.structure.blocks[i - 1]
    const ornament = html.includes('class="fig-s"')
    if (b.kind === 'figure' && html && !ornament && gallery)
      parts[parts.length - 1] = (parts.at(-1) ?? '').replace(/<\/div>$/, `${html}</div>`)
    else if (b.kind === 'figure' && html) parts.push(`<div class="${ornament ? 'ornament' : 'gallery'}">${html}</div>`)
    else if (previous && notes.has(`blocks[${String(i - 1)}]`) && html) {
      const note = notes.get(`blocks[${String(i - 1)}]`)
      const p = html.replace(/^<p/, `<p class="note" id="${note?.id ?? ''}"`)
      if (note?.items) parts.push(p)
      else {
        const list = (parts.pop() ?? '').replace(/^<ul /, `<ul aria-describedby="${note?.id ?? ''}" `)
        parts.push(`<div class="priced">${list}${p}</div>`)
      }
    } else if (html) parts.push(html)
    gallery = b.kind === 'figure' && Boolean(html) && !ornament
  })
  const marker = long ? '' : ' class="sr-only"'
  const html = `<section aria-labelledby="${id}" data-page="${page.keyPage}">\n<h2 id="${id}"${marker}>${ui.page} ${e.pdfPage}</h2>\n${parts.join('\n')}\n</section>`
  return { html, toc }
}
