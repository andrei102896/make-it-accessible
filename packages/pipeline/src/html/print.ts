import type { Extraction } from '../pdf/types.ts'
import type { Strings } from './strings.ts'

// The printed view's switch and sheet, fitted to the window while its body text reads at MIN_FIT_PX or more (pinch to
// read closer); MIN_BODY_PX sets the width fitting and checks measure at. Below, in forced colours, in print and
// with "Text only", the reflowed page shows. Andrei, 2026-10-18: large sheets printed, not reflowed (Bud & Alley's).
const MIN_BODY_PX = 12
// Cmd+ zoom reaches the reflowed page within one or two steps from a 1440 px window (design critic, 2026-10-18).
const MIN_FIT_PX = 7
// Phones and narrow tablets keep the reflowed page whatever the print's size; main's side padding (2 × 1rem).
const MIN_PRINT_PX = 768
export const GUTTER_PX = 32

// The narrowest viewport (CSS px) that shows the body text of every page with a backdrop at MIN_BODY_PX, the body
// being the size most letters are set in (a page without words, a cover picture, needs none); null without one.
// A page without a backdrop (it failed to render or to fit) keeps the text view among printed ones.
export function printWidth(pages: readonly { extraction: Extraction; backdrop?: unknown }[]): number | null {
  const widths = pages.flatMap(({ extraction: e, backdrop }) => {
    if (!backdrop) return []
    const hidden = new Set(e.hidden)
    const tally = new Map<number, number>()
    for (const r of e.runs)
      if (r.font && !hidden.has(r.id)) tally.set(r.font.size, (tally.get(r.font.size) ?? 0) + r.str.length)
    const body = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0]
    return body ? [(MIN_BODY_PX * e.width) / body] : []
  })
  return widths.length ? Math.ceil(Math.max(MIN_PRINT_PX, ...widths) + GUTTER_PX) : null
}

// The narrowest window (CSS px) the printed view of a document `width` wide (printWidth) shows in.
export const printFloor = (width: number): number =>
  Math.ceil(Math.max(MIN_PRINT_PX, ((width - GUTTER_PX) * MIN_FIT_PX) / MIN_BODY_PX) + GUTTER_PX)

export const viewSwitch = (ui: Strings): string =>
  `<fieldset class="view"><legend>${ui.view}</legend><label><input type="radio" name="view" id="view-print" checked> ${ui.printed}</label><label><input type="radio" name="view" id="view-text"> ${ui.textOnly}</label></fieldset>`

const SR_ONLY =
  'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;'
// fit.ts: `--k`, `--z` narrow, then shrink, a lookalike to its printed width, `--lx` spreads a narrow one (the box
// grows by one `--ls`, which follows the last letter), `--ti` starts a one-line row on its printed edge (rows.ts).
// `on`'s id outranks the brand's classes: their layout stays out.
const on = 'body:has(#view-print:checked)'
export const SHEET = 'section[data-page][style*="--ar:"]'
const printed = SHEET
const lead = `.lead:has(> ${printed})`
const page = `:is(${printed}, ${lead} > header.masthead)`
// Containers keep no box of their own; their loose text (a comma between two prices) is read, not shown.
const leaf = '[style*="--x:"]'

// The printed view's width (printWidth) and its floor in a rendered page (`main`'s width and the media query
// below); 0 when the page has none.
export const printWidthIn = (html: string): number =>
  Number(/main \{ max-width: max\(64rem, (\d+)px\); \}/.exec(html)?.[1] ?? 0)
export const printFloorIn = (html: string): number =>
  Number(/@media screen and \(min-width: (\d+)px\) and \(forced-colors: none\)/.exec(html)?.[1] ?? 0)

// A word in another brand ink takes `--ink-*` from its own placed line where it reads (placed.ts), else the line's
// colour: no placed text holds another, so the variable never comes from an outer one.
export const printCss = (width: number, inks: readonly string[]): string => `
.view, .backdrop { display: none; }
@media screen and (min-width: ${String(printFloor(width))}px) and (forced-colors: none) {
.view { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .25rem 1.25rem; align-items: center; border: 0;
  margin: 0 0 .5rem; padding: 0; font-size: .875rem; color: var(--muted); }
.view legend { float: left; font-weight: 500; padding: 0; }
.view label { display: inline-flex; gap: .4rem; align-items: center; min-height: 44px; cursor: pointer; }
${on} .back:not(:focus-within), ${on} nav.toc:not(:focus-within), ${on} nav.chips:not(:focus-within) { ${SR_ONLY} }
${on} main { max-width: max(64rem, ${String(width)}px); }
${on} ${lead} { display: grid; grid-template-columns: minmax(0, 1fr); }
${on} ${lead} > nav { grid-row: 1; } ${on} ${lead} > .legend { grid-row: 2; } ${on} ${lead} > .back { grid-row: 4; }
${on} ${lead} > header.masthead, ${on} ${lead} > section { grid-row: 3; grid-column: 1; }
${on} ${page} { position: relative; container-type: inline-size; margin: 0 0 2rem; padding: 0; border: 0;
  background: none; box-shadow: none; text-align: left; }
${on} ${printed} { aspect-ratio: var(--ar); }
${on} ${lead} > header.masthead { z-index: 1; pointer-events: none; align-self: start; }
${on} ${printed} > h2, ${on} [data-free], ${on} ${page} img:not(.backdrop, ${leaf}) { ${SR_ONLY} }
${on} .backdrop { display: block; position: absolute; inset: 0; width: 100%; height: 100%; }
${on} ${page} :is(ul, ol, li, div, p, figure):not(${leaf}, ${leaf} *) { display: block; margin: 0; padding: 0;
  border: 0; background: none; box-shadow: none; columns: auto; font-size: 0; }
${on} ${page} *::before, ${on} ${page} *::after { content: none; }
${on} ${page} [data-pl] { position: static; transform: none; margin: 0; padding: 0; border: 0; background: none;
  font-size: 0; }
${on} ${page} :is(div, ul)[data-frame] { position: absolute; left: calc(var(--tx) * 1cqw); top: calc(var(--ty) * 1cqw);
  width: calc(var(--tw) * 1cqw); height: calc(var(--th) * 1cqw); overflow: visible; }
${on} ${page} [data-frame] :is(table, caption, thead, tbody, tr, th, td) { border: 0; padding: 0; background: none;
  font-size: 0; }
${on} ${page} ${leaf} { position: absolute; left: calc((var(--x) - var(--tx, 0)) * 1cqw);
  top: calc((var(--y) - var(--ty, 0) + var(--dy, 0)) * 1cqw);
  width: calc(var(--w) / var(--k, 1) * 1cqw + var(--ls, 0) * 1em + var(--lx, 0) * 1cqw); transform: scaleX(var(--k, 1)); transform-origin: left top;
  display: block; margin: 0; padding: 0; border: 0; background: none; box-shadow: none; list-style: none; max-width: none;
  font-size: calc(var(--fs, var(--h)) * var(--z, 1) * 1cqw); line-height: calc(var(--lh, var(--h)) * 1cqw);
  white-space: var(--ws, normal); text-align: var(--ta, left); color: var(--c, inherit); font-weight: var(--fw, 400); font-style: var(--fi, normal);
  text-shadow: var(--ts, none); -webkit-text-stroke: var(--st, 0 transparent); paint-order: stroke fill;
  letter-spacing: calc(var(--ls, 0) * 1em + var(--lx, 0) * 1cqw); font-size-adjust: none; }
${on} ${page} ${leaf}[style*="--ti:"] { text-align: left; text-indent: calc(var(--ti) * 1cqw); }
${on} ${page} [style*="--ff:"] { font-family: var(--ff); font-synthesis: small-caps; }
${on} ${page} [style*="--ff:'pdf-"] { font-variant-caps: normal; }
${on} ${page} ${leaf} * { color: inherit; white-space: inherit; font-weight: inherit; font-style: inherit; }
${on} ${page} ${leaf} .face { font-weight: var(--fw); font-style: var(--fi); }
${on} ${page} ${leaf} a { display: inline; padding: 0; margin: 0; text-decoration: underline; text-underline-offset: .12em; }
${on} ${page} ${leaf} .icon { display: inline-block; width: calc(var(--iw) * 1cqw); height: 1px; border: 0; padding: 0;
  margin: 0; vertical-align: baseline; font-size: inherit; line-height: inherit; }
${on} ${page} ${leaf} .icon > span { ${SR_ONLY} }
${on} ${page} img${leaf} { height: calc(var(--h) * 1cqw); opacity: 0; }
${inks.map((c) => `${on} ${page} ${leaf} .ink-${c.slice(1)} { color: var(--ink-${c.slice(1)}, inherit); }\n`).join('')}}
`
