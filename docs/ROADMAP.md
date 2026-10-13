# Roadmap and tracker

Single place for progress. Updated in the same change as the work (AGENTS.md "Docs upkeep"). Status: `[x]` done (date), `[~]` in progress, `[ ]` to do. Estimates are working days, not calendar promises; robustness wins over dates.

**Where we are (2026-10-13):** M0 done (GO). M1: A1–A3 done; next A4 (blind keys). Engine ready = M1 + M2 done, estimated ~4–5 weeks of work. Website and pricing (M3–M4) start after that.

## M0 — Stage 0 quality gate · done 2026-10-12
- [x] Pipeline, scorer, keys for 5 documents, prompt frozen (2026-10-12)
- [x] Held-out runs: 0 silent price errors in 52 items × 3 runs; verdict GO (2026-10-12, `docs/STAGE0.md`)

## M1 — Engine hardening (`docs/HARDENING.md`) · ~3–4 weeks
Phase A, measurement first:
- [x] A1 Decisions and pre-registration (2026-10-12)
- [x] A2 Harness: scorer reads visible prices with its own parser, prices keyed per amount (role, currency, qualifier), narrow review marks (row-mark bug fixed), merged sections and printed-page checks, page type/scope/unsupported, zero-tolerance image text and slug text, split and layout manifests, sealed-test guard, rescore to a copy, decisions metric, 3-run aggregator (2026-10-13)
- [x] A3 Corpus: 22 new PDFs, 402 pages (Lidl GB, B&M, Keystore, Kaufland, Lidl DE/CH, Landi, Swift ×2, Elddis ×2, Coachman, 7 menus/price lists incl. Canva, scan, image-only, unreadable fonts, Sanford), sources and hashes in `validation/SOURCES.md`; all 501 corpus pages labelled for layout; Andrei's local copies (Sanford, Lidl NL) recorded as such (2026-10-13)
- [ ] A4 Blind keys (≥ 12 grid pages / ≥ 150 items full keys, price-only keys to ~300 items, 4 menus, 10 spreads, 2 trifold sides, 4 text), Andrei's spot-check, freeze · 3 d
- [ ] A5 Dev / sealed test split · 0.5 d
- [ ] A6 Baseline on dev, stage-0 commit, 3 runs · 0.5 d
Phase B, fixes on dev:
- [ ] B1 Currency per price, formats "99p", "12,50€", "12.5", "-.99", CHF · 2 d
- [ ] B2 Layout: detection per document, panel-ordered inventory with full-width cross-gutter bands, model order + page assignment, cover order, folios, two printed pages, TrimBox, area credits · 4–5 d
- [ ] B3 Review load: bare digits next to a currency word, image text, uncovered repeats, post-hoc "uncertain" downgrade · 2 d
- [ ] B4 Image budget on spreads (two half images if rows or prices regress) · 1 d
Phase C:
- [ ] C Sealed test once, both arms, raw numbers; Andrei's decision · 1 d
Remaining hardening (after C):
- [ ] Visual lines from geometry (Type 3 fonts) · 1 d
- [ ] Corrupt text layer → page unsupported, not charged · 1 d
- [ ] Logos as images with their text as alt; qualifier after its amount; UI strings in the document language · 1 d
- [ ] Per-document report (auto-checked / AI-generated / needs review) + `report.json` · 1–2 d

## M2 — Engine end to end · ~1–1.5 weeks
- [ ] `pnpm process <file.pdf>` → HTML + report + `report.json`
- [ ] Production model client (API key; EU processing, e.g. Bedrock EU or Anthropic API with a DPA), Batch API option for cost
- [ ] Container image with pinned Poppler
- [ ] Synthetic test documents (HTML → PDF from known data) reproducing every trap found
- [ ] Deterministic tests with recorded model responses in CI; live tests locally before a release
- [ ] GitHub Actions: typecheck, lint, tests, end-to-end on synthetic documents

## M3 — SPEC rewrite and pricing · ~2–3 days
- [ ] SPEC.md rewrite from CLIENT_FLOW, HARDENING results and review findings
- [ ] Prices and plans from the measured cost per A4 page (≤ 25 % of revenue), credit allowances, add-ons

## M4 — MVP web app · ~4–6 weeks
- [ ] Free checker (no account, no AI)
- [ ] Auth, upload, layout confirmation, processing queue, spend cap
- [ ] Review editor (three labels, edit text/alt/order/headings/grouping)
- [ ] Report page, publish (hosted link, embed, ZIP), versions at a stable URL
- [ ] Stripe subscriptions, page credits, portal; legal pages (privacy, DPA, terms, imprint)

## M5 — Launch
- [ ] Kill criteria fixed before launch; LinkedIn, German/English SEO, agencies
