# Answer-key freeze log

Answer keys are frozen by SHA-256 before they are used. Any later edit is logged below with its reason and evidence before a run uses the new key; a held-out key edited after its held-out run fails the gate unless the page image proves the key wrong.

## Frozen keys

| File | SHA-256 | Date | What |
|---|---|---|---|
| `heldout.md` | `226c25e878fbb40c0ca8b76293b55b3f4af6bcde8e3d09419344efb9674e8778` | 2026-10-12 | held-out key (BILLA p6, Pollin p5), written before any prompt existed |
| `keys/01_billa.json` | `b29c9a6c307cd43133e87aab927e5e30195d58c31a3677f20555070842969c3d` | 2026-10-12 | tuning and held-out key in JSON, validated against the Poppler text (anchors, amounts, cells) |
| `keys/02_pollin.json` | `67013fbd7e999d13bacce226a7ce368903b6aef1dfddf0f9bff0f4d340e28425` | 2026-10-12 | tuning and held-out key in JSON, validated against the Poppler text (anchors, amounts, cells) |
| `keys/03_honda.json` | `234630c4e8216671682b26bdcd399101b9452cff7d8fcbf0750112372b23a60b` | 2026-10-12 | held-out (key pages 1/3/5 = PDF pages 1/9/11), from `03_honda.md`; both tables checked cell by cell against word positions |
| `keys/04_stonehouse.json` | `f34cbe875abaa7a9e077fb5805469c18b1ddf5a98c5a6c6f1ef925ffd9238ba4` | 2026-10-12 | held-out (pages 1/4/5), from `04_stonehouse.md` |
| `keys/05_bannatyne.json` | `ae99a29f1dc7424e509a9ad44add6fd1704136cbd65e5349cd9a3fa95810e21e` | 2026-10-12 | held-out (pages 1/2/3), from `05_bannatyne.md` |

Conventions in the held-out keys (written before any model call on these pages):
- Table rows hold every cell in printed column order; merged cells are repeated on each row they span; `""` is a cell that is not checked (empty cells and Honda's image-only ○ markers).
- `alt: null` marks a priced item without a picture (Stone House rooms); C4 does not score it.
- Not scorable mechanically, checked by hand after the run: logo text (HONDA, MEMBER OF EGMF, STONE HOUSE HOTEL) and editorial photo alt text; Honda ○ cells; the Honda MIN/MAX icon letters.
- The Stone House "Suite" anchor carries its price (`Suite: £1,225`), the only unique form next to "Junior Suite".
- Key validation proves each cell exists on the page, not that it sits in the right column; column placement was checked separately against the word positions.

## Key changes after the freeze

| Date | File | Change | Reason | New SHA-256 | Effect on the baseline score |
|---|---|---|---|---|---|
| 2026-10-12 | `keys/01_billa.json` | p1 Präsident 11,99 and the p8 "BIS …" / "1 STÜCK" / "1 PKG." amounts (8 products) get `roleFree`: the amount stays required, its role (current or previous) is no longer checked | conversion error: the markdown key lists these amounts in its "Old price / discount" column, the JSON had them as current prices; the print does not strike them, so both roles are reasonable, and amount plus qualifier ("BIS 250 G") are still checked | `a863425c3a466e9ad53b29c9e31cfd2b513608b5ffa965df5e4dc57acf887397` | none (the baseline was not scored on roles) |
| 2026-10-12 | `keys/02_pollin.json` | p3: the "9V-Block" accessory (1,39 €) moves from the required amounts of its 3 parent products to `optional` | arbitrary conversion choice: the markdown key lists it under the products, not inside them; a separate item right after the parent is as correct for a reader | `a88c40e7e3c51553023f368e0ef01e4fd61e5370080e06f7cb29f9945636d27c` | none (the baseline did not count it) |
| 2026-10-12 | `keys/01_billa.json` | p3 Bio-Erbsen: alt accepts "Erbsen" or "Zarte Mischung"; p8 Kalbsleber: 29,99 / 36,99 (per-kilo price, "statt") become `optional` | the product name is "Bio-Erbsen od. Zarte Mischung" and the photo shows the Zarte Mischung variant; "per Kilo 29.99 statt 36.99" is a printed previous unit price, so the "previous" role is correct | `70af7a3d2326dd0312da838eae2ced0a01d6674e227633b0c0f2cd8a24406d26` | none |
| 2026-10-12 | `keys/02_pollin.json` | p3 BLDC: alt accepts "Treiber" or "BLDC" | "BLDC-Controller" names the same product ("Treiber für BLDC-Motoren") | `91659627cc9617ac8195ea92a33d8b980057655aeb0d83e198c8a4eacefcd48a` | none |
| 2026-10-13 | all 5 keys | schema v2 migration (phase A2, `docs/HARDENING.md`): added document `currency` (EUR for BILLA/Pollin, GBP for Honda/Stone House/Bannatyne) and page `type` (grid, pricelist, table, text); removed `heldOut`. No anchor, amount, row or order changed | the held-out pages of stage 0 are now tuning pages (A1); the scorer checks currency and reports results per page type | `01_billa` `42fdd9e2…`, `02_pollin` `b559a138…`, `03_honda` `44ed4f10…`, `04_stonehouse` `6892ed64…`, `05_bannatyne` `c7ea37f1…` | none on C1–C5 (rescored copies of runs 16-22, 16-25, 17-35, 17-38, 17-40 compared field by field) |

## Manifests

| File | SHA-256 | Date | What |
|---|---|---|---|
| `split.json` | `db33a0ab17cdbea3ea399e32e7244e7dc4b5d9ae9faf98cc5061cf1eda6939ef` | 2026-10-13 | document → tuning / dev / test; the five stage-0 documents are tuning |
| `layout-labels.json` | `f240321cfbdd7fb5f41daef03604cbd7b8e1987a7490cc3f17ce2a9134bc5635` | 2026-10-13 | layout of all 480 pages of the 26 corpus PDFs (351 single, 121 spread, 5 panels, 3 cover), labelled from renders of every page by an agent with no detector; the three outer cover spreads (back cover left, front right) moved from `unsupported` to the new `cover` class before the freeze. Labels the labeller marked unsure: 17 (A3 price list, two designed halves without folios, labelled spread), 23 (flattened flyer, labelled panels), 24 p2–4 (labelled spread) |

Manifest changes after the freeze:

| Date | File | Change | Reason | New SHA-256 | Effect |
|---|---|---|---|---|---|
| 2026-10-13 | `layout-labels.json` | added 27_lidl_nl_actie_week31_2026.pdf: 21 × single (every page viewed as a render) | document added to the corpus after the first freeze; no existing label changed | `4120b2c0570035d4d2d77ba41fa110ff0be7444f66fdf1852ce5d3068c48ba7b` | none |
| 2026-10-13 | `selection.json` | page draw for A4: 53 pages, up to 3 spares per document and up to 3 reserve pages per test document (short documents run out); seed = SHA of the rules commit `17fbff2fa0c26db64fc6543cbad1b96d1f414316` | A4, drawn once with the committed rules before any page was keyed | `e100142cbf54a98ad16fc80ae17f5602ba5ba305af419deebec1133db426604d` | none |
| 2026-10-13 | `split.json` | added the 22 corpus documents 06–27: 12 test, 10 dev, by publisher group (`docs/HARDENING.md`, A4 and A5 as amended); the five stage-0 documents stay tuning | A5, decided before any A4 page is drawn or keyed | `bf932831a5e7f0fe158c916ca509d8a9d2a91291a072172ffc0a171961193773` | none (no dev or test key exists yet) |

Conventions for keys written from 2026-10-13 (schema v2, superseded the same day by version 3 below before any key used it; roles `any`, `qualifier` and `optional` no longer parse):
- Every price is keyed per amount: `printed` as on the page, `cents`, `role` (current, previous, unit, discount, any), `currency` (null only when the document prints none; the output must then flag it), optional `qualifier`. Unit prices are keyed whenever printed.
- Table rows are as wide as the header (positional); `""` is an unchecked cell.
- Image text containing a digit goes into the page `mustContain` as `{ "text", "seen": true }`; slug text outside the trim box into `outsideTrim`.
- Pages that must not be processed (scans, imposed sheets) are keyed `"expect": "unsupported"` with no content.
- Spreads and folded panels list the document's printed pages in `sections` (key page, printed label or null, anchors that must land on that printed page), in reading order.
- From A4 on (2026-10-13), dev and test keys are version 3 (`packages/eval/src/key-schema-v3.ts`) and follow `validation/KEY_POLICY.md`:
  - every money occurrence of the eval ledger is claimed once (price, cell, page text, not a price);
  - unreadable occurrences carry their value from the render;
  - misreads stay open until Andrei confirms them;
  - anchors of the reading order, headings and sections occur once in canon form, unless a reading-order entry names the n-th occurrence it means;
  - open `disputes` block the freeze.
- Each version-3 page records the SHA-256 of its word snapshot (`validation/words/`, or `validation/sealed/words/` for the test half; not in git) and of the ledger built from it; the key records the PDF's SHA-256. Occurrence ids mean what they meant when the key was written: a change in segmentation fails validation and needs an explicit key migration.
- Amounts the ledger does not give are `manual` entries (`missed`, `split`, `image`), each confirmed by Andrei before the freeze.
- Sealed test keys live in `validation/sealed/` (not in git); this file records their SHA-256 at the freeze.
