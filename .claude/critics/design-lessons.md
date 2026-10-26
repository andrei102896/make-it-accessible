# Design lessons (curated; newest last within a theme; merge duplicates)

Curated 2026-10-24 from 102 entries: superseded ones (stand-in faces and fit in the printed view, halos, backdrop
cleaning) dropped, cross-project ones moved to `~/.claude/skills/project-init/references/common-rules.md`. The full
list is in git history.

## What the owner judges
- Owners judge the page by its resemblance to their PDF: colours, fonts, hierarchy, structure and density come from the PDF as truthfully as possible; accessibility only corrects (contrast, size, reflow), never replaces the identity. (Kendells, Andrei, 2026-10-15)
- Correctness is the original PDF beside our page: every change is judged on PDF, before and after for each page it touches, never from our own render alone. (Andrei, 2026-10-17)
- Look for the design's subtleties and name each one the page lacks: ornaments under titles, arrow ends, boxed lines, icons, textured or coloured panels. (Kendells title ornament, 2026-10-15)
- What we cannot draw faithfully stays printed (a signature, a stamp at an angle, a handwritten note): ours is read, not shown. (Fig, 2026-10-18)

## Content as printed
- Content only from the PDF: never reword or reorder, no CSS-generated text; a currency sign only where the page prints one; whole amounts per list accepted. Only text that reads as printed, word for word and in order, can be confirmed. (2026-10-15…22)
- The page shows the printed case: a case-insensitive check hides re-cased headings. (Almond "Raw Bar", 2026-10-16)
- US menus print bare numbers, "MP", "22/32", "18.9": the menu's own prices, shown as printed. Widening "as printed" widens what passes as a price: dates and portion sizes need guards. (2026-10-16)
- A price label's position is printed ("3.5 ea" vs "Half Dozen 20"); price placement (inline or right-aligned) is measured, never templated; a price cited twice for one dish shows twice. (Noah's, Carmine's, Gargiulo's, 2026-10-16)
- A mark fused to a price renders as its unfused siblings do; a new printed-as-is pattern covers every variant the set prints, or siblings split between freed and held. (Rucola "$39/", 2026-10-24)
- An amount accounts for every digit its words print; count changes in shown text, not only wrong amounts (".00" lists turning whole); freeing a hold publishes the whole row: read every field in order. (Bernie's "5 for", 2026-10-24)

## Structure
- The header is wherever the title is printed; it stands before our navigation; a title's scale is its own; a page title above real sections hands the chips to its children. (Moosewood, Prohibition, Carmine's, Gargiulo, 2026-10-16)
- Sections side by side are a grid, an article across columns is multicol, one page can need both; a rule crossing a band between sections is a row break; a rule under a heading belongs to it. (Prohibition, Rucola, Kendells, 2026-10-16)
- A box's membership is per block, not per section; a frame may be raster (check the layer before planning it); a note naming its own heading prices every list under it. (Frankie's, Almond, Kendells)
- "One dish per line" is a row shape, not a column count; a row of labelled prices wraps on a phone, nowrap per price with its label, the price column capped. (Noah's, Carmine's, Ridgway, 2026-10-16)

## Colour and contrast
- Brand colours drawn in small areas come from the text roles, not area sampling; a colour that passes only after a large lightness move stops being the brand (use the other brand colour); near-black with a little chroma is black. (Kendells, BILLA, Carmine's)
- An inline colour made readable never falls through to the document's other brand colour; a line's ink is that of its unmarked words; the text layer's colour can sit on the wrong letters, so a word's colour comes from its drawn glyph. (Almond, Gigi, Kenny & Ziggy's, 2026-10-16…18)
- A PDF's shadow or outline is its own contrast aid (WCAG counts an outline as the boundary); a ground is read from the cells under the letters' bodies, never the whole box. (Bannatyne, La Segunda, Howies, 2026-10-17…18)
- A decision from a measured grid needs a margin wider than the raster's drift (none needed today: drift 0.001); a guard against something vanishing from the print cannot lean on a check that reads another renderer (printedReads reads Poppler's inks). (2026-10-24)

## The printed view
- The printed view shows the print (pdf.js), our text transparent boxes at the printed lines: transparent text is still read under the pointer (Hover Text) and shows in find highlights and rich paste, so misplaced boxes mislead. (2026-10-23)
- A raster's promised scale is not its achieved scale: count fallback pages before relying on it; a viewport-width threshold misses text-only zoom: write the floor in em. (Le Dive, 2026-10-23)
- Clipping invisible text: `overflow: clip`, never `hidden` (find and focus scroll it); a clip on a focusable's parent clips its ring (draw it on the clipped box); a gate deleted for a clip gets a measure (clipped boxes and prices). (slice 3, 2026-10-23)
- A leaf whose words sit apart is placed line by line; placed text that collides is misinformation, measured and sent to the text view. (Carmine's, 2026-10-17)
- An icon printed inside a condition belongs where it is printed; an icon in the vectors may draw nothing (test its ink); merged pieces lose their legend name; a word cited "by position" may stand for an unnamed printed mark. (Howies, 2026-10-18…22)
- What a diner hears is checked against the PDF render, never our printed view; the placed view shows every condition line the text view has. (Howies fries, 2026-10-22)
- A reference drawn by the same code as the output shares its bugs (fidelity and review shots agreed with Cattlemen's empty panels); pdf.js loses soft masks when its defs are cleared; an OffscreenCanvas ignores url() filters and aliases hairlines. (2026-10-24)
- Compare backdrops at the resolution the drift was measured at: 40 pt blocks would hide 17 % of dropped prices that 8 pt cells catch. (2026-10-24)

## Text view type
- A display face's clamp minimum is the display threshold; a stand-in matches the printed face's genre, not only its class; a brand face's x-height decides its size (font-size-adjust per face). (Great Vibes, Kalam, Josefin, 2026-10-15…16)
- One face per role reproduces print only when style changes at role boundaries: a style change inside a line needs a silent span; fixing style data can flip a role's dominant face (count per page before and after). (Le Dive, 2026-10-23)
- A computed `font-style` proves nothing: check the face drawn (an italic role with no italic file draws upright; Chrome synthesises italic, not an oblique angle); a font budget is zero-sum, diff the files that leave. (Howies notes, Carmine's, 2026-10-23)

## Reports
- A measurement report keeps every signal the old logs showed and lists the worst first, each set apart. (measure plan, 2026-10-22)
- out/rebuilt holds the sealed documents: drop every verify-sealed slug before grepping it, report sealed only as totals. (four sealed menus named, 2026-10-24)
- A light fill keeps every colour the page draws, each moved on its own (one ink for a whole box only on dark fills: Howies' gold, Scotts' green); share and colour come from real pixels, not a histogram bucket's centre (Carew); a ground every page shares is the document's, one in a panel's colour the panels' (Gigi, step 4a–4b, 2026-10-24).
- A heading on a box's edge sits on the ground it is printed on: on the fill (a tab) inside, above it on the page; pulled out onto the page ground it must not take the box's colours (Katzinger's SALADS, Exeter's Bar Snacks, 2026-10-24).
- Pick the focus colour per ground for its own 3:1: a mid-tone ground fails both palettes' rings (Stonehouse #a45a41: 1.31 and 2.48, 2026-10-24).
- A shared-text exemption is scoped by where the shared word is printed (one block; on all or none of the sharers' lines), never by field kind alone; a finding for an approver names the dishes and quotes what we show (Scotts' olives with the fries' price; "blocks[18]…", double-cite rule, 2026-10-25).
- A new price mark needs a sign or cents like its siblings: a bare number with a mark ("21+", "Serves 4+") is an age, count or size; prices whose only meaning is punctuation ("+", "/") are checked by ear, where "from" and "for" may disappear (Voci, Holiday Market, 2026-10-26).
- A disagreement between two readers has three causes (reader A, reader B, the placement between them): sort them against the PDF before re-asking either; re-asking one until it agrees with the other turns the second into a selector, so a value that changes on retry is a doubt, never a proof (Durant's, scan re-ask plan, 2026-10-26).
- A hint from the reader being checked may rank or hold, never pass: trust the model's area only where an independent reading (OCR's name) falls inside it, widened by a printed line, never a share of its own size (scan areas, 2026-10-26).
