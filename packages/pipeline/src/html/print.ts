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
// main's least width in the printed view (`max(64rem, printWidth)`), 1rem being 16 px.
const MAIN_MIN_PX = 64 * 16
// A retina screen's two device pixels per CSS pixel at the widest sheet, within this many pixels a page (a large
// sheet's file then stays near 1 MB in WebP; Sarge's 2640 x 4080 measured 668 KB).
const DEVICE_PX = 2
const MAX_BACKDROP_PX = 12_000_000
// Past this density (a retina screen zoomed beyond 125 %) the backdrop's letters blur: the text view shows.
const MAX_DPPX = 2.5

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

// Pixels per point the backdrop of a page `width` (printWidth) is drawn at.
export function backdropScale(width: number, page: { width: number; height: number }): number {
  const sheet = Math.max(MAIN_MIN_PX, width) - GUTTER_PX
  return Math.min((DEVICE_PX * sheet) / page.width, Math.sqrt(MAX_BACKDROP_PX / (page.width * page.height)))
}

// The narrowest window (CSS px) the printed view of a document `width` wide (printWidth) shows in.
export const printFloor = (width: number): number =>
  Math.ceil(Math.max(MIN_PRINT_PX, ((width - GUTTER_PX) * MIN_FIT_PX) / MIN_BODY_PX) + GUTTER_PX)

// A segmented control over the radios, which keep the keyboard (arrows) and the screen reader's group.
const PAGE_ICON =
  '<svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18"><rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h4"/></svg>'
const TEXT_ICON =
  '<svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18"><path d="M3 5h14M3 10h14M3 15h9"/></svg>'
export const viewSwitch = (ui: Strings): string =>
  `<fieldset class="view"><legend>${ui.view}</legend><div class="seg"><label><input type="radio" name="view" id="view-print" checked>${PAGE_ICON}${ui.printed}</label><label><input type="radio" name="view" id="view-text">${TEXT_ICON}${ui.textOnly}</label></div></fieldset>`

const SR_ONLY =
  'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;'
// `on`'s id outranks the brand's classes: their layout stays out.
// A page the browser translated shows the text view: the print would stand untranslated over the words read.
const on = ':root:not([class*="translated-"]) body:has(#view-print:checked)'
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
  Number(/@media screen and \(min-width: ([\d.]+)em\)/.exec(html)?.[1] ?? 0) * 16

// A sign added for reading (page.ts) is 1 px and transparent: VoiceOver skips text at size 0, and its inherited
// line height is a length, not ems.
export const printCss = (width: number): string => `
.view, .backdrop { display: none; }
@media screen and (min-width: ${String(printFloor(width) / 16)}em) and (forced-colors: none) and (max-resolution: ${String(MAX_DPPX)}dppx) {
:root:not([class*="translated-"]) .view { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem 1rem; align-items: center; border: 0;
  margin: 0 0 .5rem; padding: 0; font-size: 1rem; color: var(--fg); }
.view legend { float: left; font-weight: 600; padding: 0; }
/* Its own colours, not the brand's: 4.5:1 on any menu ground (a tinted one took the selected text to 2.9:1). */
.view .seg { display: inline-flex; border: 1px solid #c4c4c4; border-radius: .5rem; background: #ffffff; color: #1a1a1a; }
.view label { display: inline-flex; gap: .5rem; align-items: center; min-height: 44px; padding: 0 1rem; cursor: pointer;
  border: 1px solid transparent; margin: -1px; font-weight: 500; }
.view label:first-child { border-start-start-radius: .5rem; border-end-start-radius: .5rem; }
.view label:last-child { border-start-end-radius: .5rem; border-end-end-radius: .5rem; }
.view label:has(:checked) { color: #1d4ed8; border-color: #1d4ed8; background: #eef2ff; position: relative; }
.view label:has(:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; position: relative; }
.view input { ${SR_ONLY} }
.view svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
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
/* Each leaf an invisible box at its printed rectangle (the PDF's word boxes, the same on every OS): its words at their
   printed size in the page's face, clipped to it, never a scroll container (find and focus would scroll them off
   the print); no spacing of the text view's (a tracked heading) moves them. */
${on} ${page} ${leaf} { position: absolute; left: calc((var(--x) - var(--tx, 0)) * 1cqw); top: calc((var(--y) - var(--ty, 0)) * 1cqw);
  width: calc(var(--w) * 1cqw); height: calc(var(--h) * 1cqw); overflow: clip;
  display: block; margin: 0; padding: 0; border: 0; background: none; box-shadow: none; list-style: none; max-width: none;
  font-size: calc(var(--fs, var(--h)) * 1cqw); line-height: calc(var(--lh, var(--h)) * 1cqw); white-space: var(--ws, normal);
  text-align: var(--ta, left); color: transparent; letter-spacing: 0; word-spacing: 0; text-indent: 0; font-size-adjust: none; }
${on} ${page} ${leaf} * { color: inherit; white-space: inherit; }
/* The print shows its own letters (the backdrop); ours are read, selected and found over them, never seen. */
${on} ${page} ${leaf}::selection, ${on} ${page} ${leaf} *::selection { color: transparent; }
/* A link's ring on its clipped box, which would cut one drawn round the link (WCAG 2.4.7). */
${on} ${page} ${leaf}:has(:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }
${on} ${page} ${leaf} :focus-visible { outline: none; box-shadow: none; }
${on} ${page} ${leaf} .sign { font-size: 1px; line-height: 0; }
/* A link is the print's own words: nothing drawn over them (Andrei on Brawn's www.brawn.co, 2026-10-23). */
${on} ${page} ${leaf} a { display: inline; padding: 0; margin: 0; text-decoration: none; }
${on} ${page} ${leaf} .icon { display: inline-block; width: calc(var(--iw) * 1cqw); height: 1px; border: 0; padding: 0;
  margin: 0; vertical-align: baseline; font-size: inherit; line-height: inherit; }
${on} ${page} ${leaf} .icon > span { ${SR_ONLY} }
${on} ${page} img${leaf} { opacity: 0; }
}
`
