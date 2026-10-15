import type { HeadingClass } from '../model/brief.ts'
import type { Theme } from './theme.ts'

// No non-empty `content:` anywhere: generated text is read by screen readers but not by the scorer (innerText).
const BASE = `
:root { color-scheme: light; --fg: #1a1a1a; --bg: #ffffff; --muted: #555555; --line: #d9d9d9; --panel: #f4f4f4;
  --focus: #1d4ed8; --accent: var(--fg); --band-bg: var(--bg); --band-fg: var(--fg); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 1.0625rem/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow-wrap: anywhere; }
main { max-width: 64rem; margin: 0 auto; padding: 0 1rem 3rem; }
.skip { position: absolute; left: -999rem; }
.skip:focus { left: 1rem; top: 1rem; background: var(--bg); color: var(--fg); padding: .5rem; z-index: 1; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 6px var(--bg); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap; border: 0; }
.band { background: var(--band-bg); color: var(--band-fg); margin: 0 0 1.5rem; padding: 1.5rem 0;
  border-image: conic-gradient(var(--band-bg) 0 0) fill 0 / / 0 100vmax; }
@media (forced-colors: active) { .band { border-image: none; } }
.band h1 { margin: 0; max-width: 64rem; font-size: clamp(1.5rem, 1rem + 2.5vw, 2rem); line-height: 1.15; letter-spacing: -.01em; }
.band .brand { display: block; font-size: 1.125rem; font-weight: 600; letter-spacing: .02em; margin-bottom: .25rem; }
nav.toc { margin: 0 0 2rem; border: 1px solid var(--line); border-radius: .5rem; padding: .75rem 1rem; }
nav.toc summary { cursor: pointer; font-weight: 600; min-height: 1.5rem; }
nav.toc ol { margin: .5rem 0 0; padding-left: 1.25rem; columns: 2 16rem; }
section { margin-top: 2.5rem; }
section > h2 { font-size: .8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
  border-top: 1px solid var(--line); padding-top: .5rem; margin: 0 0 1rem; }
h1, h3, h4 { font-family: var(--heading-font, inherit); }
h3, h4 { font-size: 1.5rem; line-height: 1.25; margin: 2rem 0 .75rem; color: var(--accent); letter-spacing: -.01em;
  scroll-margin-top: 4.5rem; }
h4 { font-size: 1.3rem; }
h5, h6 { font-size: 1.1rem; margin: 1.5rem 0 .5rem; }
p { margin: .5rem 0; }
.price[data-role="current"] { font-weight: 700; }
.price[data-role="previous"] .amount { text-decoration: line-through; }
.price[data-role="previous"], .unit { color: var(--muted); }
.prices, td.num { font-variant-numeric: lining-nums tabular-nums; }
.qualifier { font-weight: 600; }
.unit { font-size: 1rem; }
.products { list-style: none; padding: 0; margin: 0 0 1.5rem; }
.products.menu { columns: 2 24rem; column-gap: 3rem; }
.products.menu > li { break-inside: avoid; display: grid; grid-template-columns: 1fr auto; column-gap: 1rem;
  padding: .65rem 0; border-bottom: 1px solid var(--line); }
.products.menu > li > * { margin: 0; }
.products.menu .name, .products.menu .prices { font-weight: 600; }
.products.menu .prices { text-align: right; white-space: nowrap; font-variant-numeric: lining-nums tabular-nums; }
.products.menu > li > :not(.name, .prices) { grid-column: 1 / -1; color: var(--muted); font-size: 1rem; margin-top: .15rem; }
.products.menu .addon { padding-left: .75rem; font-size: .875rem; }
.diet { display: inline-block; border: 1px solid currentColor; border-radius: .25rem; padding: 0 .3rem; margin-left: .25rem;
  font-size: .875rem; font-weight: 600; line-height: 1.4; color: var(--muted); }
.legend { display: flex; flex-wrap: wrap; gap: .25rem 1rem; margin: 0 0 1rem; font-size: 1rem; color: var(--muted); }
.legend .diet { margin: 0 .25rem 0 0; }
.priced { border: 1px solid var(--line); border-radius: .5rem; padding: .75rem 1rem; margin: 0 0 1.5rem; }
.priced .products { margin-bottom: .5rem; }
.note { font-weight: 600; margin-bottom: 0; }
.addon .money { font-weight: 600; color: var(--fg); }
.products.cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
  container-type: inline-size; }
.products.cards > li { display: grid; grid-template-rows: subgrid; grid-row: span 4; row-gap: .5rem; align-content: start;
  border: 1px solid var(--line); border-radius: .5rem; padding: .75rem; hyphens: auto; }
.products.cards > li > img { grid-row: 1; }
.products.cards > li > .name { grid-row: 2; }
.products.cards > li > .offer { grid-row: 3; }
.products.cards > li > .more { grid-row: 4; }
.products.cards > li > *, .products.cards .offer > *, .products.cards .more > * { margin: 0; }
.products.cards .more { display: flex; flex-direction: column; gap: .25rem; }
.products.cards img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #ffffff; border-radius: .25rem; }
.products.cards .name { font-weight: 600; line-height: 1.3; align-self: start; }
.products.cards .price { display: block; }
.products.cards .price[data-role="current"] { font-size: 1.75rem; font-weight: 800; line-height: 1.2; }
.products.cards .price[data-role="previous"], .products.cards .unit { font-size: 1rem; }
.price[data-role="discount"], .products.cards .tag { display: block; width: fit-content; border: 1.5px solid var(--accent);
  color: var(--accent); border-radius: .25rem; padding: 0 .4rem; font-size: .875rem; font-weight: 700; }
@container (max-width: 28.95rem) {
  .products.cards > li { grid-row: auto; grid-template-rows: none; grid-template-columns: 6rem 1fr; column-gap: .75rem; }
  .products.cards > li > img { grid-column: 1; grid-row: 1 / span 2; }
  .products.cards > li > :not(img) { grid-column: 2; }
  .products.cards > li > .name { grid-row: 1; }
  .products.cards > li > .offer { grid-row: 2; }
  .products.cards > li > .more { grid-column: 1 / -1; grid-row: 3; }
}
.gallery { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; margin: 1rem 0 1.5rem; }
.gallery img { flex: 1 1 12rem; max-width: 24rem; min-width: 0; border-radius: .25rem; }
.gallery .fig-l { flex-basis: 100%; max-width: 40rem; }
.gallery .fig-m { max-width: 30rem; }
.gallery .fig-s, .ornament img { flex: none; width: 7.5rem; }
.ornament { margin: 1rem 0 1.5rem; }
img { max-width: 100%; height: auto; }
.table { overflow-x: auto; margin: 1rem 0 1.5rem; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { border-bottom: 1px solid var(--line); padding: .45rem .75rem; text-align: left; vertical-align: top;
  overflow-wrap: normal; }
th { font-weight: 600; }
th[scope="row"] { min-width: 9rem; }
thead tr:last-child > * { border-bottom: 2px solid var(--fg); }
.table tr > th:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg); box-shadow: inset -1px 0 var(--line); }
td.num { text-align: right; white-space: nowrap; }
.validity { margin: .5rem 0 0; font-weight: 600; }
nav.chips { position: sticky; top: 0; z-index: 1; background: var(--bg); border-bottom: 1px solid var(--line);
  margin: 0 0 1rem; overflow-x: auto; }
nav.chips ul { display: flex; gap: .5rem; list-style: none; margin: 0; padding: .5rem 0; }
nav.chips a { display: inline-block; white-space: nowrap; padding: .35rem .8rem; min-height: 2.75rem; line-height: 2rem;
  border: 1px solid var(--line); border-radius: 999px; color: var(--fg); text-decoration: none; }
nav.chips a:hover { border-color: var(--accent); }
.toc-title { font-weight: 600; margin: 0; }
html:has(nav.chips) { scroll-padding-top: 4.5rem; }
.back { margin: 1.5rem 0 0; font-size: .9375rem; }
.back a { display: inline-block; min-height: 2.75rem; line-height: 2.75rem; }
.price[data-role="current"] .qualifier { display: inline-block; border: 1.5px solid var(--accent); color: var(--accent);
  border-radius: .25rem; padding: 0 .35rem; font-size: .875rem; font-weight: 700; }
section p a, section li a, section td a { display: inline-block; padding-block: .55rem; margin-inline-end: .75rem; }
a[href^="tel:"] { white-space: nowrap; }
.doc-menu main { max-width: 60rem; }
section > p, .priced > p { max-width: 65ch; }
.doc-pricelist table { font-size: 1rem; }
.doc-pricelist h3, .doc-brochure h3 { font-size: 1.625rem; line-height: 1.2; margin: 1.5rem 0 .75rem; }
.doc-pricelist h4, .doc-brochure h4 { font-size: 1.25rem; line-height: 1.25; margin: 1.5rem 0 .75rem; }
.doc-pricelist p, .doc-brochure p { line-height: 1.6; }
`

const PRINT = `
@media print {
  :root { --fg: #000000; --bg: #ffffff; --muted: #333333; --accent: #000000; --band-bg: #ffffff; --band-fg: #000000; }
  body * { color: #000000 !important; }
  .skip, nav.toc, nav.chips, .back { display: none; }
  li, tr, img { break-inside: avoid; }
  .products.menu { columns: 1; }
  .table { overflow: visible; }
}
`

// Heading stacks per typeface class (modernfontstacks.com), used when the document's own face is not vendored.
export const STACKS: Record<HeadingClass, string> = {
  oldstyle: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif",
  transitional: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  didone: "Didot, 'Bodoni MT', 'Noto Serif Display', 'URW Palladio L', P052, Sylfaen, serif",
  slab: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', 'Sitka Small', serif",
  geometric: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif",
  neogrotesque: "Inter, Roboto, 'Helvetica Neue', 'Arial Nova', 'Nimbus Sans', Arial, sans-serif",
  humanist: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif",
  condensed:
    "Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif",
  // A script face is not readable as running headings; a matching serif stands in.
  script: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif",
}

// `brand`: the document's own faces, colours and sizes (brand.ts), after the base so it wins by order.
export function css(theme: Theme | null, headings: HeadingClass | null = null, brand = ''): string {
  const font = headings ? `:root { --heading-font: ${STACKS[headings]}; }` : ''
  const band = theme?.band ? `:root { --band-bg: ${theme.band.bg}; --band-fg: ${theme.band.fg}; }` : ''
  const accent = theme?.accent ? `:root { --accent: ${theme.accent.light}; }` : ''
  return `${BASE}${band}${accent}${font}${brand}\n${PRINT}`
}
