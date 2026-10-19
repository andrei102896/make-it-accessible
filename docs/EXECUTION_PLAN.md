# Execution plan — from prototype to a self-serve replica (2026-10-18)

Sources: `docs/ENGINE_REVIEW.md` (five internal audits) and an independent review the same evening (read-only, `pnpm check` green, no model calls), whose worst claims were checked in the code: a glyph drawn through a reused SVG definition is cut in every instance (pdf/svg.ts `use` walk keeps the definition's range), a document is built from its successful pages and the failed ones vanish (eval/adhoc.ts), inflated streams accumulate up to 64 MB each with no document budget (eval/streams.ts), image text without digits is published as "generated" (validate.ts), prices and omissions are validated per citation with no check of which dish a price belongs to or whether a dropped word was furniture.

## Definitions (what "right" means)

- **Content right**: every word, price, condition and dietary mark the PDF shows is on the page, attached to the right dish, nothing invented; checked by an evaluator independent of the model and of the text layer.
- **Replica right**: content right, and the printed view ships and passes the fidelity evaluator. A text-view fallback is content right but **not** replica right.
- **First-time-right** is measured per whole document, one conversion, refusals and fallbacks counted as failures, on menus never seen.
- Statistics: with zero failures, a one-sided 95 % lower bound above 99 % needs ≥ 299 independent documents. Ten menus are a pilot, fifty an estimate, three hundred a claim.

## Rules for every phase

- Each task ends with a measure that would have caught the defect on an unseen PDF, a fixture from the case that showed it, and the whole set before/after (no regressions).
- Bugs, decisions and results go in this file, ROADMAP or PROGRESS before the commit.
- Order: what can mislead a diner (content) before what looks different (fidelity).

## Phase 0 — finish the safety slice (in progress)

Done in the working tree, rerender running: the text view shows the model's text only where the validator accepts it; a content error writes `held.json` and preview:add/refresh refuse a held document; every Poppler call and the model call have timeouts measured from the set (6.6 s → 120 s; 161 s → 600 s).
Exit: whole set rerendered, held documents listed, `/reviewer`, commit.
Result (2026-10-18): 10 of 34 documents held (Carew, Carmine's, Gargiulo's, Kenny & Ziggy's, La Segunda, Lexington, Pastabilities, Ridgway, Rucola, Sarge's); 6 of them have published previews, left as last published for Andrei to decide; 14 previews refreshed. The text view now shows the cited words where the model's text is rejected, which surfaced: broken text layers the model had read right (Lexington "Pu s." for "Purchase!", Sarge's "SNAPORAZZO") — phase 3 OCR; a false reject (Pastabilities' "GREENS|", the model rightly dropping a separator) — phase 2 calibration; a faithful gain (Sarge's printed "ENTREÉS" no longer corrected by the model).

## Phase 1 — close publication (~3 d)

1. **Page manifest**: a document lists every PDF page; a page that fails extraction, the model or the build holds the document (no silent drop). Fixture: a PDF with one corrupt page. Done 2026-10-19: buildHtml takes the expected pages (adhoc: the requested range; rerender: every saved page folder, one without structure.json counted missing); a missing page is a held entry (`preview.ts heldOf`, tested); a document where every page failed writes no held.json and reads as held.
2. **Document budgets** in an isolated worker: wall time, memory, pixels, pages, inflated bytes (cumulative, not per stream), pdf.js calls with deadlines; past a budget the document is refused cleanly, nothing publishable written. Fixture corpus: a zip-bomb stream, a 10,000-page PDF, a 200-inch page, a looping content stream. Done 2026-10-19 (after the critic: limits sized on all 66 test documents, menus and leaflets): `pdf/preflight.ts` before any work, from `extractPage` and `pageCount` (every path): file ≤ 300 MB, ≤ 250 pages, each page ≤ A0, the whole document inflated once within 600 MB with every attempt charged (`pdf/streams.ts`, a bomb refused before pdf.js or a model call); visibility pixels bounded by MAX_BUFFER; a page SVG ≤ 64 MB; pdf.js calls under a 60 s deadline with their task destroyed; fixtures generated in the test (pages, A0, bomb, two-stream bomb). 64 of 66 test documents pass in 2.9 s (Hogfish refused as copy-protected, as before); output byte-identical on K&Z, Bannatyne, La Segunda. Since 2026-10-19 (Andrei): at most 10 pages per document (menus and brochures; BILLA's 16 pages and the retail leaflets are refused; stage 0's saved runs rescore unchanged, new runs on leaflets are refused by name). Deferred, recorded: process isolation and a memory cap per document come from the service: AWS Step Functions with a Lambda per page (Andrei, 2026-10-19; `docs/INFRA_RESEARCH.md`), where memory size and the 15-minute invocation limit are set — a page's slowest model call is 161 s; a per-document wall budget (to measure first); a self-referencing form XObject fixture; pdf.js cannot be stopped inside a non-yielding font parse.
3. **Backdrop cuts per instance**: a glyph reached through a reused definition is cut by cloning that instance, never by editing the definition; synthetic fixture: two uses of one definition, one cut, one kept. Done 2026-10-19, simpler than cloning: measured 238 reused definitions holding glyphs on 318 pages of the test documents, 237 drawn at more than one place, and 0 glyph ranges both cut and kept on the 34 rebuilt documents; a shared range is cut only when every instance goes (`backdropSvg`), and a placed word holding an instance drawn elsewhere too stays printed (`sharedGlyphWords`, eval/backdrop.ts loop); synthetic test.
4. **Image text never published unchecked**: `seen` text without digits goes to review (held under the self-serve policy) until phase 3 verifies it by OCR. Done 2026-10-19 with Andrei's decision "hold everything unverified": `unverified()` (validate.ts) = errors + review + words read from the image; `heldOf` holds them; 25 of 34 documents held on the set. It caught a real omission at once: Howies' published page lacks 10 dietary marks on p1 (gluten free, dairy free, vegetarian, vegan, twice "contains nuts"): the saved structure predates the icon reading and cites only part of the icons; a new conversion (one model call) is needed before Howies is shown again.
5. Exit: every adversarial fixture refused or held; zero publishable artefacts with missing pages; the set unchanged where it was right.

## Phase 2 — the independent evaluator, calibrated (~5 d)

Built before any optimisation, so every later change is judged by it.
1. **Fidelity** (`pnpm fidelity`, design after both critics): PDF by pdf.js and our page in one Chromium at device scale 3, PNG only; the PDF's ground from a pdf.js render with text drawing off, ours from a capture without the backdrop; per word: weight (ink per area), size (with a pixel allowance), shape (aligned per word), word gaps, baseline spread (dancing letters), residual ink where the PDF has none (doubled/ghost text), ink colour clusters; contrast-corrected words labelled; path text and geometry mismatches counted as unmeasured.
2. **Content**: an independent reading of the PDF (OCR of the render per word box, plus the vector/raster geometry) reconciled with the published HTML: every printed word present or proven furniture, every price attached to the dish geometry says (nearest name in reading order, same column/frame), every dietary mark matched.
3. **Calibration by injected defects** on the whole set: swap two prices between dishes, drop a warning line, invent a "gluten free", swap two icons, double a line, shift a colour, swap a font, cut a glyph from the backdrop. Report false accept, false reject and the unmeasured share per defect; tolerances frozen only when every injected content defect is caught. Slice A done 2026-10-19 (after the critic): `pnpm inject` (eval/inject.ts, inject-run.ts) refreshes every saved page as the build sees it (eval/refresh.ts, shared with rerender), injects 12 content defects that keep every word covered (price swap, price role, size label swap, table price swap, name swap, heading swap, detail moved to another dish, dish moved to another section, detail/dish/paragraph dropped, icon swapped) and counts a defect caught when a page the gates leave clean becomes held. Baseline with the validator as the only gate: 33 clean pages, 658 defects, **0 % caught for every type**. Every content mechanism of phase 3 joins `GATES` and is judged by this number.
4. Both views evaluated; results in review.html grouped by cause, failures only.
5. Exit: 100 % of injected content defects caught; false reject on Andrei-approved pages below an agreed rate; unmeasured share reported.

## Phase 3 — reconcile content and geometry (~5 d)

1. **Price ↔ dish**: the association checked from geometry and the render, not from the model's grouping; a disagreement is a content error.
2. **Icons by shape**: legend icon and inline candidates rendered and compared (correlation), label only when unambiguous; ambiguity holds the document.
3. **Omissions with proof**: a dropped word must be furniture by measure (page number, repeated running line, duplicate, inside a logo); otherwise an error. Hidden-word detection checked by rendering with and without the word.
4. **Text layer verified**: OCR agreement per word; no ToUnicode, outlined text or scans read from OCR or held; drawn letters filled from OCR of their shapes.
5. **Prices as printed**: the printed string is shown in both views; meaning (amount, currency) kept separately; currency never inferred from "$" alone; currencies and numerals beyond EUR/GBP/USD.
6. **Coordinates canonical**: rotation, CropBox/MediaBox offsets and UserUnit in one transform, verified by overlaying glyphs and images on the PDF render; landscape and mixed-page fixtures.
7. Exit: zero critical content errors accepted on the labelled set; all phase 2 content injections caught by these mechanisms, not only by the evaluator.

## Phase 4 — measured fidelity (~6 d)

1. **Family by glyph shape** among the library (names as a prior); own-font lines checked glyph by glyph against the PDF; shaping, multi-character and non-BMP mappings; scripts beyond Latin.
2. **Weight and size** from measured stems and heights in both views.
3. **Colour exact**: glyph opacity, soft masks, blend groups, gradients/patterns read or kept printed; the text view keeps measured inks wherever contrast passes; backdrop as PNG or JPEG without chroma subsampling; CMYK through the PDF's OutputIntent.
4. **Backdrop and crops verified**: removed pixels only inside the authorised mask, kept ones unchanged; crops checked for cut edges and foreign words; logo found anywhere, not only in the top band.
5. Tolerances re-fitted on the whole set against the evaluator; Andrei-approved pages locked as regression tests.
6. Exit: fidelity pass rate per branch reported on the set, no regression on locked pages.

## Phase 5 — prospective evaluation (pilot ~1 d, then scale)

1. Pilot: 10 menus never seen, one conversion each, whole documents, evaluator verdicts plus Andrei's eye; first-time-right reported for content and replica separately.
2. Estimate: 50 menus from different restaurants and templates (sourced from the outreach lists and public menu PDFs, US/UK first).
3. Claim: ≥ 299 independent documents for a 99 % lower bound, run when phase 4 is stable (model cost to be estimated from cost.json before running).
4. Every failure grouped into a pattern, fixed under the phase rules, never tuned on the evaluation menus themselves (a fixed menu leaves the evaluation set).

## Order and dependencies

Phase 0 → 1 → 2 → 3 → 4 → 5. Phase 2 comes before 3 and 4 because every later fix is judged by it; icons and price association (phase 3) come before fonts and colour (phase 4) because they can mislead a diner. The ROADMAP "Now" items fold into these phases; Step 3–5 work (lettering, page colour, arrangement) continues only through phase 4's measured mechanisms.
