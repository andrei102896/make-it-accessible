# Make It Accessible — Progress

Last updated: 2026-10-16. Read this first in every new session.

## Status
Stage 0 verdict GO (Andrei, 2026-10-12); hardening (`docs/HARDENING.md`) reached A4 and is paused since 2026-10-14 for a demand test: is there a buyer at all? 56 cold emails sent 14–15 Oct (UK pubs and restaurants, US agencies and restaurants; lists and templates in `outreach/`, gitignored); one real reply (Kendells Bistro, Leeds), whose page is a private preview; Andrei's reply with the price goes out on 2026-10-16. Meanwhile the page became the brand's own (fonts, colours, sizes, rules and ornaments measured from the PDF; `docs/DESIGN.md`). On 2026-10-16 Andrei set one price ($29 / £25 a month per venue, updates included) and the target (independent restaurants with a PDF menu, New York and Florida first); see Decisions. Next: a wave of 20 NY/FL restaurants, each email linking its page already made; follow-ups to the first 56 on 19–21 Oct; continue or rethink at the thresholds in `outreach/emails.md`. Hardening, the SPEC rewrite and the MVP resume only after that.

Tracker: `docs/ROADMAP.md`. Current plan: `docs/HARDENING.md` (decisions and pre-registration recorded 2026-10-12).

## What exists in this folder
- `AGENTS.md`, `README.md` — session bootstrap (rules, definition of done) and architecture map. Code lives in `packages/pipeline` (product) and `packages/eval` (stage-0 harness).
- `docs/SPEC.md` — full product spec (v1, pre-review). Needs the rewrite described below.
- `docs/VALIDATION.md` — validation protocol (criteria C1–C9, thresholds, decision matrix).
- `docs/CLIENT_FLOW.md` — agreed client flow (free check → trial with the first 10 pages → review → report → publish on paid plans → billing); input for the SPEC rewrite.
- `docs/LAYOUT.md` — the layout fidelity plan (2026-10-16, after Andrei stopped the review of the first US batch): segments, columns, title scale, fonts, frames, reviewer.
- `docs/WORKFLOW.md` — the optimisation and automation plan (2026-10-16): one command per recurring job (previews, batch report, outreach drafts, guards), measured times, what we track.
- `docs/DESIGN.md` — how converted pages should look per document type (menu, retail, price list, brochure), the AI brief that picks the template, theme and type rules, with research sources.
- `docs/COSTS.md` — verified fixed and per-page costs (production vs minimal), Paddle, profit per plan, break-even, the NAT decision, what is not calculated.
- `docs/STAGE0.md` — approved stage-0 plan (quality gate), revised after an adversarial review; includes the recommendations for the 4 open decisions.
- `validation/KEYS.md` — answer-key freeze hashes and the log of every key change.
- `validation/private/` (local only, not in git) — test results against the generic tools (Tool A, Tool B), per-page baseline scores, competitor notes and their raw output.
- `validation/0X_*.md` — ground-truth answer keys for 5 public documents (3 pages each): reading order, products with prices/units, headings, images, text-layer traps.
- `validation/heldout.md` — held-out answer key (BILLA p6, Pollin p5) for the stage-0 grid gate; never used for tuning; hash frozen in `validation/KEYS.md`.
- `validation/SOURCES.md` — test PDFs: publisher, source URL, download date, SHA-256; derived extracts listed separately.
- `validation/png/` — Poppler renders (150 DPI) of the keyed and held-out pages, from the originals.
- `validation/testdocs/` — the 5 public PDFs plus the extracts actually uploaded (`01_billa_3p.pdf` = pages 1,3,8; `02_pollin_10p.pdf` = pages 1–10; `03_honda_extract_10p.pdf` = pages 1,2,9–16). The extracts were cut with PDFKit and have a damaged text layer: never use them as pipeline input, only the originals.
- `validation/text/` — PDF text layer per page (PDFKit), one txt per page.
- `validation/tools/` — `pdftext.sh`, `pdfrender.sh` (page → PNG via Quartz, no poppler needed), `pdfextract.sh` (page subset → new PDF; lossy, PDFKit breaks the glyph mapping — use `qpdf --pages` if an extract is ever needed). PNG renders were not kept; regenerate with `pdfrender.sh <pdf> <outdir> <first> <last> [dpi]`.

## Key findings (evidence in validation/private/, local only)
1. Generic tools fail on designed documents: the best-known generic tool we tested (Tool A) passed 1/15 page×criterion cells and 0 pages on two retail catalogs (reading order 50–83 % vs ≥ 95 % needed; price attached to the wrong product or unreadable on 36/36 BILLA and 28/37 Pollin products; tables not recognized). On a Canva brochure its output had zero text (1 heading + 164 empty figures).
2. Layout-preserving tagged PDF does not exist for documents with images, free or paid ("text-only, born-digital documents"; keep-layout attempts failed in the account too).
3. 4 of 5 public marketing PDFs have no structure at all; the Canva one has meaningless tags (164 figures, no tables).
4. Competitors are small, self-serve, priced per document or credit, and none targets catalogs; one lets itself train AI on customer content (positioning point for us). Names and prices: `validation/private/COMPETITORS.md`.
5. Regulation: EAA enforceable since 2025-06-28 (B2C services; microenterprises providing services exempt); BFSG warning letters in Germany (amounts unverified); ADA Title II deadlines 2027-04-26 (50k+) / 2028-04-26; FTC consent order against accessiBe ($1M) over compliance claims — never claim "compliant".

## Decisions made
- Product: upload a designed PDF (catalog, leaflet, brochure) → accessible HTML as the primary output + honest per-document report; review editor before publishing. Wedge = product grids with price fidelity.
- Website with login (email + password / magic link; Google OAuth optional later).
- **Payments from day one**: monthly subscription via Stripe (Checkout + Customer Portal + webhooks + Stripe Tax). No 100 % free launch. Free = limited trial only (free checker without account; a small document trial), not a free product.
- Quotas = page credits, not document counts (review finding B2: document quotas allowed processing cost above revenue). For the restaurant target (2026-10-16): one price per venue covers its documents up to 10 pages in all, every update included; page credits stay for longer documents if those segments return.
- Launch is the demand test; define kill criteria before launch (proposal: at 30 days ≥ 300 free checks, ≥ 10 % sign-up conversion, ≥ 1 paying customer; otherwise stop/pivot).
- No real-estate direction. The repository records every choice as its own decision and never says where a design came from (Andrei, 2026-10-13).
- Brand fidelity (Andrei, 2026-10-15, after the first prospect said our page looked nothing like their menu): the page takes the PDF's measured fonts, colours, sizes and rules; open-licensed fonts are embedded (was: system fonts only); the page follows the PDF's background with no automatic dark mode; a theme and font switch belongs in a later Customize page step.
- Currency on bare prices (Andrei, 2026-10-15): when a page prints its currency anywhere, its bare prices show it ("12.90" → "£12.90"), so a screen reader says the amount as money; no currency is ever invented for a page that prints none.
- No per-document price (Andrei, 2026-10-16): the conversion alone is what any chatbot subscription offers; what is sold is the kept page (hosted link that stays the same, every update included, words and prices exactly as printed, brand kept, accessibility checked). Demand test price: $29 a month in the US, £25 in the UK. Evidence: a chatbot given the Kendells PDF kept all 28 prices in 3 of 3 runs but changed the owner's text every time (added an allergy line, "corrected" dish names, moved conditions) and published nothing; every menu tool found charges monthly with updates included.
- Target market (Andrei, 2026-10-16): independent restaurants, bars and cafés that link a PDF menu, US first in New York and Florida (most ADA web suits: restaurants 35% of 2025 suits, NY 28%, FL 24%), UK second (phones, no legal pitch). A document fits when customers read it on phones, it carries prices, it changes several times a year, it has 1–10 pages and the business has no web team. Retail catalogues and public bodies are set aside, not dropped: same engine, other buyers. Next wave: 20 NY/FL restaurants, each email linking its page already made (private preview, deleted after 30 days), every page reviewed by Andrei before its email.

- Engine changes are measured on unseen menus (Andrei, 2026-10-16: "every PDF is a scenario to learn from… otherwise we do the work from zero for each new PDF"): a fix is a pattern or a PDF layer measured on the whole set, never a per-menu repair; each fix keeps a fixture from the menu that showed it; a held-out batch of menus never processed, run once, gives the first-time-right rate. Batch 1 (docs/reviews/2026-10-16-heldout-1.md): 0 of 9 by the AI reviewer; the logo is vector artwork we do not ingest in 8 of 9.

- The printed view (Andrei, 2026-10-17: "shouldn't we reproduce it 1:1? that is the point"): on a wide screen the page shows the PDF 1:1 (the printed page rendered without its text behind, our real text placed where it is printed); on a phone, at zoom, or by a visible switch, the reflowed page. One semantic HTML for both, so screen readers, the validator and the scorer see the same content; nothing built so far is dropped. Fonts stay Google lookalikes for now; the PDF's own embedded fonts only where their licence allows web use (later).
- The printed view's threshold (Andrei, 2026-10-17): it shows where the body text reads at 12 px or more (the size of a menu held in the hand), never below 768 px; stage 0's scored pages are built without it so their rescore does not change. Below the threshold, at zoom, in forced colours, in print and with "Text only", the reflowed page. A lookalike face wider than the printed one is narrowed to the printed width at build time (measured in a browser, `--k`), a word's colour is the ink drawn last (the text layer's colour misses a fill over a shadow), and printed text the backdrop makes unreadable gets a halo.
- Fonts in the printed view (Andrei, 2026-10-17): the PDF's own embedded fonts where the font's embedding flag permits it (installable or editable; read from the raw font program, never from a converted copy), elsewhere the lookalike. Measured on the 33 documents: about a quarter of the embedded fonts permit it (Bannatyne 9 of 9); bare CFF fonts (about half) carry no flag and keep the lookalike. Risk recorded with the decision: the flag governs embedding in documents, not web use; a commercial face may need its own webfont licence. Order of work after both critics: placement correctness (line by line, a build-time gate falling back to the text view), contrast and backdrop fills first; tracking and weight from the PDF next; the fonts last.

- Large sheets printed, not reflowed (Andrei, 2026-10-18 evening, after Bud & Alley's, Lexington and La Segunda showed "nothing like it"): the printed view shows from the window where body text reads at 7 px (never below 800 px), no longer 12 px; supersedes the 2026-10-17 threshold. After both critics: the floor follows text size, not a fixed 800 px, so Cmd+ zoom reaches the reflowed page in one or two steps; contrast's large-text level is judged at that floor; an "Enlarge" control is left out (pinch zoom and "Text only" cover it) until asked for.
- Letters drawn as shapes (2026-10-18, after both critics): a word or price whose letter the PDF draws as a shape is lost, its text a validator error (the printed view shows the print), not a new keep-printed list: an error says the text is in doubt. Recovering the letter needs a model hint, which changes the frozen ingestion prompt, so it waits for the next prompt change. Saved runs keep their scores (rescore re-validates saved extractions, which have no drawn letters).
- Way of working (Andrei, 2026-10-18): target 99 % of menus right the first time; surgical changes along the plan and ROADMAP; each change measured on the whole set before and after (no regressions); bugs, improvements and decisions written in the docs before the commit, so no loop repeats work.

## Decisions still open (ask Andrei)
1. Tagged PDF in v1: recommendation = HTML primary ("publish this instead of the PDF") + a rebuilt tagged PDF generated from our HTML (Chromium tagged PDF), clearly labelled as redesigned; layout-preserving tagging deferred.
2. Free trial shape: free checker (no AI) + N free documents without card, or card-required trial.
3. ~~Exact prices and page allowances~~ Set for the demand test on 2026-10-16: $29 / £25 a month per venue, up to 10 pages, updates included (see Decisions); revisit after the test.
4. ~~Launch market order~~ Decided 2026-10-16: US (New York, Florida) first, UK second; German-speaking markets later.

## Review findings to apply when rewriting SPEC.md
(from an independent review of SPEC.md on 2026-10-12)
- B1: HTML next to an inaccessible PDF does not satisfy ADA Title II §35.202; position as replacement, or ship tagged PDF. Decide per open decision 1.
- B2: pooled page credits; relax margin target to ~25 %; free tier bounded.
- B3: quality gate = zero material content errors after review on a held-out set, measured against annotated ground truth (we now have it); not "% of blocks".
- M3: editor must allow correcting transcribed text, links, product grouping (split/merge); keep immutable extraction evidence next to the editable structure.
- M4: full WCAG 2.2 AA applicability matrix (text spacing, non-text contrast, focus not obscured, target size, dragging alternative for reordering, complex table headers).
- M5: EU processing via AWS Bedrock (Frankfurt) for Claude; binding DPA; device hash is personal data; define retention per artifact.
- M6: global spend cap, atomic quota reservation, idempotent retries; hosted pages on an isolated content domain; sanitize output; treat PDF text as untrusted input to the LLM.
- M7: neutral badge on unverified publications; report distinguishes AI-generated / auto-checked / human-verified; checker shows "N issues in M checks", not a score.
- M8: stable-URL version replacement, drafts, unpublish in v1; post-cancel continuity policy.
- M9: realistic MVP = 4–6 weeks; cut AI summaries, translation, priority queue, branding variants, PDF report download.
- m1: OSS VAT registration is separate from Stripe Tax; marketing consent separate from sign-up (UWG §7); unbranded-embed entitlement placed consistently.

## Next steps, in order (agreed 2026-10-12)
Goal: an end-to-end flow that works flawlessly and is tested at every step.
1. ~~**Finish the stage-0 gate.**~~ Done 2026-10-12: GO, $0.97 of held-out model cost. Answer keys for Honda (p1/9/11), Stone House and Bannatyne, hash-frozen in `validation/KEYS.md` before any run; held-out runs (grid pages ×3, others ×1, Opus check only if a silent price error appears); written verdict GO / NARROW / STOP in `docs/STAGE0.md`. The prompt is frozen (SHA in `docs/STAGE0.md`); do not tune it.
2. **Harden the pipeline.** Draft plan v3 in `docs/HARDENING.md` (measurement first, blind keys, sealed test set; awaiting Andrei's decisions). Items gathered so far: Rebuild visual lines from geometry when the text stream order contradicts it (Type 3 fonts); detect an unusable text layer per page and either transcribe from the image as AI-generated text under review or mark the page unsupported and not charged; split two-page spreads into single pages before processing (GO condition); cut review rules to items that need a human decision (GO condition; grids are at 2–6 per page); output logos as images with their text as alt; keep a qualifier after its amount when printed after it ("2 € billiger"); scorer: compare amounts in value-set table rows; interface strings in the document language; **the per-document report** (auto-checked / AI-generated / needs review) — not built yet.
3. **End-to-end flow with tests.** One command (`pnpm process <file.pdf>`) producing the accessible HTML, the report and `report.json`. Synthetic test documents generated from known data (HTML → PDF with Playwright): answer keys come for free, the files can live in git, and they reproduce the traps found so far (small cents, columns, corrupt text layer, Type 3 fonts). Two test tiers: deterministic with recorded model responses (CI on every push, no cost) and live with the real model (local only, before a release). GitHub Actions: typecheck, lint, tests, end-to-end on the synthetic documents.
4. **SPEC.md rewrite (1 day)**, then the **MVP web app (4–6 weeks)** wrapping the tested flow: free checker, auth, upload, review editor, publish (hosted + export), Stripe subscriptions, page credits, account/billing, legal pages.
5. **Launch** with kill criteria; LinkedIn + German/English SEO + agencies.

## Deferred decisions
- 2026-10-12 — **Own model for cost** (an open document model fine-tuned and hosted by us, e.g. on Vertex, instead of Claude for part of the work). Postponed by Andrei until the end-to-end flow is done. Compute would be far cheaper per page even at low volume (per-second GPUs); the open questions are labelled training data (reviewed pages from the editor are the natural source) and proven quality against the zero-silent-price-error bar.

## Working rules for this project (Andrei's preferences)
- Announce the approach and wait for an explicit go before implementing; questions/analysis may proceed.
- TypeScript for all new code; no `any`, no casts outside real boundaries; strong types.
- Code comments: default none; never narrate changes; max 2 lines when truly needed; no comments in style files.
- No stylistic-only changes to untouched code; smallest safe diff; no speculative abstractions; no unused exports/props.
- Never push (Andrei pushes; hand over the exact commands); commit only when asked; no Co-Authored-By lines.
- Docs in English; replies in natural Romanian (full sentences, English tech terms kept).
- Avoid the words "dedupe", "verbatim", "clamp", "prune" in prose and code.
- Never write where a design or code came from, and never mention Andrei's other personal projects in the repository.
- Honest claims only: never "compliant", "certified", "100 %".
