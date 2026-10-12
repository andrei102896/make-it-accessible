# Stage 0 — quality gate plan (approved 2026-10-12)

## Context
Stage 0 answers one question before any product code: on product grids, does our pipeline (PDF geometry + vision model → structure.json → accessible HTML) reach 0 material price errors where the generic baseline tool had ~100 %? A 12-agent adversarial review of the first plan (5 dimensions × reviewer + skeptic, critic, synthesis) found 3 blockers and ~20 majors. Without these fixes stage 0 would give a wrong or non-reproducible answer, or would lock in choices that break in the MVP (Bedrock, multi-price products, single h1).

## What changed vs the first plan

**Blockers**
1. **Run only on the original PDFs, never on `testdocs/*_3p|_10p|p3p8` extracts.** `pdfextract.sh` uses Apple PDFKit, which re-serializes the document on save and breaks the ligature/glyph mapping: `Kar!ol`, `P!rsich`, `399FR!–!MI`, `%45!%` are in *our* uploaded extract, not the baseline tool's own extraction (reproduced twice). Inputs: BILLA original p1/3/8, Pollin original p1/3/7, Honda original p1/9/11, Stone House, Bannatyne originals. Stage 0 needs no extracts (Poppler takes page ranges on the original); qpdf only if an extract is ever needed again. Baseline correction: BILLA p3 C3 3 → 1; headline 1/15 instead of 0/15; `DO399` stays their error. Verdict unchanged.
2. **Image-only text needs a channel.** The "model only cites runs" rule would silently drop meaning-bearing image text (`BIS ZU`, `GRATIS`, `EXTREM AKTION`, Honda ○ cells). Text = list of segments, each a cited span or `{seen: "…"}`. `seen` is forbidden in product name/price/unit; any `seen` forces needs_review.
3. **The C2 schema had one price per item.** BILLA/Pollin carry day tiers, `ab 2 Pkg je` + single price, old/UVP price, unit price. Item gets `prices[]` with role `current | previous | unit` + cited qualifier.

**Majors**
- Score the **rendered `index.html`** (DOM order, nearest `li/tr/dd` as container), not structure.json — otherwise "price inside item" is true by construction and renderer bugs go unscored.
- **Real held-out grid pages.** Every baselined grid page was a tuning page. Before any prompt exists, write C2 keys for Pollin p5 or p9 and BILLA p2 or p6. Gate is measured on held-out pages only.
- **One money parser in minor units** (`parseMoney`), shared by validator and scorer. Digit comparison accepted `26,9` for 2,69 and rejected `199,-`. Spans may cite a char range inside a run.
- **One text rule**, no edit-distance threshold: `canon()` (NFKC, strip U+00AD, drop whitespace, lowercase) for provenance; `norm()` for scoring. A threshold hides exactly the errors the baseline counted.
- **Coverage check**: uncovered = runs − cited − model-declared `dropped` − overprint duplicates. Uncovered > 0 → needs_review. "Invented = 0 by invariant" was false (stray/duplicated runs pass).
- **Keys carry the page mapping** `{pdf, pdfPage, keyPage}`; run.ts reads pages from the key. Keys use unique verbatim `anchor`s (Pollin: article no.) instead of token-overlap matching; reading order may list alternatives; tables scored as cells; `mustNotAppear`.
- **Keys frozen by sha256 before the first model call**; later edits logged in a "Key changes" table (otherwise the gate is self-graded).
- **Image to the model**: page image only (no per-image crops — BILLA p3 exceeds 20 images, Bedrock 5 MB/image), sized by `fitScale` to the model's pixel budget, JPEG q90. All bboxes in that pixel space.
- **PDF tooling = Poppler CLI via `execFile`** (public poppler-utils, GPL; process boundary keeps licensing clean). `pdftoppm` renders, `pdftotext -bbox-layout` gives word runs with boxes, `pdftohtml -xml` gives font sizes and image positions. One engine for raster and text means one coordinate space (PDF points, top-left, × DPI/72) and the same binaries on macOS and the Linux container. Not used: Quartz/PDFKit (macOS-only, re-serializes), any proprietary wrapper, cpdf (AGPL/commercial). Fallback if the Day-1 checkpoint fails on word boxes: `pdfjs-dist` for text only, Poppler stays for raster. Record the Poppler version in `run.json`; pin it in the MVP container.
- **Output contract**: plain JSON + zod + one retry. No structured outputs / forced tool choice / prefill (not usable on the Bedrock path).
- **Cost estimate withdrawn**: 0.02–0.03 EUR ignored thinking tokens and non-A4 pages; recomputed ~$0.045–0.14/page. Measure effort levels instead of assuming.
- **One document-level structure.json / index.html** — single h1 and doc `lang` are impossible per page.
- **Table cells get `colSpan/rowSpan/header`**, rendered with scope col/row/colgroup/rowgroup (Honda spec table, Bannatyne).
- **Reproducibility**: each run in `out/<runId>/` with `run.json` (prompt sha, keys sha, model, effort, poppler version) and raw responses; assert response model; no fallbacks.
- **Gate rewritten** (see below): cost + latency lines, 3 runs on held-out grids, Opus check before STOP, no narrowing by page type.
- **EU**: Sonnet 5.5 is not in Bedrock Frankfurt as a single region; it's the EU geo inference profile. Request access on Day 0; stage 0 runs on the direct API, cost reported also at Bedrock price.

**Trimmed from the synthesis (overreach, not adopted)**: proximity invariant, "earlier price must be previous" invariant, inverse geometric C4 check, model-as-judge for alt text (manual on ~25 editorial images instead), competitor JSON adapter, Batch API.

## Revised open-decision recommendations
1. **Tagged PDF v1: no.** HTML as declared replacement; guidance text: "remove the PDF and link this page; a PDF left online is assessed on its own" (28 CFR 35.202). Interviews are not scheduled anywhere, so add one onboarding yes/no question "must the original PDF stay downloadable?"; tagged PDF goes on the roadmap if ≥ 40 % say yes, shipped only after veraPDF passes.
2. **Trial**: free checker (no account, no AI) + upload any document, only its first 10 pages are processed (said up front), no card. Result visible in editor + report; **publish/export only on a paid plan** (a partial document can't be a replacement). Pages without a usable text layer marked unsupported, not charged.
3. **Prices**: shape fixed (Starter/Pro monthly, pooled page credits, no rollover, add-ons). Numbers from measured stage-0 p90 (thinking included, Bedrock price), cost/revenue ≤ 25 %. 1 credit = 1 page; pages ≥ ~2× A4 (spreads) = 2 credits. Risk: ≤ 0.05 EUR/page may not hold on dense pages.
4. **Market**: DACH + English (BFSG + Austrian BaFG). Renderer strings localised from stage 0 (published HTML must not leak English into German docs); checker result + report de/en at launch; editor English until ≥ 50 % of trial accounts are German.

## Stage 0 plan

### Files (one tsx package, no framework)
| File | Role |
|---|---|
| `package.json`, `tsconfig.json` | `@anthropic-ai/sdk`, `zod`, `playwright`, `@axe-core/playwright`; system dep `brew install poppler` (apt `poppler-utils` in the MVP container) |
| `src/text.ts` | `norm`, `canon`, `parseMoney` + assert self-checks (`Gold2)`, `Lay’s`, `199,-`, `£7500`, `2`|`69`, `-140`) |
| `src/extract.ts` | `execFile` on `pdftotext -bbox-layout` (word runs `{id:"<pdfPage>:<n>", str, bbox}`, font size from bbox height), `pdftohtml -xml` (font sizes, image positions → filtered/merged inventory), `pdftoppm -jpeg` (model image at `fitScale` DPI, crops for HTML) |
| `src/structure.ts` | zod schema (exports types), model call, parse, one retry |
| `src/validate.ts` | invariants + derived needs_review |
| `src/html.ts` | deterministic renderer, one document |
| `src/score.ts` | DOM scoring + axe + self-check |
| `src/run.ts` | reads page list from `validation/keys/0X.json` |

### structure.json (types from zod)
```ts
type Span = { run: string; from?: number; to?: number }
type Seg = Span | { seen: string }
type Text = { segs: Seg[]; text?: string }
type Image = { ref: string; alt: string | null }            // null = decorative
type Price = { display: string; src: Span[]; role: 'current' | 'previous' | 'unit'; qualifier?: Text }
type Item = { id: string; name: Text; prices: Price[]; unit?: Text; details: Block[]; image?: Image; uncertain?: string }
type Cell = { text: Text; header?: 'col' | 'row'; colSpan?: number; rowSpan?: number }
type Block = { id: string; uncertain?: string } & (
  | { kind: 'heading'; level: number; text: Text }
  | { kind: 'paragraph'; text: Text } | { kind: 'list'; items: Text[] }
  | { kind: 'table'; caption?: Text; rows: Cell[][] }
  | { kind: 'productGrid'; items: Item[] } | { kind: 'figure'; image: Image })
type Doc = { lang: string; title: Text | string; pages: { pdfPage: number; keyPage: number; blocks: Block[]; dropped: string[] }[] }
```

### Invariants (validate.ts)
1. Cited runs exist; `from/to` in range.
2. Non-price text: `canon(text) === canon(joined segs)`.
3. Prices: `parseMoney(display) === money(cited spans)` (large/small font pair = euros+cents; `,-` = whole euros).
4. No `seen` in item name/price/unit.
5. Coverage: uncovered runs → needs_review.
6. Digits in generated alt must appear in the item's cited runs; no `<` or URL; length cap.

needs_review is derived (seen, failed invariant, price rewritten from bare digits, uncovered, `uncertain`), never self-reported.

### HTML
One h1, a section per page (name = first heading + "Seite/Page N"), heading levels page-relative +1; productGrid → `ul role="list"`, one `li` per item with name, prices (previous price labelled with its printed text, never `<s>` alone), qualifiers, details; tables with scope + scrollable focusable region; `esc()` everywhere, no raw HTML, no autolinking; `main`, skip link, reflow CSS.

### Scoring (keys → `validation/keys/0X.json`, hash-frozen)
- **C1** best LCS over alternative orders; report textOnly (competitor convention) and strict.
- **C2** container found by articleNo/anchor; material error if a key amount is missing, an extra amount is present, previous-role set ≠ `old`, or a `mustContain` is missing. Each error tagged silent/flagged. Report n and 95 % upper bound.
- **C3** missing / altered (any diff after `norm`) / invented (`mustNotAppear`, duplicated sentences, contradicting `seen`).
- **C4** product images: name in alt, no placeholder wording; editorial images scored manually.
- **C5** relative heading levels, tables as (rowHeader, colHeader, value) triples, grids as lists.
- **C8** axe critical+serious. **C6** VoiceOver on one grid page + Honda p9, recorded.
- Scorer self-check: a hand-written perfect HTML for one page scores 100 % / 0 errors.

### Cost & latency
`cost.json` per page: input/cache-read/output tokens (thinking included), effort, image size + tokens, wall time, retries, page size, credits, USD + Bedrock figure. Report mean/p50/p90/worst. Levers: effort level → spans-only output → `claude-haiku-4-5` on non-grid pages (only if C1/C3/C5 hold; there is no Haiku 5.5) → lower DPI.

### Order (7 working days)
| Day | Work |
|---|---|
| 0 | `brew install poppler`; correct Kar!ol attribution (PDFKit extract, not the tool) + baseline in RESULTS/PROGRESS/scores; regenerate `png/` from originals with `pdftoppm`; sources table (URL, date, sha256); request Bedrock EU access; write held-out C2 keys (Pollin p5|p9, BILLA p2|p6) |
| 1 | `text.ts` + asserts, `extract.ts`, `fitScale`. Checkpoint on originals: diff `pdftotext` against `validation/text/<original>/` (Karfiol/Pfirsich/Lay’s present, no `!`/`%` glyph corruption), `2`|`39` adjacent runs, Honda ■ glyphs, duplicate pairs, `pdftohtml -xml` image boxes match the page; box overlays on the `pdftoppm` render checked by eye. If `pdftohtml` image boxes are unreliable, the model returns figure bboxes instead |
| 2 | Tuning keys JSON (BILLA p1/3/8, Pollin p1/3/7), hash-freeze all keys, `structure.ts`, `validate.ts`, first call |
| 3 | `html.ts`, `score.ts`; tune on the 6 pages; effort sweep |
| 4 | Keys for Honda/Stone House/Bannatyne (cut order: Stone House → Bannatyne → Honda rows); freeze prompt sha |
| 5 | Held-out: grid pages ×3 runs, others ×1; Opus check if needed; cost/latency report |
| 6 | Adjudicate every C2 event (key/scorer vs real), VoiceOver, verdict in docs/STAGE0.md |

### Gate (held-out pages only; tuning pages reported)
- Per page: C1 ≥ 95 %, C2 = 0, C3 ≤ 1, C4 ≥ 80 %, every key table row correct (added 2026-10-12, before the held-out runs; see the Day 4 log).
- Grid pages: 0 silent C2 errors in each of 3 runs; avg needs_review ≤ 0.5/page.
- C8: 0 critical+serious (else renderer bug → fix, rerun).
- Cost p90 on grids ≤ 0.05 EUR → if over, feeds decision 3, not automatic stop.
- Latency: slowest page incl. one retry ≤ 150 s.
- **STOP** only if silent C2 > 0 on held-out grids with Sonnet *and* Opus. **NARROW** only to a document type where every held-out page passes.
- Verdict line: "0 errors in n products on k unseen pages (95 % upper bound x %)" + "Decision: GO / NARROW / STOP — Andrei, <date>". SPEC rewrite starts only after it.

## Verification
- `text.ts` and `score.ts` self-checks run on every `run.ts` invocation (assert-based).
- Perfect-HTML self-check must score 100 %.
- Day-1 checkpoint asserts on the original PDFs before any model call.
- All runs reproducible from `out/<runId>/run.json` + raw responses.

## Log

### Day 1 — 2026-10-12 (done)
Code: `src/text.ts` (`norm`, `canon`, `parseMoney`, `moneyFromParts`), `src/extract.ts` (`extractPage`, `joinRuns`, `fitScale`, `renderPage`, `popplerVersion`), `src/checks.ts` (`npm run check`: text asserts, checkpoint on the originals, box overlays in `out/checkpoint/`). Poppler 26.10.0.

Results:
- Text layer is clean on the originals: Karfiol, Pfirsich, Lay’s, HENDL-FILET present; no "!"/"%" corruption; Honda p9 ligature words intact ("efficiency", "benefit", "fitted"), 30 ■ glyphs.
- Every BILLA p3 price comes out as a euro run plus a smaller cent run (18 of 18 checked); BILLA p6 `-0` + `10` = −0,10 €.
- Text boxes are exact on BILLA p3, Pollin p5, Honda p9 and the Canva page (overlays checked by eye).
- No overprint duplicates on the checked pages: Poppler already drops them.

Changes to the plan from what we found:
- **Euro/cent pairs are geometric, not stream-adjacent.** On BILLA p3 the stream emits several euro digits before their cents. The validator must pair runs by position (cents directly right of the euros, top-aligned, smaller), not by citation or stream order.
- **Runs are words, and ligatures split words** into touching runs ("effi" + "ciency"). `joinRuns` joins touching runs without a space; `canon` ignores whitespace, so provenance is unaffected.
- **`fitScale` fills the model's pixel budget** (≤ 4784 patches, ≤ 2576 px, ≤ 300 DPI) instead of starting from 150 DPI: small pages (Pollin, 19 cm) now render at ~250 DPI. Image tokens stay capped (~4784 ≈ $0.01 on Sonnet 5.5).
- **`pdftohtml` image boxes are raster bounds, not the visible area.** Good on Pollin (white backgrounds); loose on BILLA (transparent margins overlap the neighbouring cell), Honda and Canva (clipped photos), and Canva backgrounds count as images. The inventory is passed to the model as hints; the figure box comes from the model, in model-image pixels.
- "€ 222,- € 199,-" is on Pollin p1 (cover), not p7.
- Bedrock: not used in stage 0 (no own AWS account yet; the employer's account is out of bounds). Cost is reported at direct-API prices.

### Model access for stage 0 — 2026-10-12
Andrei's Claude subscription (his under contract) runs the stage-0 model calls through Claude Code headless mode, not an API key:
`claude -p --model <id> --effort <level> --system-prompt <ours> --tools '' --setting-sources '' --strict-mcp-config --disable-slash-commands --exclude-dynamic-system-prompt-sections --no-session-persistence --input-format stream-json --output-format stream-json --verbose`, page image as a base64 image block.
- Probed: no CLAUDE.md, hooks or tools leak into the call (224 input tokens for a one-line prompt); a full-budget page image arrives unscaled (~4.27k tokens for BILLA p3 at 1689×2170).
- Cost is computed by us from `usage` at API list prices (Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per MTok), counting `cache_creation_input_tokens` as plain input: Claude Code writes a 1-hour cache on every call and its own `total_cost_usd` is not the production cost. Claude Code's background Haiku calls are excluded.
- Not available this way: `thinking` type (`between_tools`), our own `cache_control` placement. The effort sweep uses `--effort`.
- The MVP needs an API key (customer traffic does not run on a personal subscription); the call lives in one function in `structure.ts` so the swap to `@anthropic-ai/sdk` is local.

### Day 2 — 2026-10-12 (done)
Code: `src/keys.ts` (zod schema, loader, mechanical key validation), `src/structure.ts` (output schema, prompt, model call via Claude Code headless, one retry), `src/validate.ts` (invariants, coverage, derived review), `src/run.ts` (`npx tsx src/run.ts [docs] [--pages tuning|heldout|all] [--only N] [--model] [--effort]`). Keys `validation/keys/01_billa.json`, `02_pollin.json` (tuning p1/3/8 and p1/3/7, held-out p6 and p5), hash-frozen in `validation/RESULTS.md`.

Key validation (runs in `npm run check` and before every run): every reading-order/heading anchor, article number, required string and table cell must exist in the Poppler text; every key amount must be printed on the page (as a euro/cent pair or a separated amount). It caught 4 anchor mistakes and 1 pairing bug before any model call.

Schema decisions made while writing the keys:
- Price roles are `current | previous | unit | discount` (BILLA "AKTION −1,40 €", "−0,10"); C2 compares current/previous/discount amounts, unit prices are checked as required text.
- Table cells may hold priced values, so variant tables (Pollin) are scorable for C2.
- Product names are neither required nor penalised as headings (the BILLA and Pollin keys disagreed); only non-product headings are scored.
- Reading order lists text and image-only text; pictures are scored under C4.
- The model cites run-id ranges (`[[40,42]]`), not single ids; the inventory is sent line by line. Character offsets inside runs were dropped: Poppler words plus whitespace-blind `canon` cover the fused cases.

First run, 6 tuning pages, Sonnet 5.5 at effort medium (`out/2026-10-12T12-17-35-588Z`):
- BILLA p3: all 20 prices correct and attached to the right product, including the column-2 trap that the baseline got wrong; every price verified geometrically from the cited euro and cent words.
- Cost per page $0.03–0.10 for a single call (BILLA p8 $0.10, Pollin ~$0.055); 12–53 s per call. Output tokens dominate (~6k on BILLA p3, ~3.5k of them thinking). Two pages needed a retry, doubling their cost.
- What the checks caught: plain strings instead of text references and omitted empty arrays (schema now defaults `details`/`prices`; prompt shows an example); amount citations that include their label ("UVP* € 7,99") — the validator now reads only the amount words; percentages emitted as prices (prompt rule added); omitted badges ("NUR KURZE ZEIT", Pollin "74,95", "UVP* € 29,95") — surfaced by the coverage check.
- Pairing fix: Pollin badges print "74," large and "95" small; `centPartner` accepts a trailing separator on the euro word.

Open for Day 3: how the gate counts review load. Every `seen` text is a review finding, so Pollin p3 alone has 6 ("REST POSTEN" badges); the 0.5-per-page target is unreachable if transcribed badge text counts. Proposal: count items that need a human decision (uncertain grouping, failed invariant, uncovered words, bare-digit prices) and label `seen` text as "AI-transcribed" in the report instead.

### Decision — review load (2026-10-12, Andrei)
Text read from the image (`seen`) is treated like alt text: labelled "AI-generated" in the report, not sent to review, unless it contains a digit ("BIS ZU 10%", "2+1", "3.000"), which goes to review. Basis: M7 (report separates AI-generated / auto-checked / human-verified) and the existing rule for generated alt text. The gate is not loosened by this: wrong `seen` text still counts under C3 and as a silent error. Both numbers are reported per page (review items, AI-generated items); the 0.5-per-page review target from SPEC §10 remains a proposal and is not moved again.

### Day 3 — 2026-10-12 (done)
Code: `src/html.ts` (deterministic renderer: one document, a section per page, products as `ul role=list`, prices as `span.price[data-role][data-amount]`, tables with scope and a focusable region, `esc()` everywhere, de/en interface strings, crops cut with Poppler), `src/score.ts` (Playwright + axe; C1 longest ordered subsequence over the key's alternative orders; C2 per product container found by article number or anchor; C3 missing/altered/invented; C4 product alt names the product; C5 relative heading levels and table rows), `npx tsx src/run.ts --rescore <run>` (rebuild HTML and scores without model calls), `extract.ts` `groupParagraphs` (lines merged into paragraphs: left or centre alignment, same text size, steady line spacing; right-aligned lines never merged). Scorer self-check: an HTML written from each key scores 100 % on all 8 key pages (`npm run check`).

Bugs found and fixed on the way (each one would have distorted the verdict):
- `joinRuns` glued words in condensed bold fonts ("JEDENDONNERSTAG"); the touching threshold is now 0.02 of the box height (ligature splits are 0 pt apart).
- Euro/cent pairing took the nearest small number in any direction ("13" + "20 Flaschen"); it now requires cents ≥ 30 % of the euro height and picks the closest candidate.
- Scorer: amounts required as text are matched as amounts too ("22.34" = "22,34 €"); amounts written in a product's text count as present (the baseline's "readable and associated" rule); container text uses `innerText` (`textContent` glued "€ 2.99" to "2+1"); the "repeated sentence = invented" rule was removed (products legitimately share text, the perfect-HTML check failed on it).
- Key changes logged in `validation/KEYS.md` (role-free reference prices, optional accessory price, alt synonyms).

Prompt changes from tuning (6 tuning pages only): read columns separated by rules one at a time; top lines first; footnotes stay with their item; every price carries its printed condition; price badges belong to their product; table prices go in cell `prices`; never add words; a percentage is never a price; a price is one amount; every product with a photo gets its image. Parse-time normalisation: a nested product group is flattened into its parent list. Retry once when more than 10 % of the words are neither used nor dropped.

Effort sweep (Sonnet 5.5): `low` fails 3 of 6 pages outright (broken JSON or schema even after the retry) and loses alt text on BILLA p3 (0/20) — not cheaper once retries are counted. `medium` kept.

Tuning results, three medium runs after the paragraph inventory (`out/2026-10-12T13-35…`, `13-43…`, `13-47…`):
| Run | Pages passing C1–C4 | Silent C2 errors | axe critical+serious | Mean $/page | Grid pages (BILLA p3 / p8) | Slowest page |
|---|---|---|---|---|---|---|
| 13-35 | 6/6 | 0 | 0 | 0.086 | 0.081 / 0.108 | 65 s |
| 13-43 | 4/6 (BILLA p3 price ranges, p8 missing images) | 0 (3 errors, all flagged) | 0 | 0.080 | 0.093 / 0.097 | 58 s |
| 13-47 | 6/6 | 0 | 0 | 0.076 | 0.078 / 0.124 | 64 s |

Cost reading: ~$0.08 per page on average and $0.08–0.12 on dense grid pages, i.e. roughly €0.07–0.11, above the €0.05 SPEC target. Per the gate this feeds open decision 3 (prices) rather than stopping. Latency is within the 150 s limit.

### Project setup — 2026-10-12
Restructured into a pnpm workspace before the prompt freeze, behaviour unchanged (rescoring run 13-47 gives identical `score.json` files and a byte-identical HTML).
- `packages/pipeline` (product code: `pdf/`, `text/`, `model/`, `validate/`, `html/`) and `packages/eval` (keys, scoring, runner). Imports go to the defining module through subpath exports; no barrel files.
- Node 26 runs the TypeScript directly; TypeScript 6.0 (typescript-eslint does not support the Go-based TypeScript 7), strict with `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- ESLint 10 strict type-checked + Prettier; `max-lines` 300; type assertions forbidden. Every former cast is gone: PDF extraction, model page structure and Claude Code result events are zod schemas, recursive page types are inferred from the schema.
- Tests with `node:test` (7, incl. the perfect-HTML scorer check and the Poppler checks on the original PDFs, which skip when the PDFs are absent). `pnpm check` runs typecheck, lint, format check and tests.
- Commands: `pnpm stage0 [docs] [--pages tuning|heldout|all] [--only N] [--model] [--effort]`, `pnpm stage0 --rescore out/<run>`.
- Publishers' PDFs, renders, extracted text and competitor output stay out of git.

### Cost round and prompt freeze — 2026-10-12
Levers tried on the 6 tuning pages (Sonnet 5.5, effort medium), each confirmed with two runs:
- **Kept: the model no longer writes price amounts.** Prices are `{src, role?, qualifier?}`; the amount comes from the cited words (`amountOf` in `pdf/runs.ts`: euro/cent pair, else the one word with a separator, else one bare number, otherwise an error) and is formatted with `Intl.NumberFormat` in the page currency. `role` defaults to `current`. A unit test caught a quantity ("(1 kg 22.34)") being glued to the price; fixed before any run used it.
- **Reverted: compact citations** (single word ids next to ranges in one list). The model confused `[23,25]` (two words) with a range, wrote plain strings and broken JSON; 9 of 12 pages needed a retry and Pollin p7 lost 391 of 443 words.
- **Retries:** nested product groups are flattened at parse time; a qualifier example in the prompt stopped "qualifier as plain string" (the most frequent retry after removing the amount).

Result, last two runs (`out/2026-10-12T16-22…`, `16-25…`): 5/6 and 6/6 pages pass C1–C4, 0 silent price errors (one flagged on BILLA p1), axe 0, retries 1 of 6 pages per run, mean **$0.07 per page** (was $0.08), BILLA p3 $0.06–0.07, BILLA p8 still ~$0.11. The saving is ~15 %, below the 30–40 % estimate.

**Prompt frozen** at SHA-256 `2db2b21f9c8dbb4cf1d6ff10c7d50728dc8efaeb5f26ce68a5aa31616132ba5a` (system prompt as sent in run `2026-10-12T16-25-34-432Z`). From here the prompt, schema and validator are not tuned; held-out pages run on this version.

### Unkeyed document test — 2026-10-12
A 28-page Romanian HR brochure (text and portraits, no product grids; the file stays local and out of git) through `pnpm adhoc` on the frozen prompt. Not part of the gate: there is no answer key, so no C1–C5 score.
- 28/28 pages processed, 1 retry, **$1.16 in total ($0.041 per page)**, axe 0 critical / 0 serious. Text-heavy pages are about half the cost of grid pages.
- Read by hand: headings, paragraphs, lists, contacts and portrait alt texts are correct where the text layer is readable.
- **False alarms from the text layer's word order (15 pages, 55 findings).** The PDF uses Type 3 fonts; Poppler reports digits and punctuation ~14 pt above their line, so "pe 21 aprilie 2011," is split across lines and the word ids are out of reading order. The model writes the correct sentence from the image; the provenance check compares with the stream order and flags it. The published text is right, but every such paragraph lands in review.
- **Real failure: a page with a corrupt text layer (p15, 54 % unreadable characters).** The rule "cite words, never type text" forced the model to copy the garbage ("º}¯}Ü¤¤…"); it marked the page uncertain, but the HTML would be unreadable to a screen reader.
- Interface strings fall back to English ("Page 3") on a Romanian document.

Proposed after the held-out runs (the pipeline is frozen until then): rebuild visual lines from geometry when the stream order contradicts it (removes the false alarms); detect an unusable text layer per page and either transcribe it from the image as AI-generated text under review or mark the page unsupported and not charged (plan item G8); interface strings follow the document language.

### Day 4 — held-out keys frozen (2026-10-12)
Keys `03_honda.json`, `04_stonehouse.json`, `05_bannatyne.json` converted from the markdown keys and frozen in `validation/KEYS.md` before any model call on these pages. Every page is held-out. Both Honda tables were rebuilt from word positions and match the markdown key cell for cell (30 ■ on p9, 18 × 22 cells on p11). Harness changes needed to express them, no change to the pipeline: `alt: null` for priced items without a picture; key amounts with a currency sign attached ("£200") count as printed; table header cells are checked word by word. The perfect-HTML scorer test now covers all five keys.

Found while writing the keys, before any run:
- **The frozen pipeline reads no pound price.** Poppler emits "£1,040", "£200" and "£7500" as one word, and `amountOf` only accepts a currency sign as a separate word, so every price on Stone House p4 and Bannatyne p3 comes back unreadable (validator error, flagged). A bare amount next to a printed currency sign would also be marked "read from bare digits".
- **The gate does not score tables.** Per-page pass is C1–C4; table rows (C5) are reported only, so Honda p3/p5 (spec tables) and Bannatyne p3 (both price lists are tables) would pass without their main content being checked. C5 compares rows as text, so a correct price cell rendered as "£7,500.00" does not match the printed "£7500", and the written-amount rule in C2 does not read "£1,225".

Both fixed before any held-out run (Andrei's go, 2026-10-12); prompt unchanged (same SHA):
- **Pipeline:** `amountOf` splits a currency sign printed on the digits ("£7500") into sign and amount; such an amount is not "read from bare digits" (a separate sign next to fused cents still is). Unit test in `runs.test.ts`.
- **Scorer:** a page passes only if every key table row is correct. Rows as wide as the header are checked column by column on the rendered grid (merged cells repeated over their span); a price cell matches the rendered amount ("£7500" = "£7,500.00"); `""` is unchecked. The older BILLA/Pollin keys list some rows as value sets and keep the old row check. Written amounts in C2 now read "£1,225" and "€ 1.299". New scorer test: a ■ moved one column and a wrong price both fail as silent, a rowspan deck cell passes.
- Rescoring both tuning runs (`16-22`, `16-25`) gives identical C1–C5 results and byte-identical HTML.

### Day 5 — held-out runs (2026-10-12)
Frozen prompt, Sonnet 5.5, effort medium. Run 1 (`out/2026-10-12T17-35-03-745Z`): all 11 held-out pages. Runs 2 and 3 (`17-38-47-757Z`, `17-40-38-807Z`): the four documents with prices. 27 page calls, $0.97 in total, 0 retries, 0 failed pages, axe 0 critical / 0 serious on every document. No Opus check: no silent price error appeared.

| Page | Run 1 | Run 2 | Run 3 | After adjudication |
|---|---|---|---|---|
| BILLA p6 (grid, 11 products) | C1 94 % | C1 94 %, C2 4 flagged | C1 94 % | pass ×3 (key errors, below) |
| Pollin p5 (grid, 14 products, 3 tables) | row 5/6 | C1 75 %, C2 1 flagged, C4 11/14, row 5/6 | row 5/6 | pass runs 1 and 3; run 2 fails C1 |
| Stone House p4 (7 priced rooms) | pass | pass | pass | pass ×3 |
| Bannatyne p3 (2 price tables, 20 prices) | pass | pass | pass | pass ×3 |
| Honda p5 (spec table, 18 × 22) | pass, 22/22 rows | | | pass |
| Honda p3 (feature matrix, 12 × 13) | C1 79 %, 12/12 rows | | | fails C1 |
| Honda p1 (cover spread) | C1 88 % | | | fails C1 |
| Stone House p1, p5; Bannatyne p1, p2 | pass | pass | pass | pass |

**Prices: 0 silent errors in 52 priced items on 4 unseen pages, each run 3 times (156 checks); 95 % upper bound 5.8 % per item (rule of three on the 52 items).** Every table cell on the two Honda spec tables (552 cells incl. ■, ○ as "Optional extra", dashes) is in the right column.

Adjudication of every failed check:
- BILLA p6 C1 94 % (all runs): the key orders the "MILDE MUSKAT-SÜSSE" badge before Trauben rot, while its own product table assigns the badge to Trauben weiß; the render shows it on the Trauben weiß photo. The output puts it with Trauben weiß. Key error, output correct; the key is not edited (held-out).
- BILLA p6 C2, run 2: "2€ billiger" / "1€ billiger" were rendered as discount prices (2,00 € with 11,90 → 9,90, consistent) and flagged as bare digits. The key lists them only as text. Correct content, key gap; the rendering "billiger 2,00 €" reverses the printed word order (renderer item for hardening).
- Pollin p5 table row "Polystyrol" (all runs): printed "-,55", rendered "0,55 €" with amount 55. Scorer artifact (older value-set rows compare text, not amounts); prices correct. Marked silent in run 2 only because that table was not under review.
- Pollin p5 C4, run 2: alt texts "Integrierter Schaltkreis PCF8574 …" and "Messgeräte-Prüfleitungen …" name the printed product; the key accepts only "Port" / "Messleitung". Key too narrow, output correct.
- **Real:** Pollin p5 run 2 read the two product columns row by row (C1 75 %); runs 1 and 3 read them column by column. Pollin p5 run 2, Stufenbohrer: the UVP price cited together with the current price, unreadable amount, flagged. Honda p1: the back-cover tagline comes before the front-cover title. Honda p3: legend → headline → table → body copy, the body copy separated from its intro by the table. Both Honda failures are two-page spreads read across the gutter; none of them is flagged for review.
- Manual checks: photo alt texts correct (minor slips: "fountain" for a pond, "willow" for large trees); logos not output at all (HONDA, MEMBER OF EGMF, STONE HOUSE HOTEL); a decorative holly sprig got alt text; MIN/MAX icon letters and the phantom "HRX 537 VYEA" absent.

Other gate lines:
- **Review load missed:** grid pages 2–6 items per page (target ≤ 0.5): image text with digits ("100% österreichisches Frischfleisch"), discounts read as bare digits, and Pollin "model unsure" notes. Text and price-list pages 0–1.
- **Cost:** grid pages $0.052–0.061 (p90 ≈ $0.061 ≈ €0.056, over the €0.05 line, feeds pricing); single text/price-list pages $0.017–0.026; Honda spreads $0.02–0.15 per spread (two printed pages each).
- **Latency:** slowest page 64 s (Honda spec spread), limit 150 s.

Verdict: 0 silent price errors in 52 priced items on 4 unseen pages, 3 runs each (95 % upper bound 5.8 %).
**Decision: GO — Andrei, 2026-10-12.** Conditions, both in the hardening step before the MVP: two-page spreads are split into single pages before processing (both Honda reading-order failures); review rules are cut to items that need a human decision (grid pages are at 2–6 per page). A strict reading of the gate would give NARROW (Pollin p5 failed reading order in one of three runs); GO was chosen because the stage-0 question, price fidelity, is answered.
