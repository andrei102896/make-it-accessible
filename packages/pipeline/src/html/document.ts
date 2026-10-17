import { runningFigures, textBlocks, visibleText } from './source.ts'
import { bandTitle, esc, legendLine, legendOf } from './inline.ts'
import { layoutOf, NO_LAYOUT } from './layout.ts'
import { linesCss } from './lines.ts'
import { renderPage } from './page.ts'
import { navigation, titleWordsOf } from './nav.ts'
import { type Strings, UI } from './strings.ts'
import { brandCss, headingClasses } from './brand.ts'
import { ROLES } from './profile.ts'
import { boxesCss } from './boxes.ts'
import { css } from './style.ts'

export type { HtmlDocument, HtmlPage } from './types.ts'
import type { HtmlDocument } from './types.ts'

// Long documents get a contents list; a page marker on a one- or two-page document is for screen readers only.
const TOC_PAGES = 3

export function renderDocument(doc: HtmlDocument): string {
  const ui: Strings = doc.lang.startsWith('de') ? UI.de : UI.en
  const long = doc.pages.length >= TOC_PAGES
  // Only a menu's legend: elsewhere "V Micro" or "AAA Batterien" are product words, not codes.
  const legend = doc.kind === 'menu' ? legendOf(textBlocks(doc.pages)) : new Map<string, string>()
  const running = runningFigures(doc.pages)
  const classes = doc.brand ? headingClasses(doc.brand) : new Map<string, string>()
  // Header and tail segments exist only with a brand: a page without one renders as before.
  const brand = doc.brand
  const logo = brand ? (doc.logo ?? null) : null
  const segments = doc.pages.map((p, i) =>
    brand ? layoutOf(p, i === 0, brand.profile.body, doc.title, i === 0 && logo !== null) : NO_LAYOUT,
  )
  const columns = Math.max(0, ...segments.flatMap((l) => l.bands.map((b) => b.columns.length)))
  const titleKey = segments[0]?.title !== null && segments[0] ? `0:blocks[${String(segments[0].title)}]` : null
  const titleWords = titleWordsOf(doc.title)
  const smallCaps = new Set(ROLES.filter((r) => brand?.profile.roles[r]?.smallCaps))
  const vectors = segments.flatMap((l) => [
    ...l.boxes.boxes,
    ...(l.boxes.pageFrame ? [{ vector: l.boxes.pageFrame, ink: null }] : []),
  ])
  // The rules the vector layer places replace the ones measured from the render, so a line is never drawn twice.
  const looks = new Map(segments.flatMap((l) => [...l.lines.looks]))
  const rules = looks.size ? [] : (brand?.rules ?? [])
  if (titleKey) classes.set(titleKey, `${classes.get(titleKey) ?? ''} masthead-title`.trim())
  const rendered = doc.pages.map((p, index) =>
    renderPage(p, {
      ui,
      lang: doc.lang,
      index,
      long,
      legend,
      running: running[index] ?? new Set(),
      classes,
      layout: segments[index] ?? NO_LAYOUT,
      kind: doc.kind ?? null,
      inks: new Set(brand?.profile.inks ?? []),
      inlinePrices: brand?.profile.pricesInline ?? false,
      smallCaps,
      titleWords,
    }),
  )
  const parts = doc.title.split(' · ')
  // The band already names the document; a contents entry saying the same again is left out.
  const same = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const seen = new Set([doc.title, ...parts].map(same))
  const toc = rendered.flatMap((r) => r.toc).filter((t) => !seen.has(same(t.name)) && seen.add(same(t.name)))
  const kind = doc.kind ?? null
  const nav = navigation(kind, toc, long, ui)
  const validity = doc.validity ? `<p class="validity">${esc(doc.validity)}</p>` : ''
  const title = bandTitle(parts)
  // A branded document that prints its whole name as its first heading shows it once: the band is for screen
  // readers only, its validity line stays visible.
  const first = doc.pages[0]
  const opening = first?.structure.blocks[0]
  // A logo names the place when its description carries most of the title's words ("Carmine's Restaurant Ybor…").
  const logoNamed = [...(segments[0]?.header ?? [])].some((i) => {
    const b = first?.structure.blocks[i]
    const alt = b?.kind === 'figure' && b.image.alt !== null ? same(b.image.alt) : ''
    return alt.length > 0 && titleWords.filter((w) => alt.includes(w)).length * 2 >= titleWords.length
  })
  const printed =
    doc.brand &&
    ((first !== undefined &&
      opening?.kind === 'heading' &&
      same(doc.title) === same(visibleText(opening.text, first.extraction))) ||
      titleKey !== null ||
      logoNamed ||
      logo !== null)
  // The legend once more before the first dish; the printed one stays where the PDF has it.
  const key = legendLine(legend)
  // With section chips (not pinned on a phone) or a contents list on several pages, every printed page ends with
  // a way back (outside the page, so never scored).
  const chips = nav.startsWith('<nav class="chips')
  const back =
    nav && (chips || doc.pages.length > 1)
      ? `\n<p class="back"><a href="#contents">${chips ? ui.sections : ui.contents} <span aria-hidden="true">↑</span></a></p>`
      : ''
  return `<!doctype html>
<html lang="${esc(doc.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>${css(doc.theme ?? null, doc.headings ?? null, brand ? brandCss({ ...brand, rules, masthead: { key: titleKey, logoShare: segments[0]?.logoShare ?? logo?.share ?? null }, columns, pages: doc.pages.map((p) => p.keyPage) }) + boxesCss(vectors) + linesCss(looks) : '')}</style>
</head>
<body class="doc-${kind ?? 'auto'}">
<a class="skip" href="#main">${ui.skip}</a>
<main id="main">
<div class="band${printed ? ' sr-only' : ''}"><h1>${title}</h1>${printed ? '' : validity}</div>${printed ? validity : ''}
${withLogo(rendered[0]?.masthead ?? '', logo)}${nav}${key}
${rendered.map((r) => r.html + back).join('\n')}
</main>
</body>
</html>
`
}

// The name as printed artwork leads the masthead (logo, name, lines); the band's h1 names the place for screen
// readers, so the picture is not read again.
function withLogo(masthead: string, logo: HtmlDocument['logo']): string {
  if (!logo) return masthead
  const img = `<div class="logo"><img src="${esc(logo.src)}" alt="" class="logo"></div>`
  // The name the model read from that artwork is the picture's own words: shown once, as the picture (Nick & Toni's).
  const unread = masthead.replace(/<h\d [^>]*masthead-title[^>]*><span data-seen>[^<]*<\/span><\/h\d>\n?/, '')
  return unread
    ? unread.replace(/^(<header class="masthead[^"]*">)\n/, `$1\n${img}\n`)
    : `<header class="masthead centered">\n${img}\n</header>`
}
