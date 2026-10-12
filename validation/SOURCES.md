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
