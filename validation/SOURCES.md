# Test document sources

All five PDFs were downloaded on 2026-10-12 (11:06–11:16 local time) with curl and a Chrome user agent, directly from the publishers' own websites or CDNs. Public documents, used only for internal quality testing, not redistributed.

| # | File (validation/testdocs/) | Publisher | Document | Source URL | Linked from | Pages | Size |
|---|---|---|---|---|---|---|---|
| 1 | 01_billa_plus_kw41_wien.pdf | BILLA AG, Austria | BILLA PLUS Flugblatt KW41 2026, Wien (valid 08.10–14.10.2026; PDF/X-4 created 2026-09-23) | https://assets-eu-01.kc-usercontent.com/cc0b17b0-a734-010a-8710-f644b7ee1f24/b394245d-ae22-4837-a5a6-0c176c0ddf47/BILLA_PLUS_FB_KW41_2026_Wien.pdf | https://www.billa.at/flugblatt | 16 | 12.7 MB |
| 2 | 02_pollin_herbstkracher_mailing_2026.pdf | Pollin Electronic GmbH, Germany | Herbstkracher Mailing 2026 (created 2026-09-28; Producer = iLovePDF, set by the publisher) | https://www.pollin.de/media/60/7c/d1/1790580038/Herbstkracher-Mailing-2026.pdf | https://www.pollin.de/katalog | 48 | 18.1 MB |
| 3 | 03_honda_uk_lawn_garden_brochure_2019.pdf | Honda (UK) | Lawn & Garden brochure 2019 (dated 2019-04-23; two-page spreads) | https://www.honda.co.uk/content/dam/local/uk/brochures/lawn-garden/uk-lg-brochure-2019.pdf | honda.co.uk brochures section | 26 | 21.7 MB |
| 4 | 04_stonehouse_hotel_christmas_brochure_2026.pdf | Stone House Hotel, Yorkshire Dales, UK | Christmas Package 2026 (PDF CreationDate 2026-06-22) | https://stonehousehotel.co.uk/wp-content/uploads/2026/07/Christmas-Brochure-2026.pdf | https://stonehousehotel.co.uk | 6 | 1.3 MB |
| 5 | 05_bannatyne_hastings_wedding_brochure_2026.pdf | Bannatyne Hotel Hastings, UK | Wedding Brochure 2026 (created 2026-05-30; Producer = Canva) | https://www.bannatyne.co.uk/uploaded/wedding%20brochure%20hst%202026.pdf | https://www.bannatyne.co.uk | 3 | 3.1 MB |

## Integrity (SHA-256 of the files as tested)

| File | SHA-256 |
|---|---|
| 01_billa_plus_kw41_wien.pdf | `af2a76575b7272177445ad44eb39dde7e48a69ce6269082a31d03a9e35151255` |
| 02_pollin_herbstkracher_mailing_2026.pdf | `9c698e0ad04d0f7329d34fd10df34c68ebe168a06674f0c6219892486848699e` |
| 03_honda_uk_lawn_garden_brochure_2019.pdf | `36b1d263e0d101721879c4fee44a614c3f29509df396e9582bc4c72b589be9b6` |
| 04_stonehouse_hotel_christmas_brochure_2026.pdf | `0b59c0582d3fed4538e508af087be4f85de62caea494c9e06260b9d97378e41a` |
| 05_bannatyne_hastings_wedding_brochure_2026.pdf | `70183b97de2b749dc3c8eac8b45e3b6334830f88252238260c7dccc7494dd637` |

## Derived files (not sources)

Made locally on 2026-10-12 with validation/tools/pdfextract.sh (macOS PDFKit page copy):

| File | Pages from original |
|---|---|
| 01_billa_3p.pdf | 1, 3, 8 |
| 01_billa_p3p8.pdf | 3, 8 |
| 01_billa_10p.pdf, 01_billa_10p_small.pdf | 10 pages; page selection not recorded |
| 02_pollin_10p.pdf | 1–10 |
| 03_honda_extract_10p.pdf | 1, 2, 9–16 (original p. 11 = spec table) |

Known defect: PDFKit re-serializes content streams on save, so these extracts carry text-layer corruption the originals do not have ("fi" ligatures and minus signs become "!" / "%"). Run future tests on the original PDFs only; for page subsets use qpdf (qpdf in.pdf --pages . 1,3,8 -- out.pdf).

Renders in `png/<doc>/page-NN.png` are Poppler `pdftoppm -r 150` of the originals, named by original page number (Honda key pages 1/3/5 = original pages 1/9/11).

## Hardening corpus (phase A3, downloaded 2026-10-13)

Public documents from the publishers' own websites or CDNs (never from viewer platforms or aggregators), used only for internal quality testing, not redistributed. Leaflet URLs are replaced weekly; the local copy and its hash are the reference. Retailers that blocked automated download (Aldi, Netto, Penny, Rewe, Edeka, Coop and others) are missing for that reason only.

| # | File | Publisher | Document | Source URL | Linked from | Pages | Why it is in the corpus |
|---|---|---|---|---|---|---|---|
| 6 | 06_lidl_gb_weekly_2026-10-15.pdf | Lidl GB | Lidl Weekly 15–21.10.2026 | https://assets.leaflets.schwarz/leaflets/pdfs/01a11212-848c-74bc-90ef-0f4120ee6dfc/15-10-21-10-Lidl-Weekly-00.pdf | https://www.lidl.co.uk/c/online-leaflets/s10023175 | 31 | UK grid, pence ("99p"), Lidl Plus and unit prices, superscript pence glyphs |
| 7 | 07_bm_christmas_gift_guide_2025.pdf | B&M Retail | Christmas Gift Guide 2025 | https://cdn.bmstores.co.uk/leaflets/2025/2025-10-01-B&M-Christmas-Gift-Guide-2025-om.pdf | https://www.bmstores.co.uk/leaflets | 39 | portrait cover and back + 37 spreads, "2 for £20", contents page |
| 8 | 08_keystore_ks14_offers_2026-10.pdf | Keystore (Scotland) | Offer leaflet KS14, 5–25.10.2026 | https://www.keystore.co.uk/wp-content/uploads/2026/10/KS14-6pp-C.pdf | https://www.keystore.co.uk/offers/ | 8 | 3 mm bleed, mixed page sizes, "Price Marked 75p", "Any 2 for", "£" apart from digits |
| 9 | 09_kaufland_de_prospekt_2026-10-12.pdf | Kaufland | Prospekt 12–17.10.2026 | https://assets.leaflets.schwarz/leaflets/pdfs/01a11579-bf90-7d69-a726-429a516769c9/Prospekt-12-10-2026-17-10-2026-00.pdf | https://filiale.kaufland.de/prospekte.html | 72 | DE grid, unit prices, card prices, print slug codes in the text layer |
| 10 | 10_lidl_de_aktionsprospekt_2026-10-12.pdf | Lidl DE | Aktionsprospekt 12–17.10.2026 | https://assets.leaflets.schwarz/leaflets/pdfs/01a10b7c-7008-7e75-97e6-e1539a9052da/Aktionsprospekt-12-10-2026-17-10-2026-01.pdf | https://www.lidl.de/c/online-prospekte/s10005610 | 73 | text outlined to vectors on 69 of 73 pages (unsupported pages) |
| 11 | 11_lidl_ch_aktuell_kw41_2026.pdf | Lidl Schweiz | Lidl Aktuell KW41, 8–14.10.2026 | https://assets.leaflets.schwarz/leaflets/pdfs/01a0fc8f-b879-79b0-8096-bb0e45ca556f/LIDL-AKTUELL-KW41-8-10-14-10-00.pdf | https://www.lidl.ch/c/de-CH/werbeprospekte-als-pdf/s10019683 | 45 | CHF, glyph-fragmented text ("2 .9 5"), bleed cropped by CropBox, "Ab Fr. 9.10." is a date |
| 12 | 12_landi_ch_themenflyer_heizen_2026.pdf | LANDI Schweiz | Themenflyer Heizen, KW40 2026 | https://www.landi.ch/media/a6c14e9c-9dd0-4dac-8019-288fc9ff8d8d/ivLS8w/PDF/Laden/Aktuell/Themenprospekte/Themenflyer%20Heizen%20DE.pdf | https://www.landi.ch/laden/aktuell/themenprospekte | 12 | "Fr. 65.-", "2449.–", superscript cents on their own line |
| 13 | 13_swift_caravans_2026.pdf | Swift Group | Caravans 2026 | https://www.swiftgroup.co.uk/media/rs5dz3ji/2026_swift_caravan_brochure.pdf | https://www.swiftgroup.co.uk/brochures | 21 | single first/last page + spreads; spec table continued across the gutter |
| 14 | 14_swift_caravan_tech_spec_2023.pdf | Swift Group | Caravan technical specification 2023 | https://www.swiftgroup.co.uk/media/js5p4xok/2023-caravan-tech-spec-booklet.pdf | https://www.swiftgroup.co.uk/brochures | 6 | spreads with a spec table running across the gutter |
| 15 | 15_elddis_motorhomes_2027.pdf | Elddis (Erwin Hymer Group UK) | Motorhomes & Campervans, 2027 season | https://elddis.co.uk/elddis/2026/brochures---downloads/el-28---elddis-brochure-2026-digital-amended.pdf | https://elddis.co.uk/help-support/brochures | 31 | portrait cover and back + A3 spreads; icon-font names in the text layer |
| 16 | 16_coachman_spec_prices_2016.pdf | Coachman Caravan Company | 4pp spec sheet and prices, March 2016 | https://coachman.co.uk/wp-content/uploads/2025/07/specification-and-prices-march-2016.pdf | https://www.coachman.co.uk/downloads | 2 | printer's spreads, crop marks, slug text outside the trim, RRP price list; spec digits with a broken font encoding |
| 17 | 17_elddis_price_list_a3_2027.pdf | Elddis | Motorhome price list A3, 2027 | https://elddis.co.uk/elddis/2026/brochures---downloads/elddis---price-lists-a3---updated-pricing---artwork.pdf | https://elddis.co.uk/help-support/brochures | 2 | bleed and crop marks (MediaBox > BleedBox > TrimBox), price tables |
| 18 | 18_akash_takeaway_trifold.pdf | Akash Indian Restaurant, Southsea | Takeaway menu | https://www.theakash.co.uk/product_images/uploaded_images/akashtakeaway.pdf | https://www.theakash.co.uk/ | 2 | trifold DL panels, outside and inside; "£3.35", "add 50p" |
| 19 | 19_sondergeld_speisekarte_canva.pdf | Hotel-Gasthof Sondergeld | Saisonkarte (Canva) | https://www.gasthof-sondergeld.de/Speisekarte.pdf | https://www.gasthof-sondergeld.de/ | 3 | Canva export, prices without currency ("12,90"), curved headings broken in the text layer |
| 20 | 20_schumanns_wochenkarte_scan.pdf | Schumann's Genusswerkstatt | Wochenkarte 07–11.10.2026 (scanner output) | https://www.schumanns-genusswerkstatt.de/app/download/14079732188/SKM_C250i26100512080.pdf?t=1791196275 (served from the site builder's file host) | https://www.schumanns-genusswerkstatt.de/unsere-speisekarte/ | 2 | scanned, no text layer (unsupported) |
| 21 | 21_cafe_friedrich_speisekarte.pdf | Café Friedrich, Norderney | Speisekarte September 2025 | https://www.friedrich-norderney.de/fileadmin/user_upload/Speisekarte__September_2025_WEB_2.pdf | https://www.friedrich-norderney.de/cafe-restaurant/speisekarte | 3 | LibreOffice menu, "6,50 €", leader dots |
| 22 | 22_lamh_cafe_menu_trifold.pdf | Lanarkshire Association for Mental Health | Food for Thought café menu (Canva) | https://www.lamh.org.uk/wp-content/uploads/2023/08/Menu_.pdf | not found (backup trifold) | 2 | Canva trifold, "+60p", prices apart from items |
| 23 | 23_schnizz_lieferflyer_image.pdf | SCHNIZZ | Lieferflyer March 2026 | https://www.schnizz.de/img/download_lieferflyer_202603.pdf | https://www.schnizz.de/download.html | 1 | folded flyer flattened to one image, no text layer (unsupported) |
| 24 | 24_savoyen_vienna_massage_prices.pdf | Austria Trend Hotel Savoyen Vienna | Massage price list | https://www.austria-trend.at/sav/wellness/documents/de/Austria_Trend_Hotel_Savoyen_Vienna_massage.pdf | https://www.austria-trend.at/de/hotels/savoyen/wellness | 5 | "48,- €", durations, German and English |
| 25 | 25_gasthof_deutsch_speisekarte_2025.pdf | Gasthof Deutsch, Barbing | Speisekarte ab 10.06.2025 (Word) | https://gasthof-deutsch.de/fileadmin/user_upload/speisen_und_getraenke/2025/Web-Speisekarte_ab_10.06.2025.pdf | gasthof-deutsch.de | 5 | fonts embedded without a Unicode map: text present but unreadable (unsupported) |
| 26 | 26_sanford_benefits_2026.pdf | Sanford Health | Employee Benefits 2026 (Word, tagged) | provided by Andrei (local copy) | — | 16 | USD tables, multi-column pages, one page that is a low-resolution image only |
| 27 | 27_lidl_nl_actie_week31_2026.pdf | Lidl Nederland | Actiefolder week 31 2026 | provided by Andrei (local copy; re-exported through a viewing platform, so its text layer may differ from the publisher's original file) | — | 21 | Dutch grid, price glyphs set one by one ("1", ".1", "9"), Lidl Plus, "149.-*", "Adv. prijs", text hidden under an overlay (p5), screenshot page (p21) |

| File | SHA-256 |
|---|---|
| 06_lidl_gb_weekly_2026-10-15.pdf | `6622c0bdcfe600af60bc232ab94d47ebd1d71a99cc3bc40cf1ee1b62a3f2543f` |
| 07_bm_christmas_gift_guide_2025.pdf | `7149078d49e2dddf7dcc4291fcb878107ddcebc221ced50d18ff94a21a8e3210` |
| 08_keystore_ks14_offers_2026-10.pdf | `fd7b09b0137f7407bfde7176f2821870142774ef10ae0a951b5b34a5f04e386e` |
| 09_kaufland_de_prospekt_2026-10-12.pdf | `a1a7def1e97a112d24e8cdb36dc2a456e1fcbb3dafa0e844cd26c3ae6c942ed2` |
| 10_lidl_de_aktionsprospekt_2026-10-12.pdf | `1b875263232360d72bb18ba2231f694f70cd8c7aa7c7fa93e70d0cd76e708fb3` |
| 11_lidl_ch_aktuell_kw41_2026.pdf | `12d6800ce2b280e5f6b52f3725fadba9994cc99db8592dc9575a201c7c250826` |
| 12_landi_ch_themenflyer_heizen_2026.pdf | `e0681191d32acdac05c74c7fab1262d462e8546381f707237012521ae6a8bf8e` |
| 13_swift_caravans_2026.pdf | `f0c8142a8d8507f0af7a08aefc4a610fbfb1b88cdde564b92d1b99b2f815d782` |
| 14_swift_caravan_tech_spec_2023.pdf | `1de0305523b268e86d189898359f8d534ab7471121cea044402a68c77d1d63d2` |
| 15_elddis_motorhomes_2027.pdf | `ced49bc13585ad72faf454e7775d4e3f7786058b4490cd4881ad61ee99b7ee7a` |
| 16_coachman_spec_prices_2016.pdf | `a3c48a5d7a65876f2a4468a512b0633631430e842d7d2111f49d885da8fd8665` |
| 17_elddis_price_list_a3_2027.pdf | `ea96fd317a5a6d6ba652174f353ff660caa8f12aa43c25e7b1f8fe671f2cc4a8` |
| 18_akash_takeaway_trifold.pdf | `db5f8857e279e2e577eb282fa8ac4e80445f96a3927dc8bf72857cccbc2c4278` |
| 19_sondergeld_speisekarte_canva.pdf | `3a0eff4d95d4f8ec327cec542b69034cac7ce70159fab2bd29c409856d70b46e` |
| 20_schumanns_wochenkarte_scan.pdf | `d36d2d69891c6f86d1ca29d1dd1dda8f8567c7facf5ed7360aee05a894a37415` |
| 21_cafe_friedrich_speisekarte.pdf | `e5b856a47dd6b05b58a2edc2c2afa303f66b093c18c2d21b5ac96188f0d1ab2f` |
| 22_lamh_cafe_menu_trifold.pdf | `286d03314f49b49d1e58e6cd54ec86db6c714006a23049e11a9836198d3c5325` |
| 23_schnizz_lieferflyer_image.pdf | `90331f5b92ee557f165686372df1232b458b8aaa13a0c8c17547886876a7e0c8` |
| 24_savoyen_vienna_massage_prices.pdf | `85eb9ba4e4fd0cdcdb51dfa28ac230a2a6474c143606fc4791d950b34400c106` |
| 25_gasthof_deutsch_speisekarte_2025.pdf | `849923f86e172ead08ed7dd046848ed2d749a10ffb42d02d5d6d448ef54f7134` |
| 26_sanford_benefits_2026.pdf | `46db03e800ced73b8cab7986af69cb4afc5810bd3a4963b89a7e506ce0835197` |
| 27_lidl_nl_actie_week31_2026.pdf | `aa143417a5fec2104dc3513ec54a89205896c834ee60c58eca6e15662a80cc8b` |

Pages chosen for a trait in A4 (recorded before the page draw; the draw itself is seeded, `docs/HARDENING.md`):
- 13 Swift p17: the spec table continued across the gutter;
- 14 Swift spec p1: the cover spread;
- 16 Coachman, 17 Elddis price list, 18 Akash, 22 LAMH: both sides (two-page documents);
- 23 SCHNIZZ p1: its only page (image, no text layer);
- 26 Sanford p15: the page that is a low-resolution image only;
- 27 Lidl NL p5: text hidden under an overlay; p21: a screenshot page with no text layer.

Known gaps: no price table that runs across a spread's gutter (only spec tables do: Swift); all spreads with tables come from UK caravan makers; no supermarket loyalty-card prices other than Lidl Plus and Kaufland Card; no Tesco/Sainsbury's/Aldi (no public PDF or download blocked).
