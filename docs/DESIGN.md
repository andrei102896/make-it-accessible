# Output design

How a converted document should look. Research on 2026-10-14 (four parallel passes: restaurant menus, retail weekly ads, price lists and fee schedules, brand theming); sources at the end. Andrei's verdict on the first raw output: "looks chaotic, nobody wants it". The rule since then: correct is not enough, the page must look like something the business would link instead of its PDF.

## Principles
- **Templates chosen, never generated.** A small AI "brief" per document picks the template and its parameters; the renderer stays deterministic, so a template is tested once. What fills it is not: the mapping of conditions to prices, crops, reading order and hidden text are checked on every document (see Checks per document), and no automated check settles accessibility on its own.
- **Show only what the PDF shows.** Words in the text layer that draw nothing (under a shape, a sticker or a cover) are not published. no invented was-prices, percentages, notices or "Free"; the report can point out what is missing (no allergen notice, no unit price), the page never adds it.
- **Brand on identity surfaces only:** title band, section headings, rules, badges, focus ring. Never body text, descriptions, prices or table data.
- **One self-contained file:** system font stacks only, no inlined font; never the PDF's embedded fonts (their licence covers viewing the PDF).
- **The scorer's DOM stays:** `section[data-page]` + `h2`, `.products > li`, `.price` / `.qualifier`, h3–h6, tables, `img[alt]`, `[data-review]`; no CSS `content:` text, no CSS `order` (reading order must match visual order).

## The brief (one model call per document)
Input: a contact sheet of the first pages and the cover. Output, schema-validated:
- `type`: `menu | retail | pricelist | brochure | mixed` (+ per-page type for mixed documents);
- `title`: the business and document name as printed, logo text included ("The Carew Inn · Evening Menu");
- `brand`: which sampled colours are the brand's (background, ink, accent) versus photos; hex values are snapped to the colours sampled at the text and contrast-checked, never taken as given;
- `headings`: the heading type class (old style, transitional, didone, slab, geometric, neo-grotesque, humanist, condensed, script);
- `logo`: page and box, for the title band;
- `validity`: dates printed for offers ("Valid 8–14 Oct");
- `tone`: formal / casual / premium → density and spacing.
The user confirms type and title at upload (one click to correct), as for layout. Accuracy is measured on the corpus (page types and layout labels already exist) before it is trusted. Cost: one small vision call per document, negligible next to page conversion.

## Templates

### Menu
- One h1 (business + menu name), h2 per section in the PDF (rendered h3 under the page marker), dishes as `ul > li`.
- Row: name left, price right on the same baseline, description below in a quieter colour; no dot leaders; column width capped (~40rem) so the price stays near the name; two columns (CSS columns, `break-inside: avoid`) on wide screens, one on phones.
- Prices one way per list: if any amount in the list has pence or cents, all show two decimals; otherwise none ("£1,040" stays whole, "£7,500.00" shows "£7,500"). Tabular figures; not coloured.
- Several prices are labelled ("Small 9 · Large 14"); wine by glass/bottle as a real table.
- Add-ons ("Add 3 king prawns £5") as a smaller indented line under their dish; the amount stays text, not a price element (a key has no price for it).
- Dietary marks: on a menu whose legend is one printed block of "code words" lines, the codes ending a description move to one slot after the dish name as outlined tags (14 px, neutral, a border so they survive forced colours), each read out with the legend's own words (", Gluten Free Option", visually hidden). The legend is repeated once before the first section; the printed one stays. Codes no legend defines stay as printed. US raw/undercooked asterisks kept with their warning.
- A note printed right under a list ("Prices per person, based on two people sharing", "All burgers served with…") stays where the PDF has it, set in 600 weight and tight to the list.
- Photos: none per dish; at most one atmosphere image (the cover photo) in the band. Brochure-like photo pages render as a gallery.
- Sticky section links (Starters · Mains · Sides) on long menus, `scroll-margin-top` so headings are not hidden.
- Type: scale 1.25, body 17–18px, two weights (400/600), heading stack from the brief.

### Retail (weekly ads, leaflets, catalogues)
- Card, in code order: image → name → offer (current price, was price, amount off, unit price) → details and badges. A screen reader hears the name, then the price.
- Cards in one row share their rows (CSS subgrid: picture, name, offer, details), so prices line up across a row without moving the details before the price.
- One dominant price (1.75–2.25 × the name, bold, tabular); was price as visible text ("was £3.00", "statt 9,90 €"), never strikethrough alone; unit price on every card where printed, small but AA (UK Price Marking Order, German PAngV).
- Deals are real text badges in one accent colour ("2 for £5", "Lidl Plus price", an amount off, a short all-caps printed badge such as "AKTION" on a card with a was price); loyalty prices show both prices. Never compute a reduction.
- Grid: cards at least 14rem wide (at most four in the 64rem column), decided by the list's own width (container query), not the viewport; below two columns (29rem) each card is a row with a 6rem picture beside its text.
- Images: square box, `object-fit: contain`, light background. The crop is cut back from every word reaching into its edge (neighbouring price, headline); words well inside are the pack's own. When no cut keeps 40 % of the picture, the model's box stays.
- Navigation: h2 per leaflet section, sticky category chips with counts, validity banner once per page set.

### Price list (fees, tariffs, rates, service lists)
- Semantic tables: caption, `th scope="col"`, the item as `th scope="row"`; unit or VAT basis in the header.
- Money columns right-aligned (header too), tabular figures, same decimals in a column; text columns left; horizontal rules only, a heavier rule under the header, no vertical borders, no zebra.
- Phones: cells never break inside a word ("2026" stays whole), row headers at least 9rem; a table wider than the screen scrolls inside its focusable region (allowed by WCAG reflow), never cards. Leading header rows are a real `thead`. A table without a caption is named by the heading it sits under, so two tables never share a name.
- Long documents: a visible contents list at the top (h2s, one nesting level), "Contents ↑" after each section, a sticky side contents on ≥1024px; notes numbered and placed under their table.
- Page markers carry the PDF's page number ("Page 4" for the PDF's page 4, also in the id); effective dates and a link to the original PDF near the top.
- Type: body 16–19px, scale 1.125–1.15; hierarchy from weight and spacing.

### Brochure / editorial
- Readable text column (60–75ch), headings from the brand class, pull-quotes and cover as the band.
- Pictures keep their printed weight: a lone picture wider than 60 % of the page spans the column (max 40rem), a lone one under 30 % or a decorative one stays small (7.5rem), pictures printed together are tiles (two or more per row, 16 px apart); no grey frame, no forced ratio.

## Theme
- From 1–2 brand colours, a tonal palette (HCT/OKLCH tones) written as static hex in two `:root` blocks (light and dark); dark mode derived, not guessed; when the PDF itself is dark, its polarity is the brand-faithful theme and the other is derived.
- Every text/background pair gated: WCAG 2 ≥ 4.5:1 for all text, text in controls included; 3:1 only for large text and non-text parts (borders, focus ring, icons); APCA Lc logged (≥ 60 body); on a brand fill, black or white text by contrast, never assumed.
- `forced-colors: active` respected; no meaning by colour alone.
- Heading stacks per class (modernfontstacks.com): old style `'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif`; transitional `Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif`; slab `Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', serif`; geometric `Avenir, Montserrat, Corbel, 'URW Gothic', sans-serif`; humanist `Seravek, 'Gill Sans Nova', Ubuntu, Calibri, sans-serif`; neo-grotesque `Inter, Roboto, 'Helvetica Neue', Arial, sans-serif`; script → headings only, else a matching serif. Body: `system-ui`.

## Band and links
- One h1: the brand on its own line (18 px, 600) and the document name (24–32 px), from the brief's "Brand · Name"; a screen reader hears a comma between them. 24 px vertical padding. A contents entry that repeats the title is left out.
- Printed web addresses, e-mails and phone numbers become links (`https://`, `mailto:`, `tel:` with the printed digits only; no country code is added). Inside a sentence they are exempt from the target-size minimum; they get vertical padding and space after them.

## Checks per document
Automated, every conversion: hidden text left out and listed in the report; crops clear of neighbouring text; axe in light and dark at 1280 and 320 px; a keyboard pass (every link and scroll region reached, focus ring visible, nothing under a sticky bar); page markers with the PDF's numbers. Manual, per template and on samples: a screen-reader pass (VoiceOver), conditions read with their prices, links working.

## What reads as cheap or generated (avoid)
Centred everything, a card per dish, dot leaders across a wide screen, emoji or clip-art icons, gradient pills, heavy shadows and large radii, a colour per badge, filler copy, invented percentages, mixed decimals, unlabelled multiple prices, light grey text, ALL-CAPS paragraphs, accordions closed by default (they break Ctrl+F and print), mismatched photos.

## Print
Navigation hidden, one column on white (menus too), a real `thead` repeated on every page, tables not clipped, `break-inside: avoid` on rows, cards and pictures.

## Status (2026-10-14)
Done: menu rows, retail cards (image first, 2 per row, prices pinned to the bottom, deal badges, one column below 360px), gallery, title band, printed whole prices, print basics; the brief (`pnpm adhoc`, Haiku, first 4 pages: type right on 14 of 15 dev/tuning documents, $0.017–0.047 per document, $0.52 for 15); its title kept only where printed in the text layer (it wrote "Eldis" for "Elddis"; since 2026-10-14 each part must be one printed phrase: it also dropped a word); heading class from the PDF's font names first (pdffonts), the brief's guess only when none is known; templates by type (section chips for menus and leaflets, a visible contents list for price lists, contents behind a summary for other long documents); one decimal style per list or table; money cells right-aligned; accent moved in OKLab lightness to pass 4.5:1 on the light and the dark page. Rescores of saved runs: identical scores; axe 0 critical/serious light/dark at 1280 and 320 px on four documents.
Done 2026-10-14 after a critical review of four outputs (a pub menu and a hotel brochure: with fixes; a leaflet page and a price list: not publishable): hidden text not published, crops cleared of neighbouring text, whole amounts per list, tables readable at 320 px, cards on shared rows with a row layout under two columns, links, dietary tags and legend, add-on lines, notes kept with their list, pictures sized as printed, the band, PDF page numbers, headings from h3. Rescores identical; axe 0 critical/serious in light/dark at 1280, 390 and 320 px on four documents; keyboard clean.
Known limits: a big price digit's font box is taller than the glyph, so a crop can lose more than the digit; the empty corner header of a table stays a `th` (minor axe notice) because the scorer reads header rows as rows without `td`; a note printed under a list is not tied to it for screen readers.
Next: labelled multi-prices, unit-price line, QR codes as links, sticky side contents on wide screens, brief on 2 pages to halve its cost.

## Sources
Menus: gramercytavern.com/tavern-menu, balthazarny.com/menus, stjohnrestaurant.com/a/menus/1, dishoom.com/menu, barrafina.com, marksmanpublichouse.com/menus, boia.org (PDF menus), food.gov.uk (allergens, non-pre-packed food), modernfontstacks.com.
Retail: baymard.com (price per unit; list item design; product listing information; mobile product lists), box.zurb.com (two-column mobile layouts), cloudfour.com (sale price markup), a11y-guidelines.orange.com (price vocalization), legislation.gov.uk/uksi/2024/1055, lexmea.de/de/gesetz/pangv/11, smashingmagazine.com (sticky menus), nngroup.com (mobile contents), aldi.co.uk, aldi.us, lidl.co.uk.
Price lists: design-system.service.gov.uk (table, type scale, step-by-step), guidance.publishing.service.gov.uk (tables), components.publishing.service.gov.uk (contents list, back to top), designsystem.digital.gov (table, in-page and side navigation), service-manual.nhs.uk (table), adrianroselli.com (responsive tables, display properties, fixed headers), inclusive-components.design/data-tables, w3.org (WCAG 2.2 reflow, DPUB-ARIA 1.1), westnorthants.gov.uk, barclays.co.uk.
Theme: modernfontstacks.com, adrianroselli.com (WCAG 3 contrast, April 2026), radix-ui.com/colors, github.com/material-foundation/material-color-utilities, github.com/adobe/leonardo, github.com/Myndex/apca-introduction, cloudfour.com (font subsetting).
