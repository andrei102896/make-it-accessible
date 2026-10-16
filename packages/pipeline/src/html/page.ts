import { amountOf, joinRuns, printedAmount, printsFusedCents } from '../pdf/runs.ts'
import { fitScale } from '../pdf/raster.ts'
import type { Run } from '../pdf/types.ts'
import type { Block, ImageValue, Item, PriceValue, TextValue } from '../model/schema.ts'
import { formatMoney, pageCurrency } from '../text/money.ts'
import { headedLists, inkedHtml, inkSegments, visibleText } from './source.ts'
import { unionOf } from './profile.ts'
import { dietTag, emphasizeMoney, esc, isAddOn, isBadge, linkify, noteTargets, trailingCodes } from './inline.ts'
import { assemble } from './layout.ts'
import { renderTable } from './table.ts'
import { vectorClass } from './boxes.ts'
import type { Context, HtmlPage, Rendered } from './types.ts'

// A lone picture keeps its printed size class (share of the page width); pictures printed together are tiles.
const SMALL_FIGURE = 1 / 3
const LARGE_FIGURE = 0.6
// A separator the print puts after a price or its label ("ea," "20,") belongs to neither: it stands between the prices.
const SEPARATOR = /[,;]$/

export function renderPage(
  page: HtmlPage,
  { ui, lang, index, long, legend, running, classes, layout, kind, inks, inlinePrices, smallCaps }: Context,
): Rendered {
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
  // Plain text for a label reused outside its element (the contents list); inked text, with the runs printed in a
  // brand colour wrapped, for the element itself.
  const plain = (t: TextValue): string => ('seen' in t ? `<span data-seen>${esc(t.seen)}</span>` : esc(raw(t)))
  const inked = (t: TextValue, shown: string, each: (s: string) => string = esc): string =>
    'seen' in t ? plain(t) : inks.size ? inkedHtml(inkSegments(t, e, shown), inks, each) : each(shown)
  const text = (t: TextValue): string => inked(t, raw(t))
  const rawName = (t: TextValue): string => visibleText(t, e, smallCaps.has('name'))
  // The narrowest element carrying a finding is marked, so a reviewer (and the scorer) sees what was flagged.
  const flagged = (path: string, exact = false): string =>
    page.flagged.some((f) => f === path || (!exact && (f.startsWith(`${path}.`) || f.startsWith(`${path}[`))))
      ? ' data-review'
      : ''

  const hidden = new Set(e.hidden)
  const onPage = runs.filter((r) => !hidden.has(r.id))
  const currency = pageCurrency(joinRuns(onPage))
  // Bare digits read as fused cents ("269" = 2,69) only on a page that prints euro/cent pairs; elsewhere they are shown as printed.
  const fusedCents = printsFusedCents(onPage)
  const visibleRuns = (t: { src: readonly (readonly [number, number])[] }): Run[] =>
    t.src.flatMap(([from, to]) => runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
  const inkOf = (words: readonly Run[]): string => {
    const [c, ...rest] = new Set(words.map((r) => r.color ?? ''))
    return c && !rest.length && inks.has(c) ? ` ink-${c.slice(1)}` : ''
  }
  // Prices in one list or table show decimals the same way: whole only when every amount in it is whole.
  let wholeHere = false
  const withWhole = <T>(prices: readonly PriceValue[], render: () => T): T => {
    const outer = wholeHere
    wholeHere = prices.every((p) => (amountOf(visibleRuns(p), currency)?.cents ?? 0) % 100 === 0)
    const out = render()
    wholeHere = outer
    return out
  }
  const price = (path: string, p: PriceValue): string => {
    const words = visibleRuns(p)
    const amount = amountOf(words, currency)
    const proven = amount?.currency && (!amount.fromBareDigits || fusedCents) ? amount.currency : null
    const printed = printedAmount(words)
    const whole = wholeHere && amount !== null && amount.cents % 100 === 0
    const shown = (amount && proven ? formatMoney(amount.cents, lang, proven, whole) : printed).replace(SEPARATOR, '')
    const data = amount && proven ? ` data-amount="${String(amount.cents)}"` : ''
    const printedLabel = p.qualifier ? raw(p.qualifier) : ''
    const label = p.qualifier ? printedLabel.replace(SEPARATOR, '') : p.role === 'previous' ? ui.previous : ''
    const qualifier = label
      ? `<span class="qualifier">${p.qualifier ? inked(p.qualifier, label) : esc(label)}</span>`
      : ''
    // The label sits where it is printed: "Bowl 8" before the amount, "3.5 ea" after it.
    const labelBox = p.qualifier && 'src' in p.qualifier ? unionOf(visibleRuns(p.qualifier)) : null
    const amountBox = unionOf(words)
    const after = labelBox !== null && amountBox !== null && labelBox.x > amountBox.x
    const sep = SEPARATOR.exec(after ? printedLabel : printed)?.[0] ?? ''
    const amountHtml = `<span class="amount">${esc(shown)}</span>`
    const parts = (after ? [amountHtml, qualifier] : [qualifier, amountHtml]).filter(Boolean).join(' ')
    return `<span class="price${inkOf(words)}" data-role="${p.role}"${data}${flagged(path)}>${parts}</span>${sep}`
  }

  const { width: pageWidth } = fitScale(e.width, e.height)
  const image = (path: string, img: ImageValue, figure: 'alone' | 'grouped' | null = null): string => {
    const src = page.imageSrc(path)
    if (!src) return ''
    const share = img.box[2] / pageWidth
    // A picture printed in the same place on other pages is page furniture: small and decorative; the header's
    // logo is the name of the place, whatever page repeats it.
    const at = Number(/^blocks\[(\d+)\]/.exec(path)?.[1] ?? -1)
    const logo = layout.header.has(at)
    const repeat = running.has(path) && !logo
    const alt = repeat ? '' : (img.alt ?? '')
    const size = logo
      ? 'logo'
      : figure === null
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
  // A note naming the heading it sits under describes every list since that heading, outside any box.
  const notes = new Map<string, { id: string; items: number[] | null; headed: boolean }>()
  const describedBy = new Map<string, string>()
  page.structure.blocks.forEach((b, i) => {
    const next = page.structure.blocks[i + 1]
    // Small print at the foot of the page (the tail) is never the list's note.
    if (b.kind !== 'products' || b.items.some((it) => it.image) || next?.kind !== 'paragraph' || layout.tail.has(i + 1))
      return
    const id = `note-${String(e.pdfPage)}-${String(i + 1)}`
    const lists = headedLists(page.structure.blocks, i + 1, raw)
    lists?.forEach((l) => describedBy.set(`blocks[${String(l)}]`, id))
    const items = lists
      ? null
      : noteTargets(
          raw(next.text),
          b.items.map((it) => raw(it.name)),
        )
    notes.set(`blocks[${String(i)}]`, { id, items, headed: lists !== null })
  })

  // A top-level block's layout classes: set centred or right as printed (align.ts), its printed rules (lines.ts).
  const classAt = (path: string): string => {
    const at = Number(/^blocks\[(\d+)\]$/.exec(path)?.[1] ?? -1)
    const a = layout.align.get(at)
    return [a ? `align-${a}` : '', layout.lines.blocks.get(at) ?? ''].filter(Boolean).join(' ')
  }
  let lastHeading: string | null = null
  const block = (path: string, b: Block): string => {
    switch (b.kind) {
      case 'heading': {
        // Each page's highest heading is an h3 under its "Page N" h2, whatever level the model gave it.
        const level = Math.max(3, Math.min(6, b.level - scale + 3))
        const label = plain(b.text)
        if (!label) return ''
        // Top-level headings of the page's highest level make the contents list.
        const listed = /^blocks\[\d+\]$/.test(path) && b.level === topLevel
        const id = listed
          ? `s${String(index)}-${path.replace(/\D/g, '')}`
          : `h${String(index)}${path.replace(/\D+/g, '-')}`
        if (listed) toc.push({ id, label })
        lastHeading = id
        const own = [classes.get(`${String(index)}:${path}`), classAt(path)].filter(Boolean).join(' ')
        const cls = own ? ` class="${own}"` : ''
        // Rules either side of a heading are flex items: its words stay one item.
        const shown = own.includes('rule-through') ? `<span>${text(b.text)}</span>` : text(b.text)
        return `<h${level} id="${id}"${cls}${flagged(path)}>${shown}</h${level}>`
      }
      case 'paragraph': {
        const words = raw(b.text)
        if (!words) return ''
        const body = inked(b.text, words, linkify)
        return `<p${classAt(path) ? ` class="${classAt(path)}"` : ''}${flagged(path)}>${body}</p>`
      }
      case 'list':
        return `<ul${classAt(path) ? ` class="${classAt(path)}"` : ''}${flagged(path, true)}>${b.items.map((t, i) => `<li${flagged(`${path}.items[${i}]`)}>${inked(t, raw(t), linkify)}</li>`).join('')}</ul>`
      case 'table':
        return renderTable(path, b, {
          text,
          linked: (t) => inked(t, raw(t), linkify),
          price,
          flagged,
          withWhole,
          keyPage: page.keyPage,
          lastHeading,
          tableLabel: ui.table,
          menu: kind === 'menu',
        })
      case 'products': {
        const cards = b.items.some((i) => i.image)
        const note = notes.get(path)
        const shape = layout.shapes.get(Number(/^blocks\[(\d+)\]$/.exec(path)?.[1] ?? -1))
        const items = withWhole(
          b.items.flatMap((item) => item.prices),
          () =>
            b.items
              .map((item, i) => {
                const at = `${path}.items[${i}]`
                const html = cards ? card(at, item) : dish(at, item, shape?.runOn === true && !inlinePrices)
                return note?.items?.includes(i) ? html.replace(/^<li/, `<li aria-describedby="${note.id}"`) : html
              })
              .join(''),
        )
        // A list without pictures reads as a menu (name and price on one line); with pictures, as cards.
        const by = describedBy.get(path)
        const described = by ? ` aria-describedby="${by}"` : ''
        const cls = `products ${cards ? 'cards' : 'menu'}${shape?.wide ? ' wide' : ''}${shape?.runOn ? ' run-on' : ''}${classAt(path) ? ` ${classAt(path)}` : ''}`
        return `<ul class="${cls}" role="list"${described}${flagged(path, true)}>${items}</ul>`
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

  const name = (
    path: string,
    item: Item,
    codes: readonly string[] = [],
    shown = inked(item.name, rawName(item.name)),
  ): string =>
    `<p class="name"${flagged(`${path}.name`)}>${shown}${codes.map((c) => ` ${dietTag(c, legend)}`).join('')}</p>`
  // role="text" makes VoiceOver read a price with its previous price as one phrase, not one stop per line.
  // A price cited twice for one dish (once with its description as qualifier) is shown once.
  const prices = (path: string, item: Item): string => {
    const own = item.prices.filter(
      (p, i, all) => all.findIndex((q) => JSON.stringify(q.src) === JSON.stringify(p.src)) === i,
    )
    return own.length
      ? `<p class="prices"><span role="text">${own.map((p) => price(`${path}.prices[${item.prices.indexOf(p)}]`, p)).join(' ')}</span></p>`
      : ''
  }
  const unit = (path: string, item: Item): string =>
    item.unit ? `<p class="unit"${flagged(`${path}.unit`)}>${text(item.unit)}</p>` : ''

  // A dish: name and price on one line, the description below; the legend's codes move next to the name. Where
  // the print runs the description on from the name (`leadFirst`), the lead description comes before the price.
  const dish = (path: string, item: Item, leadFirst = false): string => {
    const own = trailingCodes(rawName(item.name), legend)
    const codes = [...own.codes]
    let lead = -1
    const details = item.details.map((d, i) => {
      const at = `${path}.details[${i}]`
      if (d.kind !== 'paragraph' || 'seen' in d.text) return block(at, d)
      const { rest, codes: found } = trailingCodes(visibleText(d.text, e, smallCaps.has('desc')), legend)
      codes.push(...found)
      if (!rest) return ''
      const addon = isAddOn(rest)
      const body = inked(d.text, rest, addon ? (s) => emphasizeMoney(linkify(s)) : linkify)
      if (!addon && lead < 0) lead = i
      return `<p class="${addon ? 'addon' : lead === i ? 'desc lead' : 'desc'}"${flagged(at)}>${body}</p>`
    })
    const shown = inked(item.name, own.rest)
    const first = leadFirst && lead >= 0 ? (details[lead] ?? '') : ''
    const rest = first ? details.filter((_, i) => i !== lead) : details
    return `<li${flagged(path, true)}>${name(path, item, codes, shown)}${first}${prices(path, item)}${unit(path, item)}${rest.join('')}</li>`
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
  const parts: { at: number; html: string }[] = []
  let gallery = false
  page.structure.blocks.forEach((b, i) => {
    const html = block(`blocks[${i}]`, b)
    const previous = page.structure.blocks[i - 1]
    const ornament = html.includes('class="fig-s"')
    const last = parts.at(-1)
    if (b.kind === 'figure' && html && !ornament && gallery && last)
      last.html = last.html.replace(/<\/div>$/, `${html}</div>`)
    else if (b.kind === 'figure' && html)
      parts.push({
        at: i,
        html: `<div class="${ornament ? 'ornament' : html.includes('class="logo"') ? 'logo' : 'gallery'}">${html}</div>`,
      })
    else if (previous && notes.has(`blocks[${String(i - 1)}]`) && html) {
      const note = notes.get(`blocks[${String(i - 1)}]`)
      const p = html.replace(
        /^<p(?: class="([^"]*)")?/,
        (_, own?: string) => `<p class="note${own ? ` ${own}` : ''}" id="${note?.id ?? ''}"`,
      )
      if (note?.items || note?.headed) parts.push({ at: i, html: p })
      else {
        const list = (parts.pop()?.html ?? '').replace(/^<ul /, `<ul aria-describedby="${note?.id ?? ''}" `)
        parts.push({ at: i, html: `<div class="priced">${list}${p}</div>` })
      }
    } else if (html) parts.push({ at: i, html })
    gallery = b.kind === 'figure' && Boolean(html) && !ornament
  })
  // The masthead reads logo, name, then the lines (hours, address), whatever order the print scatters them in.
  const rank = (p: { at: number; html: string }): number =>
    p.html.includes('class="logo"') ? 0 : p.at === layout.title ? 1 : 2
  const masthead = parts
    .filter((p) => layout.header.has(p.at))
    .sort((a, b) => rank(a) - rank(b) || a.at - b.at)
    .map((p) => p.html)
    .join('\n')
  const header = masthead
    ? `<header class="masthead${layout.centered ? ' centered' : ''}">\n${masthead}\n</header>`
    : ''
  const body = assemble(parts, layout)
  const marker = long ? '' : ' class="sr-only"'
  const framed = layout.boxes.pageFrame ? ` class="box ${vectorClass(layout.boxes.pageFrame)}"` : ''
  const html = `<section aria-labelledby="${id}"${framed} data-page="${page.keyPage}">\n<h2 id="${id}"${marker}>${ui.page} ${e.pdfPage}</h2>\n${body.join('\n')}\n</section>`
  return { html, toc, masthead: header }
}
