# Answer key — Doc 3: Honda UK Lawn & Garden brochure (10-page extract)

Sources: `png/03_honda/page-NN.png` (render, each PNG = one two-page spread, 2480x1753) and `text/03_honda_extract_10p/page-NN.txt` (PDF text layer, content-stream order). Line numbers below = `cat -n` of the txt.

Chosen pages:
| Extract page | Printed folio | Content | Why |
|---|---|---|---|
| 1 | none (outer cover spread: back cover left, front cover right) | Cover | mandatory |
| 3 | 16 (right page; left page has no folio, it is p.15) | HRX lawnmowers product-range spread, 12 models, feature matrix | richest model spread (brief asked "prices/features": this brochure has NO prices on any page) |
| 5 | 19 (brief said "original page 11"; the printed folio on the page is **19**, use the folio) | Lawnmower specification table, 18 models x 22 rows | mandatory |

Global facts: no prices anywhere in the extract; running headers are letter-spaced on every page; body font breaks "fi" ligatures on pages 3 and 5 but not on the cover.

---

## Page 1 — Cover spread (back cover left, front cover right)

### Reading order (expected)
Layout: a printer's spread. Right half = front cover (dominant hero photo + title). Left half = back cover (tagline, photo strip, blank dealer-stamp area, address, legal). Canonical order starts with the front cover; strict left-then-right (back cover first) is acceptable only if "Lawn & Garden" is still the document title/H1.

1. [right] "HONDA" wordmark (image only, alt "Honda")
2. [right] Title: "Lawn & Garden" (text layer lines 2–3: "Lawn &" / "Garden")
3. [right] Hero photo (alt below)
4. [left] "ENGINEERING FOR Life" tagline (line 1; "Life" is a script wordmark but IS in the text layer)
5. [left] Photo strip, 3 images, left to right (alts below)
6. [left] "MEMBER OF EGMF" logo (image only)
7. [left] Blank white rectangle (dealer stamp area, empty: nothing to output)
8. [left] "Honda (UK)" address block (lines 4–8): "Cain Road, Bracknell, Berkshire, RG12 1HL" / "United Kingdom" / "Honda Contract Centre 0345 200 8000" / "www.honda.co.uk"
9. [left] Legal disclaimer, one paragraph of 8 text-layer lines (lines 9–16) starting "These specification details do not apply to any particular product…" ending "…one of the features advertised."
10. [left] Recycling note (lines 17–18): "Honda sources paper responsibly from manufacturers within the EU." / "Please don’t bin me. Pass me on to a friend or recycle me."

### Content table
No products/prices on this page. Count: 0 items.

### Headings
- H1: "Lawn & Garden" (document title)
- H2 (acceptable: bold label, not heading): "Honda (UK)"
- Not headings: "ENGINEERING FOR Life" (tagline/wordmark), "HONDA" (logo)

### Images
Meaningful (4 photos + 2 logos):
- Hero (right page, full bleed): a smiling woman in a dark long-sleeved top and khaki trousers pushing a red-and-black Honda petrol lawnmower (HRX type, grass bag at the front) across a lawn; palm trees and a sunny sky behind.
- Strip 1: close-up of a person in a red Honda harness holding a Honda brushcutter engine unit (face not shown).
- Strip 2: a man wearing ear defenders driving a red Honda ride-on mower / lawn tractor in a garden.
- Strip 3: a Honda Miimo robotic mower on a lawn in front of a house at dusk, lights on in the house.
- "HONDA" wordmark (red on white, top right of front cover): text exists ONLY in the image.
- "MEMBER OF EGMF" membership logo (tiny, back cover): text "MEMBER OF" + "EGMF" exists ONLY in the image; a one-line tagline under it is illegible at this resolution (?).
Decorative: recycling-loop icon before line 17; the empty white rectangle; green background panel.

### Tables
None.

### Text-layer quirks
- Text layer = 18 lines, all visible text is present and in correct reading order for the left page; the right page contributes only "Lawn &" / "Garden" (lines 2–3) which appear BEFORE the left-page address block (so the stream is front-cover title first, then back cover: matches the canonical order above).
- "Lawn & Garden" is split into two lines: "Lawn &" / "Garden": must be joined into one title.
- "ENGINEERING FOR Life": mixed-case because "Life" is a script wordmark; keep as one phrase.
- NOT in the text layer: "HONDA" (wordmark), "MEMBER OF", "EGMF" (logo), the EGMF tagline.
- No ligature breaks on this page ("fit", "benefit", "specification" are intact in lines 9–13): a converter that "repairs" fi everywhere must not alter this page.
- Curly apostrophe U+2019 in "don’t" (line 18).
- No page number on this spread.

Counts: 18 text lines, 4 photos, 2 text-bearing logos, 1 decorative icon, 0 tables, 0 prices.

---

## Page 3 — HRX lawnmowers spread (folios 15–16)

### Reading order (expected)
Layout: left page = feature-icon legend (top-left), "NEW" corner tab, hero photo spanning the gutter, HRX SPECIFICATION feature matrix (bottom-left) with its two footnotes. Right page = running header "HRX LAWNMOWERS 16", kicker + headline + bold intro (top-right, right-aligned), three photos in a diagonal green panel, four body paragraphs (bottom-middle), product cut-out photo with caption "HRX 476 VYE".

Canonical order (headline block first, then copy, then the table with its legend); strict left-then-right (table before the right-page copy) is acceptable provided items 4–6 stay contiguous and 7–9 stay contiguous.

1. [right, top] Kicker "HRX lawnmowers"
2. [right] Headline "Enjoy the choice"
3. [right] Intro (bold): "The HRX is a wide range of technologically advanced mowers, all you have to do is pick the one that is right for your lawn."
4. [right, bottom] Lead paragraph: "The new HRX 476 and HRX 537 have been designed around you."
5. [right] Paragraph: "The new HRX has been designed to make your life easier and a little more enjoyable. It’s the result of over 40 years experience and features a host of unique Honda technologies; such as Select Drive for precise control, Versamow™ for selective mulching and Roto-Stop® to safely disengage the cutting blades. Our new GCVx engines increase performance, maximise efficiency and benefit from reduced noise levels. All you need to do is choose the one that is right for your garden."
6. [right] Paragraph: "For smaller gardens, the HRX 426 models, fitted with the GCV 160 engine, can suit your needs with a smaller cutter deck size but similar levels of performance and reliability."
7. [left, top] Feature-icon legend, 7 icons left to right: "Auto-Choke", "Select Drive*", "Hydrostatic Drive*", "Versamow™ Variable Mulching System*", "Roto-Stop®*", "Electric Start**", "Rear Roller***"
8. [left, top] Legend footnotes: "*Available on selected models only, please see table below for details." / "**Available on HRX 537 HZE model only." / "***Available on HRX 426 QXEH & HRX 476 QYE models only."
9. [left, top-left corner] Badge "NEW"
10. [left/gutter] Hero photo
11. [left, bottom] Table "HRX SPECIFICATION" (see Tables)
12. [left, bottom] Table legend "○ Available as an optional extra" and note "Model availability is dependant on country, do not hesitate to ask your local Honda dealer." (sic "dependant")
13. [right] Photos in the green panel (3) and the product cut-out with caption "HRX 476 VYE"
14. Page furniture (not content): running header "HRX LAWNMOWERS", folio "16"

### Content table (12 models; no prices in this brochure)
Deck/material are merged cells spanning 4 rows each. ■ = standard, ○ = optional extra.

| # | Model (exact) | Price | Deck size & material | Transmission | Mulching | Electric start | Roto-Stop® | Roller type | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | HRX 426 PKEH | none | 42 POLYSTRONG | Push ■ | Mulching kit ○ | – | – | – | |
| 2 | HRX 426 SDEH | none | 42 POLYSTRONG | Single speed ■ | Mulching kit ○ | – | – | – | |
| 3 | HRX 426 SXEH | none | 42 POLYSTRONG | Single speed ■ | Mulching kit ○ | – | ■ | – | |
| 4 | HRX 426 QXEH | none | 42 POLYSTRONG | Single speed ■ | – | – | ■ | ■ | rear roller model (footnote ***) |
| 5 | HRX 476 VKE | none | 47 POLYSTRONG | Select Drive ■ | Versamow™ Variable ■ | – | – | – | |
| 6 | HRX 476 VYE | none | 47 POLYSTRONG | Select Drive ■ | Versamow™ Variable ■ | – | ■ | – | pictured as product cut-out |
| 7 | HRX 476 HYE | none | 47 POLYSTRONG | Hydrostatic Drive ■ | Versamow™ Variable ■ | – | ■ | – | |
| 8 | HRX 476 QYEJ | none | 47 POLYSTRONG | Single speed ■ | – | – | ■ | ■ | legend footnote calls it "HRX 476 QYE" (source inconsistency) |
| 9 | HRX 537 VKE | none | 53 XENOY | Select Drive ■ | Versamow™ Variable ■ | – | – | – | |
| 10 | HRX 537 VYE | none | 53 XENOY | Select Drive ■ | Versamow™ Variable ■ | – | ■ | – | |
| 11 | HRX 537 HYE | none | 53 XENOY | Hydrostatic Drive ■ | Versamow™ Variable ■ | – | ■ | – | |
| 12 | HRX 537 HZE | none | 53 XENOY | Hydrostatic Drive ■ | Versamow™ Variable ■ | ■ | ■ | – | only electric-start model (footnote **) |

Marker counts: 30 ■ and 3 ○ in the matrix (plus 1 ○ in the legend). Columns SMART DRIVE® and VERSAMOW™ SELECTIVE are empty for every row.

### Headings
- H1 (spread title): "Enjoy the choice"; kicker "HRX lawnmowers" may be merged into it ("HRX lawnmowers: Enjoy the choice") or kept as an H2 above: either is fine, but "HRX lawnmowers" must not be a heading BELOW the headline.
- H2 / table caption: "HRX SPECIFICATION"
- Not headings: running header "HRX LAWNMOWERS", folio "16", badge "NEW", icon labels.

### Images
Meaningful:
- Hero (left page, spans gutter): a man (torso only) in a dark top and beige trousers pushing a red-and-black Honda HRX mower with a dark grass bag through long grass, a terracotta-roofed house and palm trees behind.
- Green-panel photo 1: a man mowing a garden lawn with a Honda HRX mower (grass bag at front), trees behind.
- Green-panel photo 2: a laughing woman with long dark hair sitting on grass, park trees behind.
- Green-panel photo 3: close-up of hands on a Honda mower handlebar with the Select Drive thumb control.
- Product cut-out: a Honda HRX 476 VYE mower, three-quarter front view, grey grass bag, red engine cover; caption "HRX 476 VYE".
- 7 feature icons (white pictograms on dark green squares): meaningful only via their labels (item 7); acceptable alt = the label text; the "MIN"/"MAX" letters inside the Select Drive icon are part of the icon, not content.
Decorative: green diagonal panels, orange "NEW" corner shape (text "NEW" is in the text layer), table shading.
Text ONLY in images: "HONDA" on the mowers in the photos; the ○ (optional) markers in the table and in the legend "○ Available as an optional extra" (no circle glyph exists anywhere in the text layer).

### Tables
"HRX SPECIFICATION": 12 data rows x 13 columns, 3 header rows.
- Header row 1 (groups): TRANSMISSION (spans cols 3–7), MULCHING (spans cols 8–10)
- Header row 2 (sub-groups): FIXED (cols 3–4), VARIABLE (cols 5–7)
- Header row 3 (column headers, exact, in order): MODELS | CUTTER DECK SIZE (CM) & MATERIAL | PUSH | SINGLE SPEED | SMART DRIVE® | SELECT DRIVE | HYDROSTATIC DRIVE | MULCHING KIT | VERSAMOW™ SELECTIVE | VERSAMOW™ VARIABLE | ELECTRIC START | ROTO-STOP® | ROLLER TYPE
- Row headers: the 12 model names in the order of the content table above.
- Merged cells: "42 POLYSTRONG" (rows 1–4), "47 POLYSTRONG" (rows 5–8), "53 XENOY" (rows 9–12).

### Text-layer quirks (95 lines)
- Running header letter-spaced: line 13 "H R X L A W N M O W E R S", folio on its own line 14 "16".
- Single letters on their own lines: lines 2–4 "M","I","N" and 15–17 "M","A","X": the MIN/MAX labels drawn inside the Select Drive icon, interleaved with the icon labels and running header. Must be dropped (or folded into the icon alt), never emitted as content.
- Icon labels fused across icons on one line: line 1 "Auto-Choke Select Drive*", line 10 "System* Roto-Stop®*", line 12 "Start** Rear Roller***"; the Hydrostatic/Versamow labels are split over lines 5–9.
- Ligature breaks: "effi ciency" (75), "benefi t" (76), "fi tted" (78, 79).
- Duplicated text: lines 78 and 79 are the same sentence twice; line 80 holds the next line twice fused: "GCV 160 engine, can suit your needs with a smaller cutter GCV 160 engine, can suit your needs with a smaller cutter"; caption "HRX 476 VYE" appears twice (90, 91). Expected output has each once.
- Order: the body copy (67–81) is emitted in the MIDDLE of the table rows (between "HRX 476 HYE" line 66 and "HRX 476 QYEJ" line 82); table rows do not come out in one block.
- Table header cells split per word/line and fused across columns: "MODELS CUTTER DECK" / "SIZE (CM) &" / "MATERIAL", "PUSH SINGLE" / "SPEED", "SMART" / "DRIVE®", "ROTO-" / "STOP®".
- ■ markers are emitted inline after the model name with NO column position (e.g. line 61 "HRX 426 QXEH ■ ■ ■", line 87 "HRX 537 HYE HRX 537 HZE ■ ■" two models fused), so feature-to-column association is unrecoverable from the text layer: a converter must use geometry. Total ■ in layer = 30 (matches render).
- ○ markers absent from the text layer entirely (render has 3 in cells + 1 in legend); line 94 is "■ ■ Available as an optional extra": the legend text fused with two stray squares.
- Phantom text: line 92 "HRX 537 VYEA" has no visible counterpart in the render (table shows "HRX 537 VYE", caption shows "HRX 476 VYE") (?) hidden/overprinted leftover; must not appear in output.
- Merged deck cells appear detached from their rows: "42" / "POLYSTRONG" after HRX 426 SDEH (line 58–59), "47" / "POLYSTRONG" after "HRX 476 VYE 47" (63–64), "53" / "XENOY" after HRX 537 VYE (85–86).
- Source inconsistency (not a layer bug): footnote *** says "HRX 476 QYE" while the table row is "HRX 476 QYEJ"; "dependant" sic.

Counts: 12 models, 13 table columns, 3 header rows, 7 feature icons, 3 legend footnotes, 2 table notes, 5 photos + 1 product cut-out, 3 duplicated text lines, 1 phantom line, 6 single-letter lines.

---

## Page 5 — Lawnmower specification (folio 19)

### Reading order (expected)
Layout: one table spanning the whole spread; the row-label column sits on the left page and is NOT repeated on the right page; the 18 model columns run left to right across the gutter (8 on the left page, 10 on the right). Group bands above the columns: ELECTRIC (3 cols), IZY (9 cols, band visually broken into two pieces at the gutter: 5 + 4), HRX (6 cols). Two photos top-right, a running header top-left.

1. Running header "LAWNMOWER SPECIFICATION" + folio "19" (page furniture)
2. Heading "Lawnmower specification"
3. Intro: "Use our handy table to compare our lawnmowers and choose the right model for you."
4. The table (group bands, model headers with thumbnails, 22 rows) read row by row across all 18 columns
5. Footnotes: "*The power rating of engines in this document is the net power output tested on a production engine and measured in accordance with SAE J1349 at 3,600 rpm." / "**Guaranteed sound power level (in accordance with 2000/14/EC Directive) in dB(A)."
6. Note (bottom right): "Model availability is dependant on country, do not hesitate to ask your local Honda dealer."

### Tables: "Lawnmower specification"
Dimensions: 18 model columns + 1 row-label column; 22 data rows; 2 header rows (group band + model name). Header column = row labels. Header rows = group band and model names.

Column headers (model codes) in order, with group:
1. HRE 330 PLE (ELECTRIC)
2. HRE 370 PLE (ELECTRIC)
3. HRE 410 PE (ELECTRIC)
4. HRG 416 PKEH (IZY)
5. HRG 416 SKEH (IZY)
6. HRG 466 PKEH (IZY)
7. HRG 466 SKEH (IZY)
8. HRG 466 SKEP (IZY)  [last column on the left page]
9. HRG 536 SKEH (IZY)  [first column on the right page]
10. HRG 536 VKEH (IZY)
11. HRG 536 VLEA (IZY)
12. HRG 536 VYEH (IZY)
13. HRX 426 PKEH (HRX)
14. HRX 426 SDEH (HRX)
15. HRX 426 SXEH (HRX)
16. HRX 426 QXEH (HRX)
17. HRX 476 VKE (HRX)
18. HRX 476 VYE (HRX)

Row labels in order (exact):
1. Cutter deck size (cm)
2. Cutter deck material
3. Engine
4. Engine displacement (cc)
5. Engine model
6. Engine rated power (KW/rpm)*
7. Dual air filter
8. Engine bearings
9. Fuel tank capacity (l)
10. Transmission
11. Driving speed (m/s)
12. Blade brake clutch (Roto-Stop®)
13. Mulching (Versamow™ selective / variable)
14. Mulching kit
15. Positions & cutting height adjustment (mm)
16. Height adjustment points
17. Rear roller
18. Electric start
19. Grass bag capacity (l)
20. Guaranteed sound level dB(A)**
21. Dry weight (kg)
22. Dimensions (L x W x H (mm))

Full rows, cells in column order 1→18 (verified cell by cell against a 2x crop of the render):

Row "Cutter deck size (cm)":
33 | 37 | 41 | 41 | 41 | 46 | 46 | 46 | 53 | 53 | 53 | 53 | 42 | 42 | 42 | 42 | 47 | 47

Row "Cutter deck material":
Polyprop. Plastic | Polyprop. Plastic | ABS Plastic | Steel | Steel | Steel | Steel | Steel | Steel | Steel | Steel | Steel | Polystrong | Polystrong | Polystrong | Polystrong | Polystrong | Polystrong

Row "Engine":
Electric 1,100 W | Electric 1,300 W | Electric 1,600 W | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke | OHC 4-stroke

Row "Transmission":
Push | Push | Push | Push | Single speed | Push | Single speed | Single speed | Single speed | Variable SMART Drive® | Variable SMART Drive® | Variable SMART Drive® | Push | Single speed | Single speed | Single speed | Variable Select Drive | Variable Select Drive

Row "Driving speed (m/s)":
- | - | - | - | 0.92 | - | 0.89 | 0.89 | 0.77 | 0-1.65 (progressive) | 0-1.65 (progressive) | 0-1.65 (progressive) | - | 1.04 | 1.04 | 0.9 | 0-1.4 | 0-1.4

Row "Dry weight (kg)":
11 | 15 | 22 | 29 | 30 | 29 | 31 | 32 | 36.2 | 36.8 | 40.2 | 41.3 | 31 | 33 | 36 | 38 | 39 | 42

Row "Dimensions (L x W x H (mm))" (each cell is rendered on two lines "L x W" / "x H"):
1,080 x 390 x 1,000 | 1,110 x 430 x 1,030 | 1,330 x 540 x 1,090 | 1,415 x 453 x 980 | 1,440 x 453 x 980 | 1,445 x 497 x 980 | 1,470 x 497 x 980 | 1,470 x 497 x 980 | 1,637 x 585 x 970 | 1,534 x 582 x 1,014 | 1,534 x 582 x 1,014 | 1,534 x 582 x 1,014 | 1,475 x 480 x 995 | 1,475 x 480 x 995 | 1,440 x 480 x 1,030 | 1,440 x 480 x 1,045 | 1,580 x 530 x 995 | 1,610 x 497 x 1,035

Remaining rows (verified against the crop; "-" = dash cell):
- Engine displacement (cc): - | - | - | 160 | 160 | 160 | 160 | 160 | 160 | 160 | 160 | 160 | 160 | 160 | 160 | 160 | 167 | 167
- Engine model: - | - | - | GCV 160 x13 (cols 4–16) | GCV 170 | GCV 170
- Engine rated power (KW/rpm)*: - | - | - | 2.8/2,900 | 2.8/2,900 | 2.7/2,800 | 2.7/2,800 | 2.7/2,800 | 2.7/2,850 | 2.7/2,850 | 2.7/2,850 | 2.7/2,850 | 2.8/2,900 | 2.8/2,900 | 2.8/2,900 | 2.8/2,900 | 3.6/3,600 | 3.6/3,600
- Dual air filter: all 18 "-"
- Engine bearings: all 18 "-"
- Fuel tank capacity (l): - | - | - | 0.91 | 0.91 | 0.91 | 0.91 | 0.91 | 0.91 | 0.93 | 0.93 | 0.93 | 0.91 | 0.91 | 0.91 | 0.91 | 0.95 | 0.95
- Blade brake clutch (Roto-Stop®): "Yes" only in cols 12 (HRG 536 VYEH), 15 (HRX 426 SXEH), 16 (HRX 426 QXEH), 18 (HRX 476 VYE); all others "-"
- Mulching (Versamow™ selective / variable): "Selective" in cols 8, 10, 11, 12; "Variable" in cols 17, 18; others "-"
- Mulching kit: "Optional" in cols 5, 6, 7, 9, 13, 14, 15; others "-"
- Positions & cutting height adjustment (mm): 3 (25-57) | 5 (18-65) | 5 (20-70) | 6 (20-74) x5 (cols 4–8) | 6 (19-80) | 6 (28-102) | 6 (28-102) | 6 (28-102) | 6 (25-78) | 6 (25-78) | 6 (25-78) | 5 (19-55) | 7 (25-79) | 7 (25-79)
- Height adjustment points: 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 4 | 4 | 4 | 4 | 2 | 2 | 2 | 2 | 1 | 1
- Rear roller: "Yes" only in col 16 (HRX 426 QXEH)
- Electric start: "Yes" only in col 11 (HRG 536 VLEA)
- Grass bag capacity (l): 27 | 35 | 65 | 50 | 50 | 55 | 55 | 55 | 73 | 73 | 73 | 73 | 60 | 60 | 60 | 60 | 69 | 69
- Guaranteed sound level dB(A)**: 87 | 89 | 94 | 94 | 95 | 94 | 95 | 95 | 98 | 98 | 98 | 98 | 94 | 94 | 94 | 94 | 95 | 94

Cross-checks that catch wrong cell associations: the only "Electric start: Yes" is HRG 536 VLEA; the only "Rear roller: Yes" is HRX 426 QXEH; the only 1,637-long machine is HRG 536 SKEH; the 3 electric models have "-" for every engine row; HRX 426 QXEH has 5 (19-55) while its three siblings have 6 (25-78).

### Content table
18 models, 0 prices: covered by the column list above. Model-level notes: 3 electric (HRE), 9 IZY petrol (HRG), 6 HRX (4x 426 + 2x 476); the HRX 426/476 models overlap with page 3 and the values agree.

### Headings
- H1: "Lawnmower specification"
- Not headings: running header "LAWNMOWER SPECIFICATION", folio "19", group bands "ELECTRIC"/"IZY"/"HRX" (they are column-group header cells), model names (column header cells).

### Images
Meaningful: 18 product thumbnails above the model names (each a small three-quarter view of the respective mower; red ones for petrol models, white/red compact ones for the three HRE electric models): alt should be the model name or marked as redundant with the header cell.
Decorative: two photos in the top-right banner (close-up of grass; a red Honda mower on a lawn with trees), the diagonal page-corner tab.
Text ONLY in images: none (all visible text is in the layer).

### Text-layer quirks (125 lines)
- Running header letter-spaced with a fused pair: line 1 "19 L A W N M O W E R S P E C I F I C AT I O N" ("AT" kerned together; folio "19" fused at the front).
- Ligature breaks: "specifi cation" (line 2), "Dual air fi lter" (44, inside a row label).
- Group band line 4 "ELECTRIC IZY IZY HRX": IZY appears twice because the band is drawn in two pieces (left page / right page); output must have ONE "IZY" group spanning 9 columns.
- Model headers split into two lines each (lines 5–40: "HRE 330" / "PLE" …): 36 lines for 18 names; must be joined "HRE 330 PLE".
- Only rows 1–2 come out as clean rows (41 "Cutter deck size (cm) 33 37 …", 42 "Cutter deck material …"). From row 3 on, the stream is column-chunked: line 43 holds "Engine Electric 1,100 W Electric 1,300 W Electric 1,600 W OHC 4-stroke OHC 4-stroke Engine displacement (cc)- Engine model- Engine rated power" i.e. several row labels fused with the FIRST column's dash cell ("(cc)-", "model-", "(KW/rpm)*-", "fi lter-", "bearings-", "(l)-", "(m/s)-", "(Roto-Stop®)-", "variable)-", "Mulching kit-", "Rear roller-", "Electric start-"): the dash is glued to the label with no space.
- Row/column association is lost from line 43 to 124: values are emitted per column block (e.g. line 47 "… 1 Rear roller- - - 160 - - GCV 160 - - 2.8/2,900 …", lines 92–124 are the last 5 HRX columns emitted 5 values per line, lines 67/80 are single cells "- - 55 95 31 1,470 x 497"). A text-order converter will mis-associate most cells; geometry is required.
- Dimensions cells split in two lines with the label in between: "1,080 x 390" … (52–57), then the label "(L x W x H (mm))" (58), then "x 1,000" … (59–64).
- Footnotes (65–66) are emitted in the MIDDLE of the table data (before the right-page columns, 67–124), and the note on line 125 last.
- Multi-line cells fragmented: "Variable" / "SMART Drive®" (69–72, 77–78), "Variable Select" / "Drive" (98–101), "0-1.65" / "(progressive)" (73–76, 78–79).
- Multi-line row labels split: "Engine rated power" / "(KW/rpm)*", "Blade brake clutch" / "(Roto-Stop®)", "Mulching (Versamow™" / "selective / variable)", "Positions & cutting height" / "adjustment (mm)", "Guaranteed sound" / "level dB(A)**", "Dimensions" … "(L x W x H (mm))".
- Nothing missing from the layer; no text exists only in images. "dependant" sic (line 125).

Counts: 18 model columns, 22 rows, 3 group bands (IZY drawn twice), 396 data cells, 18 thumbnails, 2 banner photos, 2 footnotes + 1 note, 125 text lines.
