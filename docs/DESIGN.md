# Output design

How a converted document should look. Research on 2026-10-14 (four parallel passes: restaurant menus, retail weekly ads, price lists and fee schedules, brand theming); sources at the end. Andrei's verdict on the first raw output: "looks chaotic, nobody wants it". The rule since then: correct is not enough, the page must look like something the business would link instead of its PDF.

## Principles
- **Templates chosen, never generated.** A small AI "brief" per document picks the template and its parameters; the renderer stays deterministic, so prices, structure, WCAG and scores are proven once per template, not per document.
- **Show only what the PDF prints.** No invented was-prices, percentages, notices or "Free"; the report can point out what is missing (no allergen notice, no unit price), the page never adds it.
- **Brand on identity surfaces only:** title band, section headings, rules, badges, focus ring. Never body text, descriptions, prices or table data.
- **One self-contained file:** system font stacks; at most one open-licensed font inlined (Latin subset of the document's glyphs, ~15–35 KB); never the PDF's embedded fonts (their licence covers viewing the PDF).
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
- Prices one way per list: if any price in the list has decimals, all show two; otherwise whole. Tabular figures; not coloured.
- Several prices are labelled ("Small 9 · Large 14"); wine by glass/bottle as a real table.
- Add-ons ("Add 3 king prawns £5") as a smaller indented line under their dish.
- Dietary marks (V, VE, GF, GFO) as visible short text tags with the full word for screen readers (visually hidden), the legend near the top and at the end; US raw/undercooked asterisks kept with their warning.
- Photos: none per dish; at most one atmosphere image (the cover photo) in the band. Brochure-like photo pages render as a gallery.
- Sticky section links (Starters · Mains · Sides) on long menus, `scroll-margin-top` so headings are not hidden.
- Type: scale 1.25, body 17–18px, two weights (400/600), heading stack from the brief.

### Retail (weekly ads, leaflets, catalogues)
- Card, in code order: image → name (brand separate when printed) → size → price → condition (multi-buy, loyalty) → was price → unit price → card-level limits. The image sits on top visually and in code, so a screen reader hears the name before the price.
- Same fields in the same order on every card; price block pinned to the bottom so prices align across a row.
- One dominant price (1.75–2.25 × the name, bold, tabular); was price as visible text ("was £3.00", "statt 9,90 €"), never strikethrough alone; unit price on every card where printed, small but AA (UK Price Marking Order, German PAngV).
- Deals are real text badges in one accent colour ("2 for £5", "Lidl Plus price"); loyalty prices show both prices. Never compute a reduction.
- Grid: 2 columns from ~360px, 4–5 on desktop (max ~1280px); below 360px or at 200% zoom, a row layout (image left).
- Images: square box, `object-fit: contain`, light background, no crop of the product, no upscaling beyond 2×.
- Navigation: h2 per leaflet section, sticky category chips with counts, validity banner once per page set.

### Price list (fees, tariffs, rates, service lists)
- Semantic tables: caption, `th scope="col"`, the item as `th scope="row"`; unit or VAT basis in the header.
- Money columns right-aligned (header too), tabular figures, same decimals in a column; text columns left; horizontal rules only, a heavier rule under the header, no vertical borders, no zebra.
- Phones: tables of 2–3 columns fit at 320px; wider ones in a focusable scroll region; never cards.
- Long documents: a visible contents list at the top (h2s, one nesting level), "Contents ↑" after each section, a sticky side contents on ≥1024px; notes numbered and placed under their table.
- Page markers mapping the PDF ("PDF p. 12", linkable); effective dates and a link to the original PDF near the top.
- Type: body 16–19px, scale 1.125–1.15; hierarchy from weight and spacing.

### Brochure / editorial
- Readable text column (60–75ch), headings from the brand class, photos as a gallery (`contain`, consistent tiles), pull-quotes and cover as the band.

## Theme
- From 1–2 brand colours, a tonal palette (HCT/OKLCH tones) written as static hex in two `:root` blocks (light and dark); dark mode derived, not guessed; when the PDF itself is dark, its polarity is the brand-faithful theme and the other is derived.
- Every text/background pair gated: WCAG 2 ≥ 4.5:1 body, ≥ 3:1 large and UI; APCA Lc logged (≥ 60 body); on a brand fill, black or white text by contrast, never assumed.
- `forced-colors: active` respected; no meaning by colour alone.
- Heading stacks per class (modernfontstacks.com): old style `'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif`; transitional `Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif`; slab `Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', serif`; geometric `Avenir, Montserrat, Corbel, 'URW Gothic', sans-serif`; humanist `Seravek, 'Gill Sans Nova', Ubuntu, Calibri, sans-serif`; neo-grotesque `Inter, Roboto, 'Helvetica Neue', Arial, sans-serif`; script → headings only, else a matching serif. Body: `system-ui`.

## What reads as cheap or generated (avoid)
Centred everything, a card per dish, dot leaders across a wide screen, emoji or clip-art icons, gradient pills, heavy shadows and large radii, a colour per badge, filler copy, invented percentages, mixed decimals, unlabelled multiple prices, light grey text, ALL-CAPS paragraphs, accordions closed by default (they break Ctrl+F and print), mismatched photos.

## Print
Navigation hidden, one column on white, `thead` repeated, `break-inside: avoid` on rows, cards and sections, `break-after: avoid` on headings, URLs printed after links.

## Status (2026-10-14)
Done: menu rows, retail cards (image first, 2 per row, prices pinned to the bottom, deal badges, one column below 360px), gallery, title band, printed whole prices, print basics; the brief (`pnpm adhoc`, Haiku, first 4 pages: type right on 14 of 15 dev/tuning documents, $0.017–0.047 per document, $0.52 for 15); its title kept only for words printed in the text layer (it wrote "Eldis" for "Elddis"); heading class from the PDF's font names first (pdffonts), the brief's guess only when none is known; templates by type (section chips for menus and leaflets, a visible contents list for price lists, contents behind a summary for other long documents); one decimal style per list or table; money cells right-aligned; accent moved in OKLab lightness to pass 4.5:1 on the light and the dark page. Rescores of saved runs: identical scores; axe 0 critical/serious light/dark at 1280 and 320 px on four documents.
Next: dietary tags with their legend, add-on lines, labelled multi-prices, unit-price line, page markers as "PDF p.", sticky side contents on wide screens, one inlined font where no stack fits, brief on 2 pages to halve its cost.

## Sources
Menus: gramercytavern.com/tavern-menu, balthazarny.com/menus, stjohnrestaurant.com/a/menus/1, dishoom.com/menu, barrafina.com, marksmanpublichouse.com/menus, boia.org (PDF menus), food.gov.uk (allergens, non-pre-packed food), modernfontstacks.com.
Retail: baymard.com (price per unit; list item design; product listing information; mobile product lists), box.zurb.com (two-column mobile layouts), cloudfour.com (sale price markup), a11y-guidelines.orange.com (price vocalization), legislation.gov.uk/uksi/2024/1055, lexmea.de/de/gesetz/pangv/11, smashingmagazine.com (sticky menus), nngroup.com (mobile contents), aldi.co.uk, aldi.us, lidl.co.uk.
Price lists: design-system.service.gov.uk (table, type scale, step-by-step), guidance.publishing.service.gov.uk (tables), components.publishing.service.gov.uk (contents list, back to top), designsystem.digital.gov (table, in-page and side navigation), service-manual.nhs.uk (table), adrianroselli.com (responsive tables, display properties, fixed headers), inclusive-components.design/data-tables, w3.org (WCAG 2.2 reflow, DPUB-ARIA 1.1), westnorthants.gov.uk, barclays.co.uk.
Theme: modernfontstacks.com, adrianroselli.com (WCAG 3 contrast, April 2026), radix-ui.com/colors, github.com/material-foundation/material-color-utilities, github.com/adobe/leonardo, github.com/Myndex/apca-introduction, cloudfour.com (font subsetting).
