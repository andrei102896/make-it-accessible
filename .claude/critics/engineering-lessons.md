# Engineering lessons (curated; newest last within a theme; merge duplicates)

Curated 2026-10-24 from 157 entries: superseded ones (redrawn letters, stand-ins and fit in the printed view, halos,
glyph cutting) dropped, cross-project ones moved to `~/.claude/skills/project-init/references/common-rules.md`. The
full list is in git history.

## Reading the PDF
- Poppler: a word box ends at its last advance without character spacing, in MediaBox space, ascent and descent included; pdftotext splits a printed line per column and can fuse words across a column gap or a leader; pdftohtml keeps weight and style only as nested `<b>`/`<i>` (read with a state, never split at tags), its subset prefixes repeat across fonts, and it always runs with `-i` (12,500 images once left in validation/). (2026-10-15…24)
- pdf.js: Tz sits in `transform[0]`, `view` is the CropBox, ligatures are NFKC-normalised unless `disableNormalization`, /ActualText is dropped (read it before calling text unknowable: Gigi, Noah's), end-of-line items are empty and zero-wide, a multi-letter ToUnicode maps its first letter, and coverage comes from pdf.js' own cmap, not ToUnicode. Its converted fonts are not the PDF's (fsType, names rebuilt): permissions come from the raw program. (2026-10-17…23)
- Two readers agree only through geometry: match a word to the item that prints it, nearest baseline first, taking items that overlap the run (not only those starting in it); a leader counts as one unit, the readers count its dots apart. (Bannatyne "Wedding", Bernie's, 2026-10-18…24)
- pdftocairo draws placed content from `<defs>` through `<use>` with its own transform and clip, so strip definitions by kind, never wholesale; a bbox hides a hole (a ring is a frame, not a panel) and ignores clips; take page-sized fills out before any proximity grouping. (Claudio's, Sarge's, 2026-10-16…17)
- Bytes from a PDF are untrusted even inside a font table: every parse of a program it carries is wrapped, and a failure costs that program, never the document. (2c review, 2026-10-18)
- The text layer can lie: words that draw nothing are never published; a word with no glyph where it stands is printed inside an image; a synthetic run with no glyph is marked and excluded at every matcher keyed by run id or glyph box. (Carew, Stone House, icon runs)
- A per-word measure anchors on the word's first letter (nearest the left edge, drawn last within 0.05 pt); a printed copy or shadow is a letter-by-letter offset of at least two of the word's own glyphs in an ink that shows. (27,795 words measured, 2026-10-18)
- Read pdfinfo's Creator and Producer before naming a producer in code or docs ("Word export" was Apple Pages, 2026-10-18).

## Saved runs and citations
- Saved runs predate newer fields: every new extraction field is optional or defaulted in zod, and the rescore path renders without it.
- Answers cite runs by index: append to an index-cited array, never insert; once an optional step changes the run count, a slow read fails the page instead of falling back (`withWholeWords` Late, 2026-10-24); changing a run's `str` reaches every text matcher (`itemOf`): limit it and measure the whole set.
- Never persist a pure function of saved files; a cache records what its indices refer to and is keyed on the detector's version. (lines.json, Carmine's, 2026-10-16)
- A census read from saved runs sees only what was saved; fields a rerender reads afresh (fonts, colours) come from the source the build reads. (font census, 2026-10-18)

## Validation and prices
- The scorer reads innerText, which includes screen-reader-only text and applies text-transform: never set capitals with CSS, rescore both stage-0 runs identical, and compare innerText (not placement-bearing hashes) to show the text view unchanged.
- The validator and the scorer encode one product decision (prices.ts, mustFlag): change both, or record the gap. Never decide error vs review from the problem text: carry the bucket. A human approval tied to engine output gets a line when it no longer matches. (2026-10-16…22)
- A regex shared as a predicate is anchored, without `g`. A fallback pattern covers only the forms the main parser rejects ("+ 4.50" parsed and lost its mark). A join allowed by a separator needs whole digits on the other side ("9.99" + ".50"). (2026-10-24)
- A price rule written for one market runs on every page that shares the function: check the other market's forms (leaflet "2" + ",69") and run older "not joined" fixtures through a new check; a per-price probe misses list-level effects (withWhole), so verify on rendered text. (2026-10-24)
- Order rules: "not on its line" has two directions (head above reads first, note below after); a word-order hold fits only words whose meaning depends on order ("N for", not sizes); before a mark becomes a separator, check every place the page prints it (Ridgway "~"). (2026-10-24)

## Measuring before and after
- Size a rule by the whole set: tally the class on every document, diff old against new outputs (not a hand-written count), run the rule's own predicates in the probe, check "never happens" on saved structures (holds show only failures), and give a rule added during the visual check the same whole-set count. (2026-10-16…24)
- Check each document's set in the sources file before using it as evidence, and drop verify-sealed slugs before reading out/rebuilt: a judge's list held 4 sealed documents. (add-on round, 2026-10-24)
- A roadmap tick is checked against the open CASES rows of the same documents before it is written. (batch 2, 2026-10-24)

## The round and its fallbacks
- Every catch that degrades a result (a deadline, Text only, a smaller render) prints `DEGRADED` and the result is rerun alone; only load-dependent failures are marked (a parse error would drop a document for good); a deadline resolving null inside a try skips the catch: throw. Sleep is detected by kern.waketime (Node's clocks count through it). (measure, 2026-10-22…23)
- A build folder seeded from the run is judged only by what this run wrote. A file read beside a run is parsed with its owner's `parse*` (never a second schema), a failure is one visible line, never an abort, and a widened catch is checked against what the other reader validates (loose schema made bad `shadows` a silent 0). (2026-10-22…24)
- A step that ran on a few pages and threw becomes an outage on every page: widen its gate and make its failure degrade. A guard treating a failed render as "nothing hidden" covers every judgement made on that render. (2026-10-22…23)

## Backdrops and the browser
- pdf.js keeps references to nodes it put in the tab (SVG filter defs): never clear the container between pages; a missing filter fails the draw. Chromium can stall on soft masks at large scales: every render has a deadline and a fallback. (Kenny p7/p8, Cattlemen's p2, BILLA p6)
- Moving a raster between Poppler and pdf.js moves its frame (crop vs media box): `SAME_FRAME`. Size a raster from the CSS the page ships, never a window width. When the shown render changes, derive every measure from it and list each measure whose ground it was. (2026-10-23)
- Nondeterminism: a hash going back and forth is an open case, not a change; probe every byte at production size with enough draws, take tolerances over all pairs, locate the difference in the raw canvas before the encoded file, hash a stage's output before moving it, read SystemInfo before blaming the GPU (headless already draws in software). (2026-10-22…24)
- A fingerprint taken after a downscale cannot see resolution or encode quality: carry the encoded file's size beside it. A "two rounds show 0 changes" check keeps round 1 (a baseline keyed by tree is overwritten). (2026-10-24)

## Layout and the text view
- Columns: a section's column is where its heading is printed, its items' flow decides its shape; cluster columns by the lists' x-ranges, not heading centres; a rule matched to a heading is bounded by height and horizontal gap; a stroke's thickness follows the axis across the line. (Sarge's, Gargiulo's, Kendells, 2026-10-16)
- Sizes measured from the PDF get limits at both ends per role, a compressed range instead of one cap, and every invariant between roles checked at the clamp minimum (320 px). When the page background becomes measured, recheck every colour checked against white. (2026-10-15)
- Fonts in the text view: embedding any file of a family switches the whole family on; a role-face change shows in the CSS and `@font-face`, not innerText; tally faces per part, not per family; a span gets its own explicit face, never a difference from a guessed base; font names match a vendored family by prefix only before a weight or style word. (2026-10-15…23)
- Poppler hands one RunFont object to every word of a line: a per-word change never mutates it; a measured property gets its own field. Word-level faces cannot show a style change inside a word. (2026-10-23)
- Deleting a module or a class: grep its exported constants and every measure or reset that selects it (rows.ts `GAP`, `main .fi`). An exclusion borrowed from one view can be wrong in the other (`[data-free]`). (2026-10-23)
- A model's box around a small target is loose: match candidates by their share inside it, never IoU alone. Size limits on model output go after parsing. (Moosewood logo, brief details)
- A class name that keys a CSS dedupe map encodes every field its rule reads; a field whose meaning differs by kind (a panel's `color` is its fill, a frame's its rule) is checked at each write site (step 4a, 2026-10-24).
- Scoped overrides that re-emit only some rules flip ties between equal-specificity rules: re-emit the whole tied group in order; a custom property set to `var(--x)` at `:root` resolves there, so set it again where `--x` is overridden (step 4a, 2026-10-24).
- A diff entry that errored backs no total for that document: match by content and rerun before claiming (Kenny, Exeter, step 4a, 2026-10-24).
- A probe imports the rule it sizes, never a hand copy of its predicate; two colours compared for equality come from one renderer, and a value crossing a threshold enters a strictly hashed file only if deterministic (step 4b: pale test without its tint clause; pdf.js ground against Poppler's, 2026-10-24).
- Moving a colour by lightness stops at the threshold, not at the print: "as printed" needs the colour the page draws (Ruth's yellow drawn, black in the text layer; Carew's white drawn, navy in it, 2026-10-24).
- A whole-document test runs on the raw values before per-page filters change how many pages count; and a doc claim is checked against every per-document count in the diff (Carew p1 painted while the docs said not, step 4b, 2026-10-24).
- A pixel verdict on a shape reads only what that shape owns (words go to the smallest fill holding them), and a "touching" grouping built from an overlap test also groups containment and layering: tiles adjoin edge to edge, page-sized shapes excluded (a cream section judged by its white card; a band and its badges taken for texture, step 4c-1, 2026-10-25).
- Changing a shared list (vectors removed or converted) reaches every filter keyed on it: check each for a missing cross-axis bound (`rulesOf` dropped any rule at a frame's height across the whole page, step 4c-1, 2026-10-25).
- A rule over citations decides `dropped` (injected drops write into it) and is sized on the round's own validator; a review is approvable only if `wordsAt` resolves it (no `blocks[n]` in its text), and a new finding reaches rendering and the injection pool, so "rescore/injections same" is measured, never assumed (double-cite rule, 2026-10-25).
- Dropping a label or other field is safe only where the field it merges into is shown as printed: a formatted amount discards the non-digit words it cites ("Bowl 8" price citing "Bowl"; 2026-10-26, Star Inn "125ml").
- Before re-asking a model about disagreements, replay the deterministic matcher on its saved answers: on Durant's the "model errors" were `alignScan` reusing used spans and accepting any span ≥ 0.5 similar (2026-10-26).
- A "0 findings" baseline needs its content checked before it counts as a regression: Durant's and Café l'Europe were untranscribed pages (2026-10-26).
- A ranking hint from the reader being checked must outrank exactness: an exact match elsewhere wins silently, a close one where the item is printed is held (scan areas, 2026-10-26).
- A test of a unit conversion uses a scale ≠ 1, or px and pt mixed up pass (scan areas, 2026-10-26).
