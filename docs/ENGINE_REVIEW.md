# Engine review — replica by measurement (2026-10-18)

Why: Andrei, 2026-10-18 evening: "every client self-serves and uploads a PDF and must get a REPLICA in HTML"; "think this way about every branch of the engine — colours, fonts, images — otherwise we have solved nothing". This reviews everything built so far against that bar. Evidence: five read-only audits (text, fonts, colour, images, layout and verification), the worst claims checked in the code before being written here.

## Verdict

The engine measures a lot from the PDF (placement, tracking, ink, frames, rules, own fonts), but almost nothing it produces is **checked against the PDF**, many decisions are **tuned on one to three named menus**, the font family is chosen **by name**, and **nothing stops a wrong page from being published**. On an unseen PDF uploaded by a client, we cannot say whether the page is a replica. First-time-right on unseen menus with the current engine: **not measured** (held-out batch 1 was 0 of 9, before the printed view; all 34 documents are now tuning data). The 99 % target has no measurement behind it yet.

## The principle every branch must follow

For each attribute (text, price, face, size, weight, colour, picture, icon, position):

1. **Measure** it from the PDF itself (drawing commands, glyph programs, pixels) — names, lists and per-menu constants are a first guess only.
2. **Verify** the result against the PDF, automatically, in the same rasteriser (pdf.js and our page in one Chromium, `eval/pdfshot.ts`), at a resolution finer than the tolerance.
3. **Gate**: a page whose measures pass ships printed; one that fails a fidelity measure ships its text view (the replica falls back, the content stays right); one that fails a content measure (text, price, icon meaning) is held, never shown as true.
4. **Calibrate** every tolerance on the whole set against Andrei-labelled lines, then **measure first-time-right on menus never seen**.

## Findings by branch (most serious first; file references in the audits, kept in the session record)

### Publication and safety
- Validator errors do not block publication; they only mark `data-review` (html/page.ts). The text view shows the model's `text` whenever the cited word count matches, even when the validator called it a mismatch (html/source.ts `visibleText`).
- No subprocess (pdftotext, pdftohtml, pdftocairo, pdftoppm) has a timeout: an untrusted or huge PDF can hang the worker (pdf/poppler.ts).
- Up to 10 % of words may stay unused after the retry (process.ts MAX_UNCOVERED).

### Text and prices
- The text layer is the truth and the validator checks the model against that same layer: a PDF with no ToUnicode, outlined text or a scan validates as "matching" garbage. Needed: OCR of the render per word box, agreement with the layer measured per page.
- Hidden-word detection (visibility.ts INK_DIFF 24, MAX_HIDDEN 0.5) has no stated source; pale printed text can be silently removed.
- Prices: currencies are a list (€ £ $); `formatMoney` re-typesets the printed amount ("12,50 €" → "€12.50"); non-amounts ("MP", "mkt") are an English list; cents pairing thresholds have no source.
- Ligature repair and drawn letters rest on 2–3 menus each (Gigi, Noah's; K&Z, La Segunda).

### Fonts
- 9 of 10 family decisions come from the font's name (face.ts classOf ~95 substrings, webfonts.ts 21 lookalike regexes, printface.ts stand-ins); only the PDF's own font (ownfont.ts) is measured. An unknown name ("F3", "TT0") falls to a class guess or system-ui.
- Size and weight are measured (facemetrics.ts) only when a lookalike exists; the text view's weight comes from name words or `<b>`.
- fit.ts squeezes (to 0.6) or spreads (0.25 em) a wrong face until it fits its box: it hides a wrong family instead of reporting it.
- Own-font lines are checked for loading and coverage, not for drawing the printed glyph.

### Colour
- Nothing compares the shown colour with the PDF's. Glyph-group `fill-opacity`, soft masks, blend modes, gradient/pattern text fills are not read (svg.ts colourOf, backdrop.ts inks): semi-transparent or gradient text shows wrong.
- The text view replaces colours by rule (near-black → #1a1a1a, descriptions → #555, heading swapped for the band colour, dark pages → fixed palette), and backgrounds/bands are 16-level buckets (±8 per channel).
- backdrop.jpg is JPEG 0.8 (chroma subsampling shifts flat brand fills); no CMYK output profile is passed to Poppler.

### Pictures, icons, backdrop
- Icons are matched to the legend by bounding-box size ±1 pt only (icons.ts sameSize): a same-size bullet can be named "vegan"; equal-size icons silently give no legend. This is a content risk (a false dietary claim).
- The backdrop's glyph removal is never verified by pixels; the Chromium render of the pdftocairo SVG is never compared with the PDF.
- Logo accepted only in the top 35 % (one case, Howies); crops and figure roles rest on named-menu thresholds with no completeness check; alt text is the model's, checked lexically only.

### Layout and verification
- Measured: line placement, baselines, frames, rules, alignment. Thresholds from named menus: columns, masthead, display rule, print widths, small caps.
- Gates today: validator (blind to rendering), fit (geometry only, blind to face/colour/art), check:page (axe; the same-words test compares one DOM under two CSS states), scorer (no menu keys), AI reviewer (uncalibrated: 0 of 6 "ready" where Andrei rated pages very good; still on a Poppler raster).

## What stays (it already follows the principle)
- Words cited by id from the text layer, never typed by the model; the validator's citation discipline.
- Placement per printed line, baselines, tracking from advance widths, frames and rules from the vector layer, own fonts from the PDF's programs, size and weight from glyph metrics, drawn letters marked lost.
- The fit gate's fallback to the text view; one HTML for both views; the review drawn by one rasteriser (pdfshot.ts).

## Plan (order matters: each step makes the next one measurable)

1. **Safety for self-serve** (small): validator errors block what they flag (the text view shows the cited words, never the model's mismatching text; a content error holds the page); every subprocess gets a timeout and a per-page budget with the text view as fallback.
2. **The fidelity measure** (`pnpm fidelity`, revised after both critics): per placed word, PDF vs ours in one Chromium at device scale 3, PNG only; the PDF's ground from a second pdf.js render with text drawing turned off, ours from a capture without the backdrop (alpha = coverage); weight normalised by ink area, size with a pixel allowance, shape per word after alignment, word gaps for spacing, per-word baseline spread (dancing letters), residual ink where the PDF has none (doubled or ghost letters), ink colour clusters; contrast-corrected lines labelled, not failed; path-drawn text and geometry mismatches counted as unmeasured, never as passes. Results in review.html grouped by cause, failures only.
3. **Verify what we cut and match**: backdrop glyph removal checked per word in pixels; Chromium's backdrop checked against pdf.js per cell; icons matched by rendered shape, not size; crops checked for cut edges and foreign words.
4. **Replace name decisions by measurement, judged by step 2**: the family chosen by rendered glyph shape among the library (names as a prior); the weight from the measured stem in both views; colours exact wherever contrast already passes, with glyph opacity, gradients and blend groups read or kept printed; prices shown as printed.
5. **Measure the target**: calibrate tolerances on the whole set against Andrei-labelled lines; lock approved pages as regression tests; run held-out batch 2 (10 menus never seen) once and report first-time-right per branch.

Decision for Andrei: when a client's page fails a measure in self-serve — ship the text view and say so, hold it for us, or ask the client to confirm at upload (DESIGN's proposal) — and whether a held page is charged.
