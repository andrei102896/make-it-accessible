# Answer key – BILLA PLUS Flugblatt KW41 2026 (Wien), pages 1 / 3 / 8

Sources: `png/01_billa/page-NN.png` (truth for prices, layout, badges) and `text/01_billa_plus_kw41_wien/page-NN.txt` (truth for spelling).
Conventions: prices reconstructed as `X,XX €` (text layer has `399` = 3,99 €). `(?)` = not readable with confidence. "Image-only" = string visible in the PNG but absent from the txt (checked with grep).

Page selection (all 10 pages viewed):

| Role | Page | Why |
|---|---|---|
| (a) densest grid | 3 | uniform 4 × 5 grid, 20 products, no headline, no editorial text – the pure-grid case |
| (b) mixed | 8 | info block with checklist ("TIERWOHL AUS ÖSTERREICH"), a full-height fish sidebar with its own promo + two-tier day prices, a 2 × 4 product grid, a footnoted example-pack price. Page 2 (editorial + 8 products) and page 6 (Marktküche sidebar + produce) are the runner-ups. |
| (c) cover | 1 | hero + callout + 4-product strip + footnotes |

Product counts: page 1 = 4, page 3 = 20, page 8 = 12 (4 fish + 8 meat).

---

## Page 1 – cover

### Reading order (top → bottom, then the product strip left → right)

Rationale: the page is a vertical stack of full-width bands; only the bottom band is a row of 4 equal cards, which a reader scans left to right.

1. Validity line: "GÜLTIG VON DONNERSTAG, 8.10. BIS MITTWOCH, 14.10.2026¹⁾ BEI" + **BILLA PLUS** logo (the sentence ends in the logo; the logo text is image-only).
2. Callout arrow (image-only text): "BIS ZU 3.000 PRODUKTE ZUM DISKONTPREIS* DAUERHAFT. IMMER clever PREIS".
3. Hero photo (woman with a full shopping cart in front of a BILLA store) – illustrative.
4. Headline: "BILLA KAUFEN, DISKONT ZAHLEN" + "Mehr Infos siehe Seite 2".
5. Product collage, captioned "Symbolbild" – decorative.
6. Red banner: "UND WÖCHENTLICH VIELE AKTIONEN".
7. Product 1 – Driscolls Himbeeren.
8. Product 2 – Österreichischer Rostbraten od. österreichisches Beiried.
9. Product 3 – Julius Meinl Präsident.
10. Product 4 – Wieselburger Gold²⁾.
11. Footnote 2) "Gültig in Wien, Niederösterreich und im nördlichen Burgenland." (sits under card 4).
12. Footnote 1) "Ausgenommen Freitag-Samstag-Aktionen. Aktionen und Rabatte sind an Sonn- und Feiertagen in unseren Märkten nicht gültig."
13. "Auf [no-discount icon] gekennzeichnete Artikel sind keine weiteren Rabatte gültig."
14. "* Diskontpreisniveau vom Druckabgabetag 22. 9. 2026."

### Products (4)

| # | Name (text layer) | Price | Unit | Old price / discount | Validity | Notes |
|---|---|---|---|---|---|---|
| 1 | Driscolls Himbeeren | 2,69 € | per 200 g Tasse (1 kg 13,45) | – | – | Kl. I; badge "BALANCIERTES SÜSSE-SÄURE-VERHÄLTNIS"; no-further-discount icon |
| 2 | Österreichischer Rostbraten od. österreichisches Beiried | 19,99 € | per Kilo | – | – | im Ganzen, in Selbstbedienung; badges "NUR KURZE ZEIT", "IDEAL FÜR RIB- OD. RUMPSTEAK"; IS' HEIMISCH; no-further-discount icon |
| 3 | Julius Meinl Präsident div. Sorten | 7,99 € AB 2 PKG. JE | per 500 g Packung (1 kg 23,98 / 15,98) | 1 PKG. € 11,99; −33 % | – | EXTREM AKTION badge (image-only text) |
| 4 | Wieselburger Gold²⁾ | 13,80 € | per Kiste = 20 Flaschen à 0,5 Liter (0,5 l 0,69) | – | – | auch im 6er-Träger; footnote 2) regional validity; IS' HEIMISCH; mehrweg badge; no-further-discount icon |

### Headings

- Document title (not on page as such): BILLA PLUS Flugblatt, gültig 8.10.–14.10.2026.
- H1: "BILLA KAUFEN, DISKONT ZAHLEN" (sub-line "Mehr Infos siehe Seite 2" = paragraph, not heading).
- H2: "UND WÖCHENTLICH VIELE AKTIONEN" (section head of the product strip).
- The validity line and the arrow callout are paragraphs/figure text, not headings.
- Product names are not headings (4 cards → list or table).

### Images

Meaningful:
- Hero photo: woman pushing a shopping cart overflowing with groceries in front of a BILLA store entrance. Illustrative; short alt is enough.
- Product photo 1: tray of Driscoll's raspberries with loose raspberries.
- Product photo 2: raw beef cuts (Rostbraten / Beiried) on butcher paper.
- Product photo 3: two red Julius Meinl Präsident coffee packs with a cup.
- Product photo 4: Wieselburger Bier bottle in front of a crate.

Decorative / repeat text:
- Yellow arrow "IMMER clever PREIS" with "BIS ZU 3.000 PRODUKTE ZUM DISKONTPREIS* DAUERHAFT." – the ONLY place this text exists on the page; it is image-only (text layer has it on page 2, not here). The `*` footnote at the bottom refers to it → orphan footnote for a text-based converter.
- "BILLA PLUS" wordmark – image-only.
- Product collage ("Symbolbild"): packaging text visible (Soletti, HARIBO Goldbären, clever Toast Schinken, Red Bull, iglo, Barilla, Jacobs Monarch, KnabberNossi, Puntigamer, Ölz, Kelly's, Mezzo Mix …) – all image-only, decorative; do not enumerate in alt.
- Badges: "NUR KURZE ZEIT", "IDEAL FÜR RIB- OD. RUMPSTEAK", "BALANCIERTES SÜSSE-SÄURE-VERHÄLTNIS" (text present in txt); "EXTREM AKTION" (image-only; the "−33 %", "1 PKG. € 11.99", "AB 2 PKG. JE" are in txt); "IS' HEIMISCH" heart ×2 (image-only); "mehrweg" ×1 (image-only); crossed-% "no further discounts" icon ×3 (image-only – the footnote sentence "Auf … gekennzeichnete Artikel" loses its subject in the text layer).

### Tables

None. The 4-card strip is layout, not a data table (no header row). Tagging it as `<table>` would be wrong.

### Text-layer quirks (page-01.txt)

1. `14. 10. 20261) BEI` – footnote marker fused to the year (reads as year 20261); line ends with dangling "BEI" because the sentence continues into the image logo. Also "8. 10." has inner spaces, image shows "8.10.".
2. `AKTIONENSymbolbild` – banner headline fused with the collage caption.
3. `Gold2)` – footnote marker fused to the product name.
4. Prices without decimals: `269` → 2,69; `1999` → 19,99; `799AB 2 PKG. JE` → 7,99 € ab 2 Packungen je; `1380` → 13,80.
5. Order: all three circle badges come before any product and in a different order (Rostbraten's two badges, then Himbeeren's). Julius Meinl's name block (product 3) precedes Driscolls (product 1); Meinl's price `-33 %` / `799AB 2 PKG. JE` appears only after Rostbraten's `1999` → the name is separated from its price by two other products.
6. `(1 kg 23.98/` + newline + `15.98)` – unit price pair split over two lines (23,98 at 11,99 single pack; 15,98 at the 7,99 multi-pack price).
7. Footnote 2) comes before footnote 1) in the stream, and `1)` sits on its own line.
8. Image-only text (grep-verified absent): "BILLA PLUS", "3.000", "IMMER clever PREIS", "EXTREM AKTION", "IS' HEIMISCH", "mehrweg", every brand name in the collage. "Driscolls" (txt) vs "Driscoll's" (packaging) – spelling follows txt.

---

## Page 3 – densest product grid (20 products, 4 columns × 5 rows)

### Reading order: row by row (left → right, top → bottom)

Rationale: all 20 cells are identical in size, there are no column headers and no theme per column or per row (col 1 = sweets, Krapfen, noodles, coffee capsules, whisky), so the default Z-pattern applies. **The content stream is column-major with batched prices** (see quirks) – a converter that follows the stream produces a column-wise order AND mismatched prices.

1. Kinder Choco Fresh (r1c1) · 2. Ja! Natürlich Bio-Goudascheiben (r1c2) · 3. Grana Padano DOP (r1c3) · 4. Ja! Natürlich Bio-Dinkel-Buchweizenbrot (r1c4)
5. Krapfen Marille (r2c1) · 6. BILLA immer gut Sandwich Ei-Schnittlauch (r2c2) · 7. Bauernland Gemüse- od. Käse-Karfiol-Laibchen (r2c3) · 8. Ja! Natürlich Bio-Erbsen od. Zarte Mischung (r2c4)
9. Nissin Soba Cup (r3c1) · 10. Leibniz Butterkeks (r3c2) · 11. Pischinger Ecken (r3c3) · 12. Lay’s Bugles (r3c4)
13. Jacobs Nespresso-kompatible Alukapseln (r4c1) · 14. Almdudler (r4c2) · 15. clever Eistee Pfirsich od. Zitrone (r4c3) · 16. High Mountains Feiner Sahnelikör (r4c4)
17. Mc Intyre Blended Scotch Whisky 3yo (r5c1) · 18. Wieselburger Gold (r5c2) · 19. TENA discreet Inkontinenzeinlagen²⁾ (r5c3) · 20. Fa Dusche (r5c4)
21. Footnote 2) "Medizinprodukt: Über Wirkungen und mögliche unerwünschte Wirkungen dieses Medizinproduktes informieren Gebrauchsanweisung, Arzt oder eine sonstige, aufgrund ihrer beruflichen Ausbildung dazu befugte Person." (inside cell 19)
22. Footer "Angebote gültig bei BILLA PLUS."

### Products (20)

| # | Name (text layer) | Price | Unit | Old price / discount | Validity | Notes |
|---|---|---|---|---|---|---|
| 1 | Kinder Choco Fresh | 2,29 € | 102,5 g Packung (1 kg 22,34) | – | – | |
| 2 | Ja! Natürlich Bio-Gouda-scheiben | 2,39 € | 150 g Packung (100 g 1,59) | – | – | txt hyphenates "Bio-Gouda-/scheiben" → Bio-Goudascheiben; IS' HEIMISCH |
| 3 | Grana Padano DOP | 3,29 € | gerieben, 150 g Packung (100 g 2,19) | – | – | Grana Padano consortium logo |
| 4 | Ja! Natürlich Bio-Dinkel-Buchweizenbrot | 2,99 € | backofenfrisch, 500 g Stück (1 kg 5,98) | – | – | "100 % PFLANZLICH"; IS' HEIMISCH |
| 5 | Krapfen Marille | 0,69 € | per Stück | – | – | mit fruchtiger Marillenfüllung |
| 6 | BILLA immer gut Sandwich Ei-Schnittlauch | 1,45 € | 170 g Packung | – | – | |
| 7 | Bauernland Gemüse- od. Käse-Karfiol-Laibchen | 4,89 € | 300 g Packung (1 kg 16,30) | – | – | |
| 8 | Ja! Natürlich Bio-Erbsen od. Zarte Mischung | 3,70 € | tiefgekühlt, 750 g Packung (1 kg 4,93) | – | – | IS' HEIMISCH |
| 9 | Nissin Soba Cup div. Sorten | 1,79 € | 89 g – 92 g Becher (1 kg 19,46 – 20,11) | – | – | |
| 10 | Leibniz Butterkeks div. Sorten | 2,49 € | 150 g Packung (100 g 1,08 – 1,66) | – | – | |
| 11 | Pischinger Ecken div. Sorten | 2,79 € | 130 g Packung (100 g 2,30) | – | – | |
| 12 | Lay’s Bugles div. Sorten | 2,49 € | 75 g Packung (100 g 3,32) | – | – | |
| 13 | Jacobs Nespresso-kompatible Alukapseln div. Sorten | 6,99 € | 104 g – 114 g, 20 Portionen (1 kg 61,32 – 67,21) | – | – | |
| 14 | Almdudler div. Sorten | 2,39 € | 1,5 Liter Flasche (1 l 1,59) | – | – | IS' HEIMISCH; deposit/Einweg starburst icon (?) |
| 15 | clever Eistee Pfirsich od. Zitrone | 0,79 € | 1,5 Liter Flasche (1 l 0,52) | – | – | deposit/Einweg starburst icon (?) |
| 16 | High Mountains Feiner Sahnelikör | 4,99 € | 0,7 Liter Flasche (1 l 7,13) | – | – | |
| 17 | Mc Intyre Blended Scotch Whisky 3yo | 8,99 € | 0,7 Liter Flasche (1 l 12,84) | – | – | "Mc Intyre" with space, as in txt |
| 18 | Wieselburger Gold | 1,29 € | 0,33 Liter Einweg Flasche (0,5 l 1,95) | – | – | unit price per 0,5 l although bottle is 0,33 l; IS' HEIMISCH |
| 19 | TENA discreet Inkontinenz-einlagen²⁾ | 4,95 € | 12 Stück Packung (1 Stk. 0,41) | – | – | footnote 2) Medizinprodukt; txt hyphenates "Inkontinenz-/einlagen2)" |
| 20 | Fa Dusche div. Sorten | 2,25 € | 400 ml Flasche (100 ml 0,56) | – | – | |

No old prices, no percentages, no validity days on this page; every cell carries the "IMMER clever PREIS" badge instead.

### Headings

- No heading on the page. The only candidate is the repeated badge "IMMER clever PREIS" (image-only). A converter may synthesise an H2 such as "Immer Clever Preis – Angebote" but must mark it as inferred; nothing in the txt supports it.
- Product names are list/table content, not headings (if a converter uses headings per product, they'd all be the same level, H3 under the inferred H2).
- Footer "Angebote gültig bei BILLA PLUS." = paragraph.

### Images

Meaningful (one product photo per cell): Kinder Choco Fresh box · Bio Gouda slices pack · Grana Padano bag · sliced dark bread loaf · sugared Krapfen · sandwich wedge in box · Karfiol-Laibchen box · Zarte Mischung frozen bag · Nissin Soba cup · Leibniz biscuit pack · Pischinger Haselnuss-Ecken pack · Lay's Bugles Nacho Cheese bag · Jacobs Lungo capsule box · Almdudler 1,5 l bottle · clever Eistee Pfirsich bottle · High Mountains Fine Cream bottle · Mc Intyre whisky bottle · Wieselburger Bier bottle · TENA discreet pack · Fa Soft Aloe Vera Yogurt shower gel.

Decorative / repeat text:
- "IMMER clever PREIS" yellow arrow × 20 – image-only text, pure repetition → decorative.
- "IS' HEIMISCH" heart × 5 (cells 2, 4, 8, 14, 18) – image-only.
- "ja! Natürlich" logo on cells 2, 4, 8; "clever" logo on 15 (the word "clever" is in txt as part of the name); "GRANA PADANO" consortium triangle on 3.
- "100 % PFLANZLICH" green label on cell 4 – text present in txt.
- Starburst deposit/Einweg icon on cells 14 and 15 (?) – image-only.
- Packaging text (e.g. "Nacho Cheese", "LUNGO", "Fine Cream", "x12 Einlagen", "Original") – image-only, decorative.

### Tables

None. The 4 × 5 grid is layout: no header row/column, cells are independent cards. Should become a list (or 20 figure+caption groups), not a `<table>`.

### Text-layer quirks (page-03.txt)

1. **Prices are detached from names and batched per column.** Column 1: names Kinder, Krapfen, Nissin, Jacobs → then `229 / 069 / 179 / 699` (in matching order), then Mc Intyre `899`.
2. **Column 2 price batch is in a different order than the names.** Names appear as Sandwich, Leibniz, Bio-Gouda; prices follow as `239 / 145 / 249` = Gouda 2,39, Sandwich 1,45, Leibniz 2,49. A "next price after name" matcher assigns Sandwich = 2,39, Leibniz = 1,45, Gouda = 2,49 – all three wrong.
3. Column 4: names Buchweizenbrot, Bio-Erbsen, Lay's → then `100 % PFLANZLICH` (belongs to the first of the three) → then `299 / 370 / 249`. Column 3 is the only column where every name is directly followed by its own price.
4. Stream order is column-major (c1 rows 1-4, c1 row 5, c2 rows 2-3-1, c2 row 4, c2 row 5, c3 …), not the visual row-major order.
5. Leading-zero prices: `069` = 0,69 €, `079` = 0,79 € – a converter that drops leading zeros gets 69 €/79 €.
6. Line-end hyphens are ambiguous: `Bio-Gouda-` / `scheiben` → "Bio-Goudascheiben" (drop hyphen); `Inkontinenz-` / `einlagen2)` → "Inkontinenzeinlagen" (drop); but `Nespresso-` / `kompatible` and `Bio-Dinkel-` / `Buchweizenbrot` keep their hyphen. No signal in the txt distinguishes the cases.
7. `einlagen2)` – footnote marker fused to the word; the footnote text sits inside cell 19 and only then do cells 4, 8, 12 (column 4) appear in the stream.
8. Mixed decimal conventions inside one parenthesis: `(0,5 l 1.95)`, `(1 l 1.59)` – comma in the quantity, point in the price. Ranges use spaced en dashes: `(1 kg 19.46 – 20.11)`.
9. `Lay’s` uses a typographic apostrophe (U+2019); "Mc Intyre" has a space the packaging does not.
10. Image-only text (grep-verified): "IMMER clever PREIS", "IS' HEIMISCH", all packaging text.

---

## Page 8 – mixed page (info block + fish sidebar + meat grid)

### Reading order

Two zones: a full-height left sidebar (blue/white, fish, ~27 % of the width) and the right zone (headline + checklist + 2 × 4 grid). The sidebar is a self-contained panel with its own promo headline, so it is read as one unit; the right zone has its own H1 and its grid is read row by row (equal 2-column cells, each row visually boxed). Sidebar first (top-left start) is the primary order; right zone first then sidebar is also acceptable – what is NOT acceptable is interleaving sidebar items with grid rows by y-coordinate, which is what the content stream does (Karpfenfilet lands between Gulasch and Rinderpfanne).

Sidebar:
1. Promo: "JEDEN DONNERSTAG – BIS ZU 10% AUF FRISCHFISCH & MEERESFRÜCHTE – NUR IN BEDIENUNG" ("BIS ZU" is image-only).
2. Ja! Natürlich Bio-Bachsaibling (FR–MI 3,99 / DO 3,59).
3. Ja! Natürlich Bio-Karpfenfilet (FR–MI 3,99 / DO 3,59).
4. Vårlaks Lachsfilet (FR–MI 2,99 / DO 2,69, each ab 250 g).
5. Kabeljaufilet (FR–MI 3,29 / DO 2,96, each ab 250 g).

Right zone:
6. "FAIR ZUM TIER!" logo + "Nähere Infos auf fairzumtier.at" + rotated note "* bezogen auf gesetzliche Vorgaben".
7. H1 "TIERWOHL AUS ÖSTERREICH".
8. Checklist (4 items): Zu 100 % von österreichischen Bauernhöfen · Mehr Platz und Bewegungsfreiheit* · Verbot von Vollspaltenböden und Anbindehaltung · 100 % gentechnikfreie Futtermittel (aus Europa).
9. Row 1: Bauchfleisch vom STROHwohlschwein · Gulasch- od. Suppenfleisch vom ALMO-Rind.
10. Row 2: Rinderpfanne vom ALMO-Rind · Faschierte Laibchen.
11. Row 3: Kalbsbrust · BILLA GENUSSWELT Kalbsleber, then footnote 1) "Es handelt sich um eine Beispielpackungsgröße. Artikel sind in unterschiedlichen Packungsgrößen erhältlich." (sits directly under the Kalbsleber cell).
12. Row 4: clever Hendl-Filet · clever Rindsschnitzel.
13. Footer: "Angebote gültig bei BILLA PLUS. Auf [icon] gekennzeichnete Artikel sind keine weiteren Rabatte gültig."

### Products (12)

| # | Name (text layer) | Price | Unit | Old price / discount | Validity | Notes |
|---|---|---|---|---|---|---|
| 1 | Ja! Natürlich Bio-Bachsaibling | 3,99 € (FR–MI) / 3,59 € (DO) | per 100 g | – | Fr–Mi / Do | IN BEDIENUNG; zum Grillen oder für die Pfanne, aufgewachsen in Kärnten, Ferlach, in Aquakultur gewonnen in Österreich; IS' HEIMISCH |
| 2 | Ja! Natürlich Bio-Karpfenfilet | 3,99 € (FR–MI) / 3,59 € (DO) | per 100 g | – | Fr–Mi / Do | IN BEDIENUNG; … in Aquakultur gewonnen in Österreich, aus dem Waldviertel; IS' HEIMISCH |
| 3 | Vårlaks Lachsfilet | 2,99 € (FR–MI, AB 250 G) / 2,69 € (DO, AB 250 G) | per 100 g | BIS 250 G € 4,49 (FR–MI) / € 4,04 (DO) | Fr–Mi / Do | IN BEDIENUNG; in Aquakultur gewonnen in Norwegen; tiered price: under 250 g the "BIS" price applies |
| 4 | Kabeljaufilet | 3,29 € (FR–MI, AB 250 G) / 2,96 € (DO, AB 250 G) | per 100 g | BIS 250 G € 4,49 (FR–MI) / € 4,04 (DO) | Fr–Mi / Do | IN BEDIENUNG; gefangen im Nordostatlantik |
| 5 | Bauchfleisch vom STROHwohlschwein | 6,99 € AB 1 KILO | per Kilo | BIS 1 KILO € 12,79; −45 % | – | IN BEDIENUNG; EXTREM AKTION; ausgelöst, im Ganzen od. geschnitten, natur od. mariniert; Fair zum Tier logo |
| 6 | Gulasch- od. Suppenfleisch vom ALMO-Rind | 14,99 € AB 1 KILO | per Kilo | BIS 1 KILO € 20,99; −28 % | – | IN BEDIENUNG; EXTREM AKTION; im Ganzen od. geschnitten; Almo logo |
| 7 | Rinderpfanne vom ALMO-Rind | 19,99 € AB 500 G | per Kilo | BIS 500 G € 27,99; −28 % | – | IN BEDIENUNG; EXTREM AKTION; bestehend aus: Rindfleisch, Paprika, Zwiebel & Speckwürfeln |
| 8 | Faschierte Laibchen | 1,99 € BEI 3 STÜCK JE | per 150 g Stück (1 kg 19,93 / 13,27) | 1 STÜCK € 2,99; 2+1 GRATIS | – | IN BEDIENUNG; no-further-discount icon; Fair zum Tier logo |
| 9 | Kalbsbrust | 17,99 € | per Kilo | – | – | vom österreichischen Milchkalb, gefüllt, in Selbstbedienung; NUR KURZE ZEIT; no-further-discount icon |
| 10 | BILLA GENUSSWELT Kalbsleber | 6,00 € (Z. B. 200 G¹⁾) | example pack 200 g; per Kilo 29,99 statt 36,99 | statt 7,40; AKTION −1,40 € | – | PREMIUMQUALITÄT; vom österreichischen Milchkalb, geschnitten, in Selbstbedienung; footnote 1) example pack size |
| 11 | clever Hendl-Filet | 6,99 € AB 2 PKG. JE | per 700 g Packung (1 kg 12,99 / 9,99) | 1 PKG. € 9,09; −2,10 € | – | in Selbstbedienung; EXTREM AKTION; badge "Österreichisches HENDL-FILET ZUM EXTREM PREIS – Nur bei BILLA & BILLA PLUS" |
| 12 | clever Rindsschnitzel | 9,59 € AB 2 PKG. JE | per 600 g Packung (1 kg 19,98 / 15,98) | 1 PKG. € 11,99; −2,40 € | – | geschnitten; EXTREM AKTION |

Discount column: `-45 %` / `-28 %` are percentages; `-140`, `-210`, `-240` are absolute euro amounts (−1,40 / −2,10 / −2,40), NOT percentages.

### Headings

- H1: "TIERWOHL AUS ÖSTERREICH" (right zone).
- H2: "JEDEN DONNERSTAG – BIS ZU 10 % AUF FRISCHFISCH & MEERESFRÜCHTE" (sidebar head; "NUR IN BEDIENUNG" is a qualifier, not part of the heading).
- "FAIR ZUM TIER!" is a logo (image), not a heading; "Nähere Infos auf fairzumtier.at" = paragraph/link.
- The 4 checklist items = `<ul>`, not headings.
- Product names are not headings.

### Images

Meaningful:
- Fish photos: whole Bachsaibling (char) with cucumber · pale Karpfenfilet with lemon · orange Lachsfilet with lemon · white Kabeljaufilet with lemon.
- Meat photos: pork belly slices, raw and roasted (Bauchfleisch) · beef chunks and roast (Gulasch/Suppenfleisch) · diced beef with paprika and onion (Rinderpfanne) · three raw meat patties with onion rings (Faschierte Laibchen) · stuffed rolled veal breast (Kalbsbrust) · two veal livers with onion rings (Kalbsleber) · raw chicken fillets (Hendl-Filet) · raw beef cutlets (Rindsschnitzel).

Decorative / repeat text (all image-only unless noted):
- Grass background with a red-white-red Austrian ribbon (top right); blue water sidebar background with anchor, crab and fish watermarks.
- "FAIR ZUM TIER!" logo (large in info block; small on cells 5 and 8). The txt has only "fairzumtier.at".
- "Almo" logo on cells 6, 7 (txt has "ALMO-Rind" only).
- "ja! Natürlich" logo on fish 1, 2; "VÅRLAKS NATURAL SALMON" logo on fish 3 (txt: "Vårlaks").
- "IS' HEIMISCH" heart on fish 1, 2 and on all 8 meat cells.
- "IN BEDIENUNG" blue label × 8 – text present in txt but detached (see quirks).
- "EXTREM AKTION" badge × 5 (cells 5, 6, 7, 11, 12) – "EXTREM AKTION" image-only; the "BIS …", "−x %", "AB …" lines are in txt.
- "2+1 GRATIS" (cell 8): "2+1" in txt, "GRATIS" image-only.
- "AKTION −1⁴⁰ Z. B. 200 G" (cell 10), "NUR KURZE ZEIT" (9), "PREMIUMQUALITÄT" (10) – text present.
- "clever" wordmark appears twice per cell in 11 and 12 (logo top-left + name prefix); txt has "clever" only once per cell → one of the two is image-only (?).
- "BIS ZU" above "10%" in the sidebar head – image-only.
- No-further-discount icon on cells 8 and 9 and in the footer sentence – image-only.

### Tables

- The fish sidebar is the one genuinely tabular structure: 4 products × 2 validity columns. Sensible table: header row = `Produkt | Fr–Mi | Do`; for Lachs/Kabeljau each price cell carries "ab 250 g" plus the "bis 250 g" regular price (or add two more columns `bis 250 g Fr–Mi | bis 250 g Do`). Row header = product name.
- Everything else (2 × 4 meat grid, checklist, badge price boxes) is layout/list, not a data table.

### Text-layer quirks (page-08.txt)

1. **Price fused with the day label**: `399FR – MI` = 3,99 € gültig Fr–Mi; `359DO` = 3,59 € gültig Do (Donnerstag). The sidebar has four such pairs.
2. **Price fused with quantity condition**: `699AB 1 KILO`, `1499AB 1 KILO`, `1999AB 500 G`, `199BEI 3 STÜCK JE`, `299AB 250 G`, `269AB 250 G`, `329AB 250 G`, `296AB 250 G`, `699AB 2 PKG. JE`, `959AB 2 PKG. JE`.
3. **Soft hyphen**: `vom STROH­ wohlschwein` (U+00AD followed by a space). Correct string is "STROHwohlschwein" (page 2 shows it unhyphenated). A naive converter yields "STROH wohlschwein" or "STROH-wohlschwein". Same defect on page 9: `ÖSTER­ REICHISCHE`.
4. **Fish price blocks are separated from their names.** Bachsaibling: `399FR – MI` comes BEFORE the name, `359DO` after it, and immediately after that come Karpfenfilet's `399FR – MI / 359DO` – 20 lines before the Karpfenfilet name. Lachs and Kabeljau: both names appear first (lines 74-85), then one 12-line block of prices (`FR – MI / BIS 250 G € 4.49 / 299AB 250 G / DO / BIS 250 G € 4.04 / 269AB 250 G / FR – MI / … / 329AB 250 G / DO / … / 296AB 250 G`) that must be split 6/6 and assigned Lachs then Kabeljau.
5. "BIS …" regular prices come as a batch before their products: `BIS 1 KILO € 12.79` + `BIS 1 KILO € 20.99` precede both Bauchfleisch and Gulasch; `BIS 500 G € 27.99` precedes Karpfenfilet and Rinderpfanne (it belongs to Rinderpfanne).
6. `IN BEDIENUNG` × 8 are emitted in clusters (lines 18-19-22, 45-46-48, 73, 78) with no link to a product; the product-to-label mapping is lost.
7. Absolute vs percent discounts look alike: `-45 %` (percent, with space) vs `-140` / `-210` / `-240` (euro, −1,40 / −2,10 / −2,40). `600` = 6,00 €.
8. `Z. B. 200 G1)` – footnote marker fused; `statt` / `7.40` on separate lines after `600`; "per Kilo 29.99 statt 36.99" is inline in the Kalbsleber description (the only place with proper decimals).
9. Sidebar order: Karpfenfilet's description sits between Gulasch and Rinderpfanne in the stream; Lachs/Kabeljau descriptions sit between Faschierte Laibchen and Kalbsbrust → a y-sorted or stream-ordered converter interleaves the sidebar with the grid.
10. Hendl badge is split and interleaved: `Österreichisches / HENDL-FILET ZUM / clever / EXTREM PREIS / Nur bei BILLA & / BILLA PLUS` – the "clever" wordmark lands inside the badge sentence; the product's own name line is just `Hendl-Filet` (no "clever" prefix), unlike `clever / Rindsschnitzel`.
11. `10%` without "BIS ZU" (image-only) → the sidebar promise reads as a flat 10 % instead of "up to 10 %".
12. `* bezogen auf gesetzliche Vorgaben` is rotated 90° on the page and lands between the H1 and the checklist in the stream; it refers to the `*` on "Bewegungsfreiheit*".
13. `2+1` with no "GRATIS"; `1 STÜCK € 2.99` precedes `2+1` and the name – single-piece price appears before the product it belongs to.
14. Image-only text (grep-verified absent): "EXTREM AKTION", "GRATIS", "BIS ZU", "FAIR ZUM TIER", "Almo", "IS' HEIMISCH", "VÅRLAKS NATURAL SALMON".
