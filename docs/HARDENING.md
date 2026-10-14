# Hardening plan (draft v3, 2026-10-12)

Goal: a pipeline paying customers can rely on, with claims we can defend. Robustness over speed (Andrei, 2026-10-12). This plan replaces PROGRESS step 2 once approved. Drafts v1 and v2 were each challenged by two independent critics; their findings are folded in.

## Why the plan grew
- **Silent price risks that stage 0 could not see.** A CHF or $ price is published as € and counted as auto-checked (`currencyOf` falls back to EUR, the scorer compares cents only). UK and many menu formats are not read at all ("99p", "12,50€", "12.5", "-.99"). Fixed for €, £ and $ in B1 (2026-10-14); CHF still open.
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

A5. **Split** 60 % dev / 40 % sealed test, stratified by type, no document in both halves. Nobody opens the test half until phase C. (Amended below: split by publisher group, about half the pages in test.)

A6. **Baseline** on dev with the stage-0 commit, 3 runs per page. Diagnosis uses dev only.

### A4 and A5 as amended (2026-10-13, after two critics; Andrei's go)
The A4/A5 draft was challenged by two critics (measurement validity, key correctness). What changed and why:

**Split (A5), by publisher group, decided before any page is chosen.**
- Groups: Lidl {06, 10, 11, 27}, Swift {13, 14}, Elddis {15, 17}; every other document alone. A group never sits in two halves (shared templates).
- Test: 07 B&M, 08 Keystore, 09 Kaufland, 12 Landi, 13 + 14 Swift, 16 Coachman, 18 Akash, 21 Café Friedrich, 26 Sanford, 20 scan, 25 fonts without Unicode.
- Dev: 06 / 10 / 11 / 27 Lidl, 15 + 17 Elddis, 19 Sondergeld, 22 LAMH, 24 Savoyen, 23 image flyer; the tuning documents 01–05 are also dev material.
- Coachman and Sanford are in test because they hold the only priced tables outside Elddis; without them "price on the wrong row" would never be measured on test.
- About half the selected pages are test, not 40 %: the claim rests on the test half, so it gets the items it needs. Dev keeps the tuning documents.
- **Not covered by the test half, stated next to every result:** prices printed without a currency, prices set glyph by glyph, text hidden under an overlay (all dev only).

**Page selection, mechanical and seeded** (`packages/eval/src/selection.ts`, `pnpm select-pages`).
- The rules and the plan per document are committed first. The seed is the SHA of that commit, so nobody can steer the draw.
- Facts per page come from the eval's own text reader:
  - amounts with a currency;
  - amounts of any kind;
  - numbers set ≥ 1.8× the page's median height (leaflet prices whose cents or currency are separate glyphs).
- Eligibility:
  - **priced:** single, spread or panels; ≥ 30 words; and one of ≥ 3 currency amounts, ≥ 3 large numbers, or ≥ 3 bare amounts in a document that prints no currency at all;
  - **text:** single, spread or panels; inner page; no amounts and no large numbers; ≥ 150 words;
  - **empty:** no words;
  - **spread:** labelled spread.
- "Fixed" pages carry a trait recorded in `validation/SOURCES.md` before selection:
  - 13 p17: spec table across the gutter;
  - 14 p1: cover spread;
  - 27 p5: overlay; 27 p21: screenshot;
  - 26 p15: image only;
  - 16, 17, 18, 22: both sides;
  - 23: the only page.
- Every selected page is keyed in full (no price-only keys).
- **Replacement:** a page selected as priced whose key has no priced item is replaced by the next ranked page of its document, logged in KEYS.md.
- **Test minimums**, checked after keying:
  - ≥ 150 priced items on grid pages;
  - ≥ 250 priced items in total;
  - ≥ 2 pages with priced tables.
  - If one is missed, the next ranked priced page of each test document is added in plan order, at most 4 pages per document.
- **Spares and reserve:** `validation/selection.json` records, after the drawn pages, the next 3 ranked priced pages of each document as spares (used in order for replacement and top-up), then for each test document the next 3 as the reserve, never rendered or keyed: the unseen pages for a retest if a target is missed.

**Harness before any key** (done 2026-10-13, each with a test):
- **Eval reader fixes:** "+60p", "Price Marked 75p", "0.59 0.99" (two numbers, not one), "-10%" (not an amount), "Fr. 65.–" in running text.
- **Key validation never uses the pipeline's extraction or price reading** (only the shared `canon` text form). It reads words with its own `pdftotext -tsv` call. A printed price is proven by its string, or by euros chained to smaller top-aligned cents (`key-proof.ts`). The euro/cent pair proof from the pipeline is gone.
- **Completeness** (superseded the same day by occurrence claims, below): every amount written as money on the page must be one of:
  - a keyed price;
  - a table cell;
  - required text;
  - listed in `notPrices` with a reason.
  This stops a missing product from hiding a wrong price, or from inventing an "extra".
- **Validator rules for new keys:**
  - reading-order, heading and section anchors occur exactly once;
  - every key page appears in each section order;
  - `sectionOrders` lists other acceptable orders of printed pages;
  - open `disputes` block the freeze.
- **Prices read from the render** (since the second policy review: unreadable occurrences and manual `image` entries): allowed only when the text layer cannot prove the amount. They must be published flagged, in the text or in a flagged picture's alt. Results report how many items are read from the render.
- **Scorer changes:**
  - on a fully keyed page, any other priced product in the output is an error, silent unless flagged;
  - one output cell may hold adjacent key cells;
  - the decisions bound counts each grid page once, at its worst run, over printed pages that carry products.
- **Sealed test keys** live in `validation/sealed/` (gitignored, Andrei keeps the backup); `validation/KEYS.md` holds their hashes. Tests, `pnpm stage0` and `pnpm keys:check` print only problem counts for them (`--details` is for the key writers and Andrei).

**Repair before the rules commit (2026-10-13, after Andrei's review of the key policy and two more critics).**
- **Occurrences, not values.**
  - The eval segments each page's frozen word snapshot into non-overlapping money occurrences (`ledger.ts`): runs of price glyphs on one line, kerned and tracked digits joined, dates and leading-zero numbers excluded, an unmapped glyph making the occurrence unreadable, chained small cents.
  - Writers claim every occurrence exactly once (price, table cell, page text, not a price), so completeness holds by construction and two writers are compared occurrence by occurrence.
  - Checked against renders of Lidl GB p7 (38 occurrences, 10 unreadable "£�.99"), Lidl CH p16 (7), Lidl NL p15 (13): no price missed, no date or size taken for a price.
- **Eval reader:** decimal pence ("16.7p"), unmapped glyphs read as nothing (not as a wrong amount), NFKC superscripts, thousands with spaces and decimals; "59 £" is no longer a price (the pound sign precedes).
- **Key version 3** (`key-schema-v3.ts`, `key-v3.ts`):
  - `optional` prices are gone; uncertain association is a `parent` product;
  - roles add `previousUnit`, `deposit` and `unknown` (reported as "role unverified");
  - conditions replace the qualifier;
  - a readable occurrence overridden as misread stays open until Andrei confirms it;
  - word snapshots are frozen per page with their SHA-256 in the key; a Poppler drift only warns.
- **Scorer:**
  - conditions must be whole phrases of that price's own label, not negated;
  - one constant table says which output roles each key role accepts;
  - each output product answers one key product (an add-on may share its parent's);
  - a product's own prices exclude a nested product's, and text is never read as prices where price elements exist;
  - a price that belongs to no product may appear as an output product at most as often as it is printed;
  - strict tables: `""` must stay empty, unchecked cells are counted, one output table answers a key table, rows match one to one, headers column by column;
  - C1 positions include the offset inside a block.
- **Pre-registration amendments, before any dev or test key exists:**
  - **C3 whole-text coverage is reported, not gating.** It counts the text layer's words found in the output one to one, prices and unmapped glyphs left out, same tokenization on both sides. On the five stage-0 reference runs it is 95–100 %, and the misses are mostly line-end hyphenation, broken ligatures and logo text, so no threshold separates good from bad output. Order is not measured there: the text stream is not reading order, and C1 owns order.
  - **C4 is "product alt names the product (lexical)".** A negation within three words before the name fails it. It is not presented as a rate of correct descriptions. Alt fidelity is scored by hand by Andrei on 30 seeded test alts in phase C (correct / essential detail missing / false information) and reported with its bound (0 of 30 gives 9.5 %), not gating.
  - **"Role unverified"** (prices whose role the output does not show, or that the key leaves open) is reported next to the silent-price headline.
- **Page draw:** `selection.json` records 3 spares per document (replacement and top-up, in order) before the 3 reserve pages of each test document.

**Second review of the key policy (2026-10-13, Andrei).** Fixed before any key exists:
- **Page prices are scored.** A price that belongs to no product must appear in one output block with its amount, its currency and its offer words. Each block answers one page price. A page price printed without a currency, or read from the render, must be flagged (the block or a flagged picture's alt).
- **Manual amounts** cover what the ledger misses, wrongly joins or wrongly cuts, and prices only in the image. They work through `missed`, `split` and `image` entries and `merged` claims; every one is confirmed by Andrei before the freeze. A split's parts are distinct, named by one split each, and cite each of its words once; merged parts, joined in word order, must read as the confirmed whole.
- **One proof for every destination.** Corrections (`value`, `misread`) work the same on product prices, table cells and page prices.
- **Values must be consistent.** Every typed value must read as itself.
- **The ledger is frozen.** Each key page records `ledgerSha256` and each key `pdfSha256`. Loading a key checks them, so validation, runs, rescoring and aggregation all stop on a segmentation change, which needs an explicit key migration.
- **`unknown` with a `reason`** is an accepted, documented uncertainty, distinct from an open dispute.
- **Repeated anchors.** Reading-order entries may name the n-th occurrence of a repeated anchor.
- **Visual reconciliation.** The arbiter and Andrei check each page render with every occurrence outlined, because covering every ledger entry does not prove every price is covered.

**Third review of the key policy (2026-10-13, Andrei).** Fixed before any key exists:
- **Image-only amounts have a place.** Each one gives a `box`. Any occurrence whose centre lies in it must be claimed or corrected instead, so an image entry cannot stand in for a misread or unreadable text price. The same amount elsewhere is another price. No word may be cited twice, within one manual amount or across two.
- **Conditions have provenance.** A condition comes from the text layer, or is read from the render and confirmed by Andrei; a render-read condition puts its price under review (flag duty).
- **Table cells read from the render keep their review duty.** The output row holding one must be flagged; otherwise it is a silent row error.
- **Amounts inside a block are counted one by one.** Two page prices in one sentence each take their own amount; the most specific page price chooses first, and a product shown unflagged keeps its amount without blocking a flagged page price.
- **`pnpm ledger` prints every hash a key needs:** `pdfSha256`, `wordsSha256` and `ledgerSha256`.

**Fourth review of the key policy (2026-10-13, Andrei; plan checked by two critics).** Fixed before any key exists:
- **A page price keeps its offer.** Conditions checked against a whole output block let "60p plus £3.00 for each item" pass for "£3.00 plus 60p for each item". A `text` claim now carries its printed `offer` and the snapshot words it cites; the output must print the offer word for word in one block (amounts by value and currency, sign included, not negated). Two page prices on one line must share their words, so neither can be keyed bare.
- **Proof of an offer is its cited words, not a search.** Leaflets stream a price and its badge in separate flows, so a window around the amount could not find a correct offer and could find a wrong one. Claimed amounts among the cited words read as their claimed values; unmapped glyphs and line-end hyphens are tolerated in the validator only.
- **Words read from the render are judged at their place.** A seen condition or offer is rejected only when a text line within three box heights of its amount prints it; elsewhere on the page it is another offer, and Andrei's confirmation decides.
- **One print, one image amount.** Two image entries of the same amount with overlapping boxes are rejected; different amounts may overlap.
- **Writers can cite words:** `pnpm ledger --details` lists every snapshot word with its index, line and box.

**Fifth review of the key policy (2026-10-13, Andrei; plan checked by two critics).** Fixed before any key exists:
- **Cited words follow the page.** `offerWords` was read in the order given, so "60p plus £3.00 for each item" [2,1,0,3,4,5] and "£3.00 60p" [0,2] were accepted. Now each text block is one unbroken run in order, blocks follow stream order, and every amount on a cited line is cited whole, however it is claimed. Leaving out a line's edge or another block order needs an `offerNote` Andrei confirms; a gap inside a block is never allowed.
- **Running text reads amounts as `readMoney` does.** "CHF 1’200", "£7 500" and "-60p" read as one amount in offers and text, a space group never starts inside a number or runs into a unit ("4711 199,00 €", "£1 500g"), currency codes count after the amount, and a table cell with one amount reads as a price ("2 299,00", "45.–"). Known ceiling: "2 for £5 100 points" reads £5 100.

**Key policy decisions before the first key (2026-10-13, Andrei, after two critics of the writer procedure):** a recommended price (RRP, UVP, Adv. prijs) printed alone is `current` with its label as the condition, `previous` only next to a lower current price; spec values in tables are always `notPrice`; price-list rows are table cells, not products. Clarified: `occurrence: n` counts in reading order; a page with text but no prices is keyed as usual, `unsupported` only without a usable text layer.

**Key writing.**
- **Rules first.** Writers follow `validation/KEY_POLICY.md`, approved by Andrei before any writer runs.
- **Isolated writers.** `pnpm keys:stage --set dev` gives each page a folder outside the repo (`../mia-keys/dev/<doc>-p<NN>/`, plan checked by two critics):
  - `evidence/`, read-only: the PDF (hash checked against the original), an overview and an overlay with every occurrence outlined and the trim box, 300 DPI tiles of at most 1092 px with rulers in PDF points (plain and outlined), a crop per occurrence, the ledger output, the snapshot words by Poppler line (`lines.txt`), a filled key skeleton, the key's JSON Schema, the policy and KEYS.md. No `pdftotext -layout`: it merges columns and suggests orders the validator rejects.
  - `a/` and `b/`: one output folder per writer, each with `run.sh`, the only repo commands it may run (`./run.sh ledger`, `./run.sh check` on its own key). A writer works in its own folder and never reads the other's.
  - The word snapshot is made read-only; `stage.json` (file hashes, evidence hashes, policy and schema hashes, commit) is copied to `validation/private/stage/`, out of the writers' reach, for the audit.
  - Staging refuses uncommitted changes, so the recorded commit reproduces the evidence. An existing page folder is never overwritten; a failed run leaves only a `.partial` folder, which the next run rebuilds.
  Each transcript is audited against an allowlist (its folder, the evidence, `run.sh`); any other path discards the key. The audit compares the key's hashes and the evidence with the record in the repo, not with the folder.
- **Writers run confined** (`pnpm keys:write`, plan checked by two critics and two smoke tests): each writer is its own headless Claude Code process in its folder, with `--safe-mode`, no setting sources, no MCP, no session persistence, auto-memory off and an allowlisted environment; `--permission-mode dontAsk` refuses everything except reading the evidence and its own folder, writing its own `key.json` and running its own `run.sh` (the check, bound to its doc and page with `--expect`). The brief is `validation/WRITER_BRIEF.md`; its SHA-256 goes into each run's audit. Smoke tests: reads of the other writer's folder, the repo and `~/.claude`, other commands and other writes were refused; no CLAUDE.md, memory or hook reached the writer.
- **Audit of every run** (`validation/private/audits/`): the transcript's init (tools, no MCP, dontAsk, model, folder), every tool call against the allowlist (exact `run.sh`, no pipes), a result for every call, no permission denial, a finished run; unchanged evidence and word snapshots; a writer folder holding only `run.sh` and `key.json`; the key on the staged evidence. Any failure discards the key. A rerun archives the earlier key to `validation/private/attempts/`.
- **Reading a key never writes evidence:** validation reads only existing word snapshots, and a key's `doc` must be a document of `split.json` (a key-controlled `doc` named the snapshot path).
- **Pilot 1 (2026-10-13, 5 dev pages × 2 writers, Opus 5.5 high):** 10 runs of 1–3 min, $0.33–1.29 each ($8.1 in all). The audit discarded all ten: seven writers listed the whole page folder with Glob (refused, since it holds the other writer's folder) and three ran `ls`. Their keys agreed on 143 of 147 occurrence claims; the 4 others differ only in the anchor chosen for the same product. Both writers of the Elddis price list disputed the same two gaps, now closed in the policy: a repeated heading names its occurrence, and words in a price cell ("FOC") are its text with nothing to claim. The brief now forbids listing anything outside the evidence and the writer's folder and any shell command but `run.sh`. Keys kept in `validation/private/attempts/dev/pilot-1/`; the pilot reruns on restaged folders.
- **Pilot 2 (2026-10-13, same pages on folders restaged from 496860a):** 10 of 10 audits clean, 0.7–2.8 min and $0.37–1.97 per run ($10.3 in all). All 147 occurrence claims agree (kind, product, role, conditions, cells, page prices) and no writer raised a dispute; the two tables of Elddis p02 were written in opposite order, which the scorer does not score. The 22 differences left are wording: product anchors (5, all on Lidl p17: "Chicken Twists or Calcium Bones Dog Snack" vs "Chicken Twists", "Milk" vs "MILA's World Milk"), multi-part alts (6), section anchors (4 documents) and reading orders (4 pages). Anchors and alts are scored, so the arbiter settles them; a sharper anchor rule in the policy would cut most of them.
- **Before the test half is staged:** a separate root the developer session never lists or reads, counts-only output, transcripts audited by a script, handbacks with a path and counts only, writers launched fresh (never forked).
- **Double entry.** Two independent writers per page; `pnpm keys:compare` lists every difference (plan checked by two critics). A false agreement would let one writer's error into a frozen key, so fields compare in the forms the scorer reads: anchors `loose`, conditions as whole words, offers as tokens (amounts by value and currency), cells `norm` after merged cells are filled, heading levels relative to the top one, alts as their `|` parts; the scorer's view of each product's prices is compared too, as a backstop. Writer-chosen ids are paired, never trusted: manual entries by place (shared words, overlapping boxes) so a value disagreement is one difference, products by the amounts claimed for them (the largest overlap when the writers give one amount to different products), tables by their claimed cells (key order is not scored). Prose (reasons, dispute notes) is not compared; disputes are listed. Keys of different evidence are refused.
- **Arbiter.** It settles only differences it can prove from the 300 DPI crop. Anything uncertain goes to Andrei.
- **No silencing.** Writers never change a key to silence the validator; what they cannot settle goes to `disputes`.
- **Developer sees counts only.** The developer of the phase-B fixes never reads test pages, test keys or the arbiter's notes. Handbacks carry only a path and counts.
- **Andrei checks before the freeze:**
  - every test occurrence on a crop sheet with its claim: amount, role, currency, conditions and product, or why it is not a price;
  - 6 pages structurally (3 dev, 3 test, seeded);
  - the uncertain layout labels (17, 23, 24 p2–4).
  An error he finds triggers a mechanical recheck or his own recheck of that kind of entry, never the same agents again.
- **Test-only formats.** Formats known only from test documents are never copied into unit-test fixtures; fixtures for phase B are synthetic. Their list is kept outside git (`validation/private/`), so this file carries no test-half content. The scorer's reader was fixed for whole-unit prices with a dash and "Fr." on 2026-10-13: that is the measuring tool reading pages correctly, not a pipeline change.

## Phase B — fixes, developed on dev
Deterministic changes are measured by rescoring copies of saved outputs (no model variance). Model-input changes run 3 times per dev page.

B1. **Currency and price formats** (first: it is a silent-price risk).
- The currency is read per price from the cited or adjacent words, with the document currency only as a fallback when the page states it. An unknown currency is an error, never EUR.
- `amountOf` reads "99p", "12,50€", "12.5", "-.99", "£", "CHF", "Fr.".
- Price glyphs set one by one: Poppler returns "1.19" as three words "1", ".1", "9" (the cents split across words) and an old price as "7." "6" "5". Pairing must work on glyph runs, not only on a two-digit cent word.
- Text hidden under an opaque shape is still in the text layer (a product name under a white box); it must not be published as visible content.
- Every format gets a unit test, including cases that must stay in review.
- **Done 2026-10-14 (plan checked by two critics):**
  - Each price takes the currency its words print (€, £, $, EUR, GBP, USD, "99p"); otherwise the page currency, when the page names exactly one currency at least twice; otherwise none, which is a validator error and the printed words are shown. `currencyOf` (any "£" means GBP, else EUR) is gone, so "$12.00" is no longer published as "€12.00".
  - Glyph-set prices join when the pieces touch, share a height and meet at the separator ("£8." + "95", "1" + ".1" + "9"); small cents stay a pair, and a join that would make a third decimal ("1.99" + "²") is refused.
  - Bare digits are shown reformatted (fused cents, "269" = 2,69) only on a page that prints euro/cent pairs; elsewhere they are shown as printed and stay in review, so a menu's "17" is never "£0.17".
  - "$0.125" and "$1.299" are no amounts; one decimal ("£12.5") only next to a currency; "12P" is not pence.
  - Measured: rescoring both saved stage-0 runs changed no validation finding and none of the 140 rendered prices; a UK menu from the outreach list (Carew Inn) went from 7 price errors to 0.
  - Left for later: CHF and "Fr." (on Austrian leaflets "Fr." is Friday, so it never names a currency without a Swiss document), "¢", a trailing sign glued to the digits ("12,50€"), a stated line such as "Alle Preise in €", cited words outside the amount ("2/" before "$5") putting a price in review.
- **B1b (done 2026-10-14): hidden text.** Not from vector shapes: each word is judged on the rendered page (150 dpi) by the ink in its own box, other words' boxes removed; under 0.5 % of pixels off the box's dominant colour (24 per channel) means it draws nothing. A word too covered by neighbours to judge is hidden when it continues a hidden word side by side. More than half a page hidden is treated as a render failure. Hidden words are left out of the model's inventory, the validator's coverage and alt context, and the page; the adhoc report lists them.

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
