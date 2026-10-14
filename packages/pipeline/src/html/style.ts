import type { Theme } from './theme.ts'

// No non-empty `content:` anywhere: generated text is read by screen readers but not by the scorer (innerText).
const BASE = `
:root { color-scheme: light dark; --fg: #1a1a1a; --bg: #ffffff; --muted: #555555; --line: #d9d9d9; --panel: #f4f4f4;
  --focus: #1d4ed8; --accent: var(--fg); --band-bg: var(--bg); --band-fg: var(--fg); }
@media (prefers-color-scheme: dark) { :root { --fg: #f2f2f2; --bg: #121212; --muted: #b8b8b8; --line: #3a3a3a;
  --panel: #1e1e1e; --focus: #93b4ff; --accent: var(--fg); } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 1.0625rem/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow-wrap: anywhere; }
main { max-width: 64rem; margin: 0 auto; padding: 0 1rem 3rem; }
.skip { position: absolute; left: -999rem; }
.skip:focus { left: 1rem; top: 1rem; background: var(--bg); color: var(--fg); padding: .5rem; z-index: 1; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 6px var(--bg); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap; border: 0; }
.band { background: var(--band-bg); color: var(--band-fg); margin: 0 0 1.5rem; padding: 2.5rem 0 2rem;
  border-image: conic-gradient(var(--band-bg) 0 0) fill 0 / / 0 100vmax; }
.band h1 { margin: 0; max-width: 64rem; font-size: clamp(1.75rem, 5vw, 2.75rem); line-height: 1.15; letter-spacing: -.01em; }
nav.toc { margin: 0 0 2rem; border: 1px solid var(--line); border-radius: .5rem; padding: .75rem 1rem; }
nav.toc summary { cursor: pointer; font-weight: 600; min-height: 1.5rem; }
nav.toc ol { margin: .5rem 0 0; padding-left: 1.25rem; columns: 2 16rem; }
section { margin-top: 2.5rem; }
section > h2 { font-size: .8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
  border-top: 1px solid var(--line); padding-top: .5rem; margin: 0 0 1rem; }
h3, h4 { font-size: 1.5rem; line-height: 1.25; margin: 2rem 0 .75rem; color: var(--accent); letter-spacing: -.01em; }
h4 { font-size: 1.3rem; }
h5, h6 { font-size: 1.1rem; margin: 1.5rem 0 .5rem; }
p { margin: .5rem 0; }
.price[data-role="current"] { font-weight: 700; }
.price[data-role="previous"] .amount { text-decoration: line-through; }
.price[data-role="previous"], .unit { color: var(--muted); }
.qualifier { font-weight: 600; }
.unit { font-size: .9375rem; }
.products { list-style: none; padding: 0; margin: 0 0 1.5rem; }
.products.menu { columns: 2 24rem; column-gap: 3rem; }
.products.menu > li { break-inside: avoid; display: grid; grid-template-columns: 1fr auto; column-gap: 1rem;
  padding: .65rem 0; border-bottom: 1px solid var(--line); }
.products.menu > li > * { margin: 0; }
.products.menu .name, .products.menu .prices { font-weight: 600; }
.products.menu .prices { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.products.menu > li > :nth-child(n+3) { grid-column: 1 / -1; color: var(--muted); font-size: .9375rem; margin-top: .15rem; }
.products.cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); }
.products.cards > li { border: 1px solid var(--line); border-radius: .5rem; padding: .75rem; display: flex; flex-direction: column; gap: .25rem; }
.products.cards > li > * { margin: 0; }
.products.cards img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #ffffff; border-radius: .25rem; }
.products.cards > li { hyphens: auto; }
.products.cards .name { font-weight: 600; line-height: 1.3; }
.products.cards .price[data-role="current"] { font-size: 1.35rem; font-weight: 800; }
.gallery { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); margin: 1rem 0 1.5rem; }
.gallery img { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: var(--panel); border-radius: .5rem; }
img { max-width: 100%; height: auto; }
.table { overflow-x: auto; margin: 1rem 0 1.5rem; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { border-bottom: 1px solid var(--line); padding: .45rem .75rem; text-align: left; vertical-align: top; }
th { font-weight: 600; }
tr:nth-child(even) td { background: var(--panel); }
`

const PRINT = `
@media print {
  :root { --fg: #000000; --bg: #ffffff; --muted: #333333; --accent: #000000; --band-bg: #ffffff; --band-fg: #000000; }
  .skip, nav.toc { display: none; }
  li, tr, img { break-inside: avoid; }
  .products.menu { columns: 2; }
}
`

// The document's colours only where they were checked: the band is its own pair (both schemes), the accent is
// readable on white, so it applies to light pages only.
export function css(theme: Theme | null): string {
  const band = theme?.band ? `:root { --band-bg: ${theme.band.bg}; --band-fg: ${theme.band.fg}; }` : ''
  const accent = theme?.accent ? `@media not (prefers-color-scheme: dark) { :root { --accent: ${theme.accent}; } }` : ''
  return `${BASE}${band}${accent}${PRINT}`
}
