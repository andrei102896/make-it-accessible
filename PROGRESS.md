# Make It Accessible — Progress

Last updated: 2026-10-12. Read this first in every new session.

## Status
Idea validated on the supply side; demand will be validated by launching. Stage 0 in progress (plan: `docs/STAGE0.md`). Days 0–3 done (log at the end of `docs/STAGE0.md`; model calls run on Andrei's Claude subscription via Claude Code headless mode; Bedrock deferred to the MVP). Day 3 result: all 6 tuning pages pass C1–C4 in 2 of the last 3 runs, 0 silent price errors, ~$0.08/page. Next: Day 4 — freeze the prompt, keys for Honda/Stone House/Bannatyne. Then SPEC rewrite, then MVP with payments from day one.

## What exists in this folder
- `AGENTS.md`, `README.md` — session bootstrap (rules, definition of done) and architecture map. Code lives in `packages/pipeline` (product) and `packages/eval` (stage-0 harness).
- `docs/SPEC.md` — full product spec (v1, pre-review). Needs the rewrite described below.
- `docs/VALIDATION.md` — validation protocol (criteria C1–C9, thresholds, decision matrix).
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
- Quotas = page credits, not document counts (review finding B2: document quotas allowed processing cost above revenue).
- Launch is the demand test; define kill criteria before launch (proposal: at 30 days ≥ 300 free checks, ≥ 10 % sign-up conversion, ≥ 1 paying customer; otherwise stop/pivot).
- No real-estate direction. The repository never mentions or references the author's employer.

## Decisions still open (ask Andrei)
1. Tagged PDF in v1: recommendation = HTML primary ("publish this instead of the PDF") + a rebuilt tagged PDF generated from our HTML (Chromium tagged PDF), clearly labelled as redesigned; layout-preserving tagging deferred.
2. Free trial shape: free checker (no AI) + N free documents without card, or card-required trial.
3. Exact prices and page allowances — set after stage 0 measures cost per page (target ≤ 25 % processing cost / revenue, not 10 %).
4. Launch market order: Germany + English recommended.

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

## Next steps, in order
1. **Stage 0 — quality gate (7 working days, plan in `docs/STAGE0.md`).** Build the processing pipeline prototype (parser API + vision model → structure.json → accessible HTML) and run it on the 5 test documents. Score with the answer keys at the same thresholds (C1 ≥ 95 %, C2 = 0 material errors, C3 ≤ 1, C4 ≥ 80 %). Measure cost and latency per page. Automate the scoring where possible (product/price matching against the answer-key tables). If we do not clearly beat the generic-tool baseline on product grids, stop.
2. **SPEC.md rewrite (1 day)** applying the review findings and the decisions above.
3. **MVP (4–6 weeks):** free checker, auth, upload, pipeline, review editor, publish (hosted + export), per-document report, Stripe subscriptions, page credits, account/billing pages, legal pages.
4. **Launch** with kill criteria; LinkedIn + German/English SEO + agencies.

## Working rules for this project (Andrei's preferences)
- Announce the approach and wait for an explicit go before implementing; questions/analysis may proceed.
- TypeScript for all new code; no `any`, no casts outside real boundaries; strong types.
- Code comments: default none; never narrate changes; max 2 lines when truly needed; no comments in style files.
- No stylistic-only changes to untouched code; smallest safe diff; no speculative abstractions; no unused exports/props.
- Never push (Andrei pushes; hand over the exact commands); commit only when asked; no Co-Authored-By lines.
- Docs in English; replies in natural Romanian (full sentences, English tech terms kept).
- Avoid the words "dedupe", "verbatim", "clamp", "prune" in prose and code.
- Never mention the author's employer or his other personal projects anywhere in the repository.
- Honest claims only: never "compliant", "certified", "100 %".
