# Held-out answer key — grid pages for the stage-0 gate

Written 2026-10-12, before any pipeline prompt exists. These pages are never used for tuning; the stage-0 grid gate is measured on them only (see `STAGE0.md`).
Sources: `png/<doc>/page-NN.png` (Poppler, original PDFs) and `text/<doc>/page-NN.txt`. Line numbers (`L12`) refer to the txt.
Conventions as in `01_billa.md` / `02_pollin.md`: prices as `X,XX €`; "old" = struck/"statt"/UVP price; amounts in the price columns are the only C2-material values.

Caveat: the person who writes the stage-0 prompt has seen these pages. The guard is that prompts are tuned and frozen on the 6 tuning pages only, and every held-out run is logged.

---

## BILLA PLUS KW41 Wien — original page 6

PDF: `01_billa_plus_kw41_wien.pdf`, pdfPage 6. 11 products (4 Marktküche dishes + 7 produce).

### Reading order
Two zones; either zone may come first (sidebar first or main zone first are both acceptable).

1. Kicker "BILLA PLUS KAUFEN HEISST:" + headline "FÜHREND BEI GEMÜSE AUS ÖSTERREICH UND OBST, DAS BESSER SCHMECKT" (L1–4).
2. Sidebar intro "100 % österreichisches Frischfleisch in der Marktküche." (L5–8), after the image-only "MARKT KÜCHE BILLA" roundel.
3. Sidebar products top → bottom: Nudelpfanne, Faschierte Laibchen, Genuss-Frühstück, Marillen-Palatschinken.
4. Main zone, row by row: Eierschwammerl → Kräuterseitlinge; Cremechampignons → Erdäpfel »Benjamin«; Brokkoli → "MILDE MUSKAT-SÜSSE – SUPER-CRUNCHY" badge (belongs to Trauben weiß); Trauben rot → Trauben weiß.
5. Footer "Solange der Vorrat reicht. … letzten 30 Tage." (L75).

### Products (11)

| # | Name (text layer) | Price | Unit | Old price / discount | Notes |
|---|---|---|---|---|---|
| 1 | NUDELPFANNE mit Kürbis & Hühnerbrust | 9,90 € | – | statt 11,90; "2 € billiger" | badge "100% ÖSTERREICHISCHES FRISCHFLEISCH" (image-only) |
| 2 | FASCHIERTE LAIBCHEN mit Erdäpfelpüree | 8,90 € | – | statt 9,90; "1 € billiger" | same badge (image-only) |
| 3 | GENUSS-FRÜHSTÜCK inkl. einem Heißgetränk nach Wahl & 1 Glas Orangensaft | 7,90 € | – | statt 9,90; "2 € billiger" | |
| 4 | MARILLEN-PALATSCHINKEN | 3,90 € | – | statt 4,90; "1 € billiger" | |
| 5 | Eierschwammerl aus Serbien | 1,59 € | per 100 g | – | no-discount icon (image-only) |
| 6 | Ja! Natürlich Bio-Kräuterseitlinge | 2,79 € | 150 g Tasse (1 kg 18,60) | – | IS' HEIMISCH; no-discount icon |
| 7 | Ja! Natürlich Tiroler Bio-Cremechampignons | 1,99 € | Kl. II, 200 g Packung (1 kg 12,44) | – | print inconsistency: 12,44 €/kg × 0,2 kg = 2,49, not 1,99; key follows the print. IS' HEIMISCH; no-discount icon |
| 8 | Da komm’ ich her! Erdäpfel »Benjamin« | 1,99 € | vorwiegend festkochend, Kl. I, 1,5 Kilo Sack (1 kg 1,33) | statt 2,99; −33 % | "EXTREM AKTION" image-only; badge "NUR FÜR BILLA IN NÖ UND IM BGLD. ANGEBAUT" |
| 9 | BILLA immer gut Brokkoli | 1,49 € | Kl. I, 500 g (1 kg 2,98) | statt 1,59; AKTION −0,10 € | no-discount icon |
| 10 | SanLucar Trauben rot | 3,99 € | kernlos, Kl. I, per Kilo | – | no-discount icon |
| 11 | SanLucar Trauben weiß | 3,99 € | kernlos, Kl. I, per Kilo | – | badge "MILDE MUSKAT-SÜSSE – SUPER-CRUNCHY"; no-discount icon |

C2-material amounts per product: the price, the old price, and the Brokkoli discount −0,10 €. "2 € billiger" / "1 € billiger" are text, consistent with the old price, and must stay with their dish.

### Headings
- H1 (page): "FÜHREND BEI GEMÜSE AUS ÖSTERREICH UND OBST, DAS BESSER SCHMECKT"; the kicker is a paragraph.
- A section heading for the sidebar ("Marktküche") may be inferred from the image-only roundel and must be marked inferred.
- Product names are list content, not headings.

### Text-layer traps (page-06.txt)
1. `ANGEBAUT 199` (L34): the Erdäpfel price is fused to the last word of the badge.
2. Two `199` (L34, L40) for two different products; `statt` / `2.99` (L41–42) follow the Champignons name in the stream but belong to Erdäpfel. Because both prices are 1,99, a swapped price is invisible; the old price is the test: "statt 2,99" on Champignons is a material error.
3. `-010` (L55) = −0,10 €, not −10 % and not 10 €.
4. `399 399` (L71): both grape prices on one line, before the second name.
5. Sidebar prices `990`, `890`, `790`, `390` follow "statt" lines that use a decimal point (`11.90`); unit prices also use a point (`1 kg 18.60`).
6. Image-only: "BILLA PLUS" logo, "MARKT KÜCHE BILLA" roundel, both "100% ÖSTERREICHISCHES FRISCHFLEISCH" badges, "EXTREM AKTION", "IS' HEIMISCH" hearts, "Da komm’ ich her!" logo, 6 crossed-percent no-discount icons.

---

## Pollin "Herbstkracher Mailing 2026" — original page 5

PDF: `02_pollin_herbstkracher_mailing_2026.pdf`, pdfPage 5. 11 product blocks, 14 article numbers.

### Reading order
Left column top → bottom, then right column top → bottom; within the left column the two top products sit side by side (I2C first, then Stufenbohrer).

1. Running line "Tel. +49 (0) 8403 920-920 // Tel. +49 (0) 8403 920-950 Preise in Euro inkl. MwSt." (L1–2) — page furniture.
2. Slogan "Preiskracher für´s Raumklima." (L52) and folio "5" (L53). The slogan heads the right column but is a page slogan; it may come first.
3. Left: I2C/SMBus → HSS-Stufenbohrer-Set → Mini-HiFi-Verstärker → Wurfgleiter (+ table) → Digitaler Wasserzähler.
4. Right: CO2-Monitor → Messgeräte-Prüfleitungen (+ table) → Teflon-Dichtungsband → LED-Fahrrad-Rücklicht → Fahrrad-Scheinwerfer (+ table) → Fahrrad-Scheinwerfer 40028.

### Products (14 article numbers)

| # | Product name (exact) | Article no. | Price € | Old / UVP | Tiers | Notes |
|---|---|---|---|---|---|---|
| 1 | I2C/SMBus Porterweiterung PCF8574 | 42-936 030 | 1,95 | – | – | red badge "1,95" repeats the price |
| 2 | HSS-Stufenbohrer-Set | 42-501 450 | 13,95 | UVP* 19,99 | – | badge "3-teilig" |
| 3 | Mini-HiFi-Verstärker | 42-631 179 | 34,80 | – | – | brand CHILITEC, logo only; "Bluetooth" logo |
| 4a | Wurfgleiter — 1: Polystyrol, 190 mm, 12 Farben | 42-820 847 | 0,65 | – | ab 18 Stück à 0,55; ab 36 Stück à 0,35 | printed `-,65`, `-,55`, `-,35` = 0 euros (leading dash is not a minus); brand eddy toys, logo only (both rows) |
| 4b | Wurfgleiter — 2: Expandiertes Polypropylen, 480 mm, 4 Farben | 42-820 848 | 3,95 | – | ab 5 Stück à 3,50; ab 10 Stück à 2,95 | – |
| 5 | Digitaler Wasserzähler DH-WT004 | 42-871 815 | 9,95 | – | – | brand daygreen, logo only |
| 6 | CO2-Monitor AIRCO2NTROL MINI | 42-592 244 | 29,99 | UVP* 79,99 | – | badge "29,99 / UVP* 79,99 / -63%"; brand TFA logo |
| 7a | Messgeräte-Prüfleitungen — Spitze 2 mm-Standard | 42-830 003 | 4,50 | – | – | table row |
| 7b | Messgeräte-Prüfleitungen — Spitze 4 mm-Kombi | 42-830 004 | 4,50 | – | – | table row |
| 8 | Teflon-Dichtungsband | 42-511 269 | 1,99 | – | – | badge "6 Stück" |
| 9 | LED-Fahrrad-Rücklicht | 42-852 240 | 4,99 | 5,95 (struck, no "UVP") | – | brand Filmer, logo only |
| 10a | Fahrrad-Scheinwerfer — 1: Typ 40025, 30 lux, IPX3, 110x66x35 mm | 42-852 236 | 5,95 | – | – | photo marker 1 |
| 10b | Fahrrad-Scheinwerfer — 2: Typ 40024, 80 lux, IPX4, 110x66x35 mm | 42-852 235 | 12,95 | – | – | photo marker 2 |
| 11 | Fahrrad-Scheinwerfer 40028 | 42-852 239 | 12,50 | – | – | badges "12,50", "70 Lux" |

C2-material amounts: price, old/UVP price, every tier price. The tier quantity ("ab 18 Stück") is the tier's qualifier and must stay with its amount.

### Tables (3)
- Wurfgleiter: columns Material | Spannweite | Farben* | Artikelnr. | €; 2 rows, each with a 3-line price cell (base + 2 tiers); row labels "1", "2" link to the photos.
- Messgeräte-Prüfleitungen: Spitze | Artikelnr. | €; 2 rows.
- Fahrrad-Scheinwerfer: Typ | Lichtstärke | Schutzklasse | Maße (HxBxT) | Artikelnr. | €; 2 rows labelled 1, 2.

### Text-layer traps (page-05.txt)
1. `-,65` (L33) precedes its row (L34); the tier lines follow the row. A parser that treats a leading `-` as a minus gets −0,65 €.
2. `€ 5,95 € 4,99` (L84): the struck old price is distinguishable only in the image (red strike, no "UVP" label); 5,95 is also the price of the next product (10a, L94) — a material error if 5,95 is reported as the Rücklicht's current price.
3. Badges repeat prices away from the price line: `1,95` (L3), `29,99` / `UVP* 79,99` / `-63%` (L54–56), `12,50` (L96).
4. `1 2` (L29, L85) are photo markers, not quantities.
5. `UVP*`: the asterisk's footnote is not on this page.
6. Spelling as printed: "Betriebsspgannung" (L91, typo in source), "für´s" (L52, acute accent).
