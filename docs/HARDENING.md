# Hardening plan (draft v3, 2026-10-12)

Goal: a pipeline paying customers can rely on, with claims we can defend. Robustness over speed (Andrei, 2026-10-12). This plan replaces PROGRESS step 2 once approved. Drafts v1 and v2 were each challenged by two independent critics; their findings are folded in.

## Why the plan grew
- **Silent price risks that stage 0 could not see.** A CHF or $ price is published as € and counted as auto-checked (`currencyOf` falls back to EUR, the scorer compares cents only). UK and many menu formats are not read at all ("99p", "12,50€", "12.5", "-.99").
- **Layout.** A spread cannot be told from a 2-column landscape page by geometry alone: 41 of 48 Pollin pages also have an empty centre. Four of 25 Honda spreads carry tables across the gutter with no word crossing the centre. Trifold menus (DL panels) are not handled at all.
- **Measurement.** 52 priced items gives a 5.8 % upper bound; ~150 items gives ≤ 2 %, ~300 gives ≤ 1 %. Errors cluster by page, so the page-level bound is reported too. The stage-0 held-out pages are now tuning pages. The scorer cannot score a page published as two sections, and review load is not measured by the harness at all.

## Phase A — measurement first (no pipeline change)
A1. **Pre-registration** in this file, before any key exists:
- metrics, targets and decision rule;
- a page passes only at 3 of 3 runs;
- "no regression" means no page drops from 3/3 to ≤ 1/3;
- raw numbers are the headline, adjudicated numbers are reported next to them;
- a key changes only when the page image proves it wrong, logged before rescoring;
- the adjudicator does not know which arm an output came from.

The stage-0 numbers apply to the frozen prompt only (SHA `2db2b21f…`); the old held-out pages become tuning pages (logged key edit flipping `heldOut`).

A2. **Harness changes before keys are frozen** (design reviewed by two critics on 2026-10-13):
- **The scorer grades what a reader gets, not what the pipeline claims.** Amount and currency are read from each price's visible text with an eval-owned parser, independent of the pipeline's `parseMoney`/`amountOf`. `data-amount` is no longer trusted. The plain-text fallback applies only when a container has no price element, and it also checks the currency.
- **Prices keyed per amount:** `{ printed, cents, role (current | previous | unit | discount | any), currency (null = printed without one), qualifier?, optional? }`. Each one is matched to a price element by amount, then role, currency and qualifier are checked. An extra amount is an error, unit prices included when the product keys any. `validateKey` checks `printed` against the raw Poppler text, with no pipeline parser.
- **Flags on the narrowest element.**
  - The renderer marks with `data-review`: the price, the name, the unit, the image, the caption, each list item, paragraph, heading and table row.
  - A product, a product list or a table is marked only for a finding on itself (a grouping doubt).
  - "Flagged" for a price error means the price, its row or an enclosing grouping doubt is marked. This fixes rows never being marked: cell paths are `rows[r][c]`.
- **Pages:**
  - all sections of one key page are merged;
  - a document-level `sections` list (key page, printed label or null, anchors) checks the section count, order, labels and which printed page each anchor lands on, across the whole document (spreads, trifold sides, cover order).
- **Key page fields:**
  - `type`: grid | pricelist | table | text;
  - `scope`: full | prices (price-only keys);
  - `expect`: content | unsupported (scanned pages, imposed sheets);
  - page `mustContain` (zero tolerance; image text marked `seen`, searched in the text and in alt texts);
  - `outsideTrim` (slug text that must not appear; zero tolerance).
- **Manifests:** `validation/split.json` (document → tuning | dev | test) and `validation/layout-labels.json` (every page of every corpus PDF: single | spread | panels | unsupported), both hash-frozen. Keys for dev/test documents must have positional table rows and `printed` on every price.
- **Metrics:**
  - decisions per printed page: distinct product, row or block paths with an error or review finding, plus 1 per page-level finding;
  - C1 counts out-of-order anchors that were flagged;
  - C2 separates price errors (amount, role, currency, qualifier, missing, extra) from text errors.
- **Item definition (2026-10-13):** a priced item is one keyed amount (a product's current and previous price are two items), plus each price cell of a table row that is not a keyed product; spec values without a currency are not prices.
- **Runner:**
  - `--rescore` writes to a copy;
  - `--pages tuning | dev | test | all` reads the split manifest, and `test` needs `--sealed-test`;
  - an aggregator over 3 runs applies the pass rule (3/3) and computes the item bound, page bound and Poisson bound, plus the paired regression rule between two arms.

A3. **Corpus** of public PDFs, each logged in `validation/SOURCES.md`:
- **Retail leaflets** from ≥ 5 retailers: UK (pence, "2 for £5", loyalty prices), Lidl or Aldi DE ("-.99", app prices), a Swiss retailer (CHF), plus BILLA and Pollin with at most 3 pages each.
- **Price lists and menus** from ≥ 3 publishers, including a Canva menu and a scanned menu (the unsupported, not-charged path).
- **Layouts:** spreads from ≥ 3 publishers including Honda; a portrait cover followed by landscape spreads; a trifold with outside and inside panels; a printer PDF with bleed and crop marks.
- **Layout labels:** every page of every corpus PDF is labelled by hand (single, spread, panels), ≥ 150 pages including ≥ 15 single landscape pages, so the detector is measured on its own.

A4. **Keys written blind.** A fresh agent writes them from the page render and the Poppler text only, with no access to `out/` or the pipeline. Alternatives (alt synonyms, optional amounts, acceptable orders) are listed while writing. Then:
- each key is checked against word positions, validated and hash-frozen in `validation/KEYS.md`;
- Andrei spot-checks a sample before the freeze.

Minimum set:
- **Grids:** ≥ 12 pages and ≥ 150 priced items with full keys, plus price-only keys up to ~300 items.
- **Price lists and menus:** 4 pages.
- **Spreads:** 10, of which ≥ 4 are not Honda and ≥ 2 have tables or prices across the gutter.
- **Trifolds:** 2 sides.
- **Text pages:** 4, for regression only.

A5. **Split** 60 % dev / 40 % sealed test, stratified by type, no document in both halves. Nobody opens the test half until phase C.

A6. **Baseline** on dev with the stage-0 commit, 3 runs per page. Diagnosis uses dev only.

## Phase B — fixes, developed on dev
Deterministic changes are measured by rescoring copies of saved outputs (no model variance). Model-input changes run 3 times per dev page.

B1. **Currency and price formats** (first: it is a silent-price risk).
- The currency is read per price from the cited or adjacent words, with the document currency only as a fallback when the page states it. An unknown currency is an error, never EUR.
- `amountOf` reads "99p", "12,50€", "12.5", "-.99", "£", "CHF", "Fr.".
- Price glyphs set one by one: Poppler returns "1.19" as three words "1", ".1", "9" (the cents split across words) and an old price as "7." "6" "5". Pairing must work on glyph runs, not only on a two-digit cent word.
- Text hidden under an opaque shape is still in the text layer (a product name under a white box); it must not be published as visible content.
- Every format gets a unit test, including cases that must stay in review.

B2. **Layout: spreads and panels.**
- **Detection, once per document:**
  - signals: page sizes compared with the other pages, standard half and panel sizes (A5 in A4, DL = A4 landscape / 3), and the folio sequence (n, n+1; top or bottom outer corners; a missing folio inferred from its partner);
  - the user confirms the layout once per document at upload.
- **Inventory order:** by panel (left page, then right; trifold panel order), except bands of shared baselines across the gutter, where rows stay full width so cross-gutter tables keep their cells together. One model call per spread, so cross-gutter tables and photos keep their context.
- **Reading order** comes from the model. Geometry only assigns each block to its printed page. An outer cover spread reads front cover first and back cover last, labelled "Front cover" / "Back cover".
- **Output and review:**
  - a spread is published as two printed pages, labelled with their folios;
  - a heading, paragraph or list that cites words on two pages is flagged.
- **Scope:** right-to-left documents and imposed print sheets are unsupported for now. Extraction uses the TrimBox when it differs from the MediaBox.
- **Billing:** credits by page area (A4 equivalents), independent of the layout flag, so a wrong flag never changes the price.

B3. **Review load.**
- **Bare digits:** a 1–2 digit number with an adjacent same-height currency word counts as a whole amount, but only when the page has no euro/cent pairs anywhere. "€ 399" stays bare digits.
- **Image text** with a digit stays in review. Any exemption is decided on dev and reported on test.
- **Uncovered words** that repeat text already cited are reported but not a review item; spans are matched as whole strings, and a test drops a whole variant on purpose.
- **The prompt stays as is.** A model "uncertain" note is downgraded after the fact only when every price on the item is auto-checked and the item's area holds exactly one amount candidate per role.

B4. **Image budget.** A spread renders at ~138 DPI against ~196 DPI per half. If any row or price regresses on a spread with small cents, send the two halves as two images in one call.

## Phase C — sealed test, once
Both arms on the test half, 3 runs per page: the stage-0 commit (via a worktree) and the hardened pipeline. Only summary lines are read until both arms are scored. Report:
- silent price errors, with item and page upper bounds;
- reading order, table rows and decisions per page;
- results per document type and the layout detector's confusion table;
- cost per page.

Decision by Andrei.

## After phase C
The remaining hardening items:
- visual lines from geometry (Type 3 fonts);
- a corrupt text layer marks the page unsupported and not charged;
- logos rendered as images, with their text as alt;
- a qualifier stays after its amount when printed after it;
- interface strings in the document language;
- scorer amounts in value-set table rows;
- the per-document report.

Then PROGRESS step 3.

## Effort
- Keys: ~3 days.
- Harness: ~2 days.
- Fixes: ~1–2 weeks.
- Model cost: ~$30.

## Decisions (Andrei's go, 2026-10-12; the defaults below were applied and can be overridden)
1. GO condition for spreads: "layout-aware reading order; a spread is published as two printed pages; content crossing the gutter stays whole" (replaces "split into single pages").
2. Review target: mean ≤ 0.5 decisions per grid page, as committed in STAGE0; not moved again.
3. Keys: written by a blind agent (render + Poppler text only), spot-checked by Andrei before the freeze.
4. Corpus covers Switzerland (CHF) and UK retail.
5. Credits by page area (A4 equivalents), independent of the layout flag.

## Pre-registration (A1, 2026-10-12, before any new key exists)
Measured on the sealed test half, 3 runs per page, raw numbers as the headline.
| Metric | Target |
|---|---|
| Silent price errors (wrong amount, role, currency or qualifier, missing or extra price, price on the wrong product or row) | 0; report the item bound 1 − 0.05^(1/n) over distinct items and the page bound over distinct pages |
| Reading order C1 | ≥ 95 % per page; a page passes only at 3/3 runs |
| Table rows (C5) | 100 % of key rows per page |
| Text C3 | ≤ 1 per page; image text containing a digit has zero tolerance (`mustContain`) |
| Product alt C4 | ≥ 80 % per page |
| Decisions per printed page on grid pages (errors + review, by product/row/block, + 1 per page-level finding) | mean ≤ 0.5, one-sided 95 % Poisson bound reported |
| Printed pages (document `sections`) | section count, order, labels and anchor placement all correct (added 2026-10-13, before any new key) |
| Unsupported pages (`expect: unsupported`) | marked unsupported, no content or prices published, not billed |
| axe critical + serious | 0 |
| Layout detector | confusion table over all hand-labelled pages, reported; every layout is confirmed by the user, so no target gates on it |
| Latency | slowest page incl. one retry ≤ 150 s |
| Cost | p90 per printed page reported (feeds pricing, does not gate) |

Decision rule: the engine is ready when every target is met raw on the test half. A key changes only when the page image proves it wrong, logged in `validation/KEYS.md` before rescoring; adjudicated numbers are reported next to the raw ones, never instead. The test half is used once: if a target is missed, the fix is developed on dev and judged on a new sealed set of unseen pages, not on the same test half.
