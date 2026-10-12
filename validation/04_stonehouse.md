# Answer key — Doc 4: Stone House Hotel, Christmas brochure 2026 (6 pages)

Sources: `png/04_stonehouse/page-NN.png` (single pages, square format) and `text/04_stonehouse_hotel_christmas_brochure_2026/page-NN.txt`. Line numbers = `cat -n`.

Chosen pages:
| Page | Content | Why |
|---|---|---|
| 1 | Cover "Tis the season / CHRISTMAS PACKAGE 2026" | mandatory |
| 4 | "Extend Your Stay" + Four-Night Christmas Break prices (7 room types, 2 dates, 1 discount) | most packages/prices/dates |
| 5 | "Booking Information" text block above two photos (deposit £200) | text beside photos (no page in this brochure places text over a photo; page 2 is the alternative: headline below a photo) |

Global facts: hand-drawn kraft-paper background and snowflakes on every page (decorative); footer "Christmas at Stone House Hotel" + folio appears on pages 2, 3, 4 only; headings are either script (brush-lettering font, present in the text layer as normal text) or letter-spaced small caps (present as "C H R I S T M A S …"). The hotel is in Hawes, North Yorkshire (page 6).

---

## Page 1 — Cover

### Reading order (expected)
Single column, centred.
1. Title (script): "Tis the season"
2. Subtitle (letter-spaced caps): "CHRISTMAS PACKAGE 2026"
3. Illustration of the hotel (alt below)
4. Logo "STONE HOUSE" / "HOTEL" (image only)

### Content table
No packages/prices on this page. Count: 0.

### Headings
- H1: "Tis the season" (acceptable combined H1: "Tis the season – Christmas Package 2026")
- H2 / subtitle: "CHRISTMAS PACKAGE 2026" (must read as "Christmas Package 2026", not letter by letter)
- Not a heading: the "STONE HOUSE HOTEL" logo (brand mark; alt text)

### Images
Meaningful:
- Line illustration of Stone House Hotel: a two-storey stone country house with gabled roofs, tall chimneys, mullioned windows, a conservatory wing on the left and ivy covering the right-hand wing; clipped hedge in front.
- "STONE HOUSE / HOTEL" logotype (rust-red serif, letter-spaced "HOTEL"): text exists ONLY in the image.
Decorative: snowflakes and stars (about 20, green line art), kraft-paper texture background.

### Tables
None.

### Text-layer quirks (1 line)
- The whole layer is one line with no separator: "Tis the seasonC H R I S T M A S P A C K A G E 2 0 2 6": the script title and the subtitle are fused ("seasonC"), and the subtitle is letter-spaced including the year ("2 0 2 6"). Expected output: two separate strings "Tis the season" and "Christmas Package 2026".
- No apostrophe in "Tis" in either render or layer (source as-is; do not "correct" to ’Tis).
- NOT in the layer: "STONE HOUSE", "HOTEL" (logo).
- No page number.

Counts: 1 text line, 1 illustration, 1 logo, ~20 decorative snowflakes.

---

## Page 4 — Extend Your Stay / Four-Night Christmas Break

### Reading order (expected)
Single column; the price box is a bordered panel with the prices laid out in THREE columns. Prices ascend column-wise (1,040 → 1,225), so the intended order of the 7 items is column 1 top-to-bottom, then column 2, then column 3.

1. Heading (script): "Extend Your Stay"
2. Paragraph: "Make the most of your visit with an extra night before or after Christmas. Guests can enjoy 20% off Bed & Breakfast rates throughout December, the perfect way to enjoy a longer escape in the Yorkshire Dales." ("20% off Bed & Breakfast rates throughout December" is bold rust-red inline emphasis)
3. Paragraph: "Those joining us on 23rd December will be welcomed with a complimentary cream tea on arrival." ("rd" superscript)
4. Box heading line 1: "FOUR-NIGHT CHRISTMAS BREAK"
5. Box heading line 2: "(24TH – 28TH DECEMBER)" ("TH" superscript, en dash)
6. Prices, column 1: "Cosy Double: £1,040", "Cosy King: £1,060"
7. Prices, column 2: "Cosy Conservatory: £1,080", "Superior Room: £1,100", "Deluxe Room: £1,180"
8. Prices, column 3: "Junior Suite: £1,205", "Suite: £1,225"
9. "Prices per person (based on two people sharing)"
10. "Limited single occupancy options are available. Please contact us for further details."
11. Footer: "Christmas at Stone House Hotel" / "04"

### Content table (7 room packages, 1 offer)
| # | Name (exact) | Price | Key attributes | Notes |
|---|---|---|---|---|
| 1 | Cosy Double | £1,040 | Four-Night Christmas Break, 24th–28th December; per person, two sharing | column 1 |
| 2 | Cosy King | £1,060 | same | column 1 |
| 3 | Cosy Conservatory | £1,080 | same | column 2 |
| 4 | Superior Room | £1,100 | same | column 2 |
| 5 | Deluxe Room | £1,180 | same | column 2 |
| 6 | Junior Suite | £1,205 | same | column 3 |
| 7 | Suite | £1,225 | same | column 3 |
| 8 | Extra-night offer (no name) | 20% off Bed & Breakfast rates | throughout December; complimentary cream tea for arrivals on 23rd December | paragraph, not in the box |

Dates on the page: 23rd December; 24th – 28th December. Qualifier: "Limited single occupancy options are available."

### Headings
- H2: "Extend Your Stay" (H1 is the cover title)
- H3: "FOUR-NIGHT CHRISTMAS BREAK (24TH – 28TH DECEMBER)" (two visual lines, one heading; must read as "Four-Night Christmas Break (24th – 28th December)")
- Not headings: the bold room names (they are list/definition labels), the footer.

### Images
Decorative only: holly sprig with berries (top-left), two snowflakes + star (bottom-right), kraft texture, the rust-coloured box border.
Meaningful: none. Text only in images: none.

### Tables
None drawn; the 7 prices are a 3-column label/value grid. Acceptable outputs: a definition list, a bulleted list in the column-wise order, or a 2-column table (Room | Price). A 3x3 positional table that preserves the visual grid is WRONG (it would pair "Cosy Double" with "Cosy Conservatory").

### Text-layer quirks (19 lines)
- Price order scrambled by y-sorting: lines 7–8 (column 1: "Cosy Double: £1,040", "Cosy King: £1,060") come BEFORE the box heading (lines 9–10); column 2 follows (11–13); then "Prices per person…" (14) and "Limited single…" (15); column 3 ("Junior Suite: £1,205", "Suite: £1,225") comes LAST (16–17), after the notes. Expected: heading, 7 items in column order, then the two notes.
- Box heading mangled: line 9 "F O U R - N I G H T ( 2 4 T H – 2 8 T H C H R I S T M A S D E C E M B E R )" + line 10 "B R E A K": letter-spaced AND the two visual lines are interleaved by x-position (words of line 1 and line 2 merged: "FOUR-NIGHT (24TH – 28TH CHRISTMAS DECEMBER) BREAK"). Correct text: "FOUR-NIGHT CHRISTMAS BREAK" / "(24TH – 28TH DECEMBER)".
- Superscripts flattened: "23rd" (line 5) fine; "2 4 T H – 2 8 T H" letter-spaced.
- Inline emphasis "20% off Bed & Breakfast rates throughout December," is plain text in the layer (bold/colour lost, which is fine).
- Everything visible is in the layer; nothing exists only in images. Footer lines 18–19 present.

Counts: 7 priced items, 1 discount offer, 2 date mentions, 19 text lines, 0 photos, 3 decorative illustrations.

---

## Page 5 — Booking Information

### Reading order (expected)
Top half: terracotta block with gold script heading and three centred white paragraphs. Bottom half: two photos side by side, snowflakes overlaid along their bottom edge. No footer/folio on this page.

1. Heading (script): "Booking Information"
2. Paragraph: "To confirm your reservation, a non-refundable and non-transferable deposit of £200 per person is required."
3. Paragraph: "We recommend booking early to secure your preferred room."
4. Paragraph (bold): "We look forward to welcoming you to Stone House this Christmas."
5. Photo left (alt below)
6. Photo right (alt below)

### Content table
| # | Item | Price | Key attributes | Notes |
|---|---|---|---|---|
| 1 | Booking deposit | £200 per person | non-refundable, non-transferable | only figure on the page |

### Headings
- H2: "Booking Information"

### Images
Meaningful (2 photos, no captions anywhere, alt must be authored):
- Left: a Christmas wreath of pine cones, fir, red baubles, red hydrangea-style flowers and cinnamon sticks, with a red velvet ribbon, hanging on a dark wooden door with an iron grille.
- Right: a hotel bedroom corner: bed with a tall floral-patterned headboard, white linen and a pink patterned cushion; white bedside table with a pleated white lamp on a dark-red turned stand, a black vintage rotary telephone and a brass wall light; pale panelled wall.
Decorative: white snowflakes overlaid on the lower part of both photos; terracotta textured background.
Text only in images: none.

### Tables
None.

### Text-layer quirks (5 lines)
- Clean: all 5 visible text lines present, in order, no letter-spacing, no fusion; the script heading is real text ("Booking Information").
- Colour contrast risk, not a layer issue: gold script heading on terracotta (?) likely below AA for large text.
- Both photos are uncaptioned: a converter must not leave them with empty alt or treat them as decorative.
- No folio/footer on this page (pages 2–4 have one): a converter adding "05" would be inventing.

Counts: 1 price (£200), 3 paragraphs, 2 meaningful photos, 5 text lines.
