# Layout fidelity (brand v2) — plan after two critic rounds (2026-10-16)

## Why (Andrei, 2026-10-16, reviewing the 19 NY/FL pages)
"The HTML loses the PDF's whole personality": sections stacked where the PDF prints 3 columns in red frames (Carmine's), a newspaper page rendered as an article (Prohibition Post), the title "almost always big, we make it tiny", fonts that do not match, a horizontal scrollbar in the section chips. Review stopped until the design is right. Two process asks: the model that describes how to build the page must give key facts; a reviewer must validate the built page against the PDF before it goes out.

## Measured on the 19 menus
- Columns: 16 of 19 print their sections in 2–4 columns (Carmine's 3, Almond and Pastabilities 4, Sarge's 3–4); heading x-centres cluster cleanly at 12% of the page width.
- Fonts: none of the printed families is in our 5-family library. DIN Pro in 7 menus (116 fontspecs), Gotham 4, Minion 4, Garamond/AGaramond 5, Bodoni (BT/MT/FLF) 5, Avenir Next, Myriad, Calibri, Arial, Cambria, Noto Sans, IBM Plex, Roboto Condensed, Great Vibes, Arizonia (the last two are Google fonts themselves). Small-caps faces (BodoniBT-Bold-SC700) give a garbage text-layer case ("MEatball app"); fixed today: printed case wins only when it is one a designer could set.
- Title/header: in 11 of 19 the name is a logo image (first block = figure); where it is text it is 2–7.4× the body (Prohibition Kitchen 81 pt on 11 pt body). Our heading scale compresses everything into [floor, 2.4rem], so a masthead renders at section-heading size; a logo renders as a small figure (fig-s/fig-m).
- Frames: Carmine's boxes every section (red frame, heading breaking the top border); Bud & Alley's, Noah's, Almond, Jack's have boxed or panelled sections too (brief "box"/"panel" details: 14 across the batch).
- Chips: horizontal scroller shows a scrollbar on desktop when the chips exceed the content width (Carmine's 12 sections), which Andrei rejects outright.
- Colours: Carmine's sub-headings render blue-ish where the PDF prints red (to check: accent/alternate choice or contrast move).

## Segments
Header (title text or logo, tagline, address, running head), content (sections in printed columns), footer (notices, advisories, small print): found by geometry on each page before any template; rules below.


## Rules, revised
- **Gate:** every new layout feature renders only with `doc.brand`; a test proves a no-brand render is byte-identical to today's (stage-0 rescores untouched; the scorer reads `section[data-page]`, which keeps the title and footer where they are today when brand is null).
- **Columns:** cluster each section by its **list x-range** (union of cited runs), not by heading centres (headings are left-aligned at varying widths or centred over several lists). Vertical bands: a section wider than 60% of the page is a full-width row; consecutive narrow sections with disjoint ranges form one `.cols` group (grid, ≤ 4). A heading wider than 1.5 columns spans. A running article across columns (Prohibition Post) is CSS multicol on its paragraphs, the one place multicol is right. Content `max-width` grows to 80rem when a page prints ≥ 3 columns. `SAME_COLUMN` shared with eval/brand.ts. The model's block order is already column by column: the DOM order barely changes.
- **Price placement is measured:** a price whose box starts within 1.5em of the name/description end and not at the column's right edge is inline after the name (600 weight); otherwise right-aligned.
- **Header:** title-like blocks (text ≥ 2× body, or a logo figure) whose top lies in the top 12% of page 1, at any x; alignment as printed. The masthead logo is exempt from the running-figure demotion (first occurrence keeps alt and size); image boxes converted from fitScale pixels to points before comparing. A later page whose first block is text ≥ 3× body gets that text as its page heading (newspaper masthead). The band h1 is sr-only whenever the header shows the name.
- **Title scale:** the masthead heading is marked from `look.title` (passed into `documentBrand`), excluded from the signature compression, sized `clamp(2rem, 11vw, 4.5rem)` with `overflow-wrap: break-word; hyphens: manual`.
- **Footer:** blocks after the last list on the last page within the bottom 15%, and page-bottom advisories printed smaller than body: small muted print after the sections, never inside a column or frame.
- **Frames and panels:** new primitive `lineLeftOf` (walk left from the heading on its mid row with `runThrough`), the heading may break the top border; a filled rectangle behind heading + list is a section panel; text contrast-checked; forced colours give the heading `background: Canvas`. Kept in lines.json (version 3) per heading key; columns, header and footer are pure functions of saved files and never cached.
- **Inline brand colour:** coloured runs inside a role (Carmine's red sub-heading, Almond's red farm names) keep their measured colour, moved to 4.5:1; the role colour is the dominant one only.
- **Fonts:** budget from measured files (Google latin woff2 is 35–50 KB, Inter 73): 5 files / 220 KB raw; DESIGN.md updated with it. Lookalikes by run tally: DIN → Barlow (+ Condensed), Gotham/Baufra/Novecento → Montserrat, Minion → Crimson Pro, Garamond/AGaramond/GaramondClassic → EB Garamond, Bodoni (BT/MT/FLF) → Bodoni Moda, Avenir → Nunito Sans, Myriad → PT Sans, Helvetica Neue → Arimo, Beton → Zilla Slab, Neutra → Jost, Inkwell/casual script → Caveat, formal script → Great Vibes, plus Carlito, Tinos, Caladea, Noto Sans, IBM Plex Sans, Roboto Condensed, Arizonia. `named()` learns compound keys (agaramondpro, avenirnext, helveticaneue, bodoniflf, garamondclassicfs, timesnewromanpsmt), with tests. Original family first in the stack. Tracking: letter-spacing measured per heading/name role in em, cap 0.12em, dropped below 25rem.
- **Small caps:** pdftohtml strips "SC700" from the family, so a role whose runs fail `caseReliable` is a small-caps face → `font-variant-caps: small-caps` with `font-synthesis: small-caps` on that role (the page sets `font-synthesis: none`, which would otherwise suppress it).
- **Chips:** wrap always, never scroll. Sticky only at ≥ 60rem when the labels total ≤ 90 characters; otherwise static with "Sections ↑" after every page section. Below 40rem with more than 8 chips: `<details>Sections (N)</details>` (navigation, so the accordion rule does not apply).
- **Dietary codes:** legend "(V) VEGAN" form, codes on their own line or before the name, orphan commas dropped, the icon word read from the image shown as a tag.
- **Brief:** no measured facts fed back (it runs before the brand and gives it the background); only an optional `character` line (`.optional().catch(null)`) logged in the report. `details` already carries boxes and panels.
- **AI reviewer:** screenshots per `section[data-page]` beside that PDF page's render, at 1280 and 390; categories layout, type, colour, missing element, text (case, orphan punctuation, truncated headings); severity major/minor; one verdict; `review.json`; a major blocks the send list. Runs from the Andrei checkpoint on.
- **Bugs found by the critics, fixed in their slices:** an ornament crop must reject any crop overlapping a word box (Carmine's "IMPORT" → "PORT" with a ghost ornament); two-column price lists (Carmine's sides, desserts, beer; Almond plats du jour) render as lists, not tables with vertical borders and 28px prices; "ea," orphan comma; the "1 CHECK FOR PARTIES" footer inside the Hand Helds box.

## Files
`html/document.ts` is at 293/300 lines and `document.test.ts` at 313 physical: split first (`html/page.ts` takes `renderPage`; new pure `html/layout.ts` + `layout.test.ts` for segmentation, bands, price placement, masthead key; new renderer tests in `document-layout.test.ts`).

## Order and estimate (~5.5 days)
1. Chips without scroll (0.2 d) — the hard "never".
2. Split document.ts; header, footer, title scale, masthead logo (1 d).
3. Columns by list bands, spans, article multicol, price placement, content width (1.5 d).
4. AI reviewer (0.5 d) — then the Andrei checkpoint on Carmine's, Prohibition, Almond, Moosewood, Noah's.
5. Inline brand colour, two-column lists as lists, ornament crop guard (0.5 d).
6. Fonts: library, lookalikes, compound keys, small caps, tracking, budget (0.7 d).
7. Frames and panels (1 d).
8. Dietary codes, brief `character` (0.4 d).
Each slice: plan check → tests → `pnpm check` → rescores identical → check:pages on the 5 references + 19 menus → reviewer on the menus.
