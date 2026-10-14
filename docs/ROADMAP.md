# Roadmap and tracker

Single place for progress. Updated in the same change as the work (AGENTS.md "Docs upkeep"). Status: `[x]` done (date), `[~]` in progress, `[ ]` to do. Estimates are working days, not calendar promises; robustness wins over dates.

**Where we are (2026-10-13):** M0 done (GO). M1: A1–A3 and A5 done; A4 under way (harness step done, page draw next). Engine ready = M1 + M2 done, estimated ~4–5 weeks of work. Website and pricing (M3–M4) start after that.

## M0 — Stage 0 quality gate · done 2026-10-12
- [x] Pipeline, scorer, keys for 5 documents, prompt frozen (2026-10-12)
- [x] Held-out runs: 0 silent price errors in 52 items × 3 runs; verdict GO (2026-10-12, `docs/STAGE0.md`)

## M1 — Engine hardening (`docs/HARDENING.md`) · ~3–4 weeks
Phase A, measurement first:
- [x] A1 Decisions and pre-registration (2026-10-12)
- [x] A2 Harness: scorer reads visible prices with its own parser, prices keyed per amount (role, currency, qualifier), narrow review marks (row-mark bug fixed), merged sections and printed-page checks, page type/scope/unsupported, zero-tolerance image text and slug text, split and layout manifests, sealed-test guard, rescore to a copy, decisions metric, 3-run aggregator (2026-10-13)
- [x] A3 Corpus: 22 new PDFs, 402 pages (Lidl GB, B&M, Keystore, Kaufland, Lidl DE/CH, Landi, Swift ×2, Elddis ×2, Coachman, 7 menus/price lists incl. Canva, scan, image-only, unreadable fonts, Sanford), sources and hashes in `validation/SOURCES.md`; all 501 corpus pages labelled for layout; Andrei's local copies (Sanford, Lidl NL) recorded as such (2026-10-13)
- [~] A4 Blind keys, amended after two critics (`docs/HARDENING.md` "A4 and A5 as amended") · ~5 d
  - [x] Harness before keys: eval reader fixes, key validation without the pipeline, completeness (`notPrices`), unique anchors, `seen` prices, section orders, disputes, unkeyed products in the output, merged cells, per-page decisions bound, sealed keys, `keys:check`, seeded `select-pages` (2026-10-13)
  - [x] Repair plan after Andrei's policy review and two critics: occurrences instead of values (2026-10-13)
  - [x] Eval reader fixes (decimal pence, unmapped glyphs, NFKC, thousands with spaces, suffix currency) and the occurrence ledger, checked against renders of Lidl GB p7, Lidl CH p16, Lidl NL p15 (2026-10-13)
  - [x] Key v3 (writers claim occurrences), scorer conditions/roles/claims and add-ons, strict tables, C1 in-block order, C3 coverage reported (calibrated on stage-0 runs), C4 lexical rename, word snapshots, spares before the reserve (2026-10-13)
  - [x] Key policy approved by Andrei (`validation/KEY_POLICY.md`, 2026-10-13)
  - [x] Rules commit by Andrei (`17fbff2`) → page draw with its SHA → `validation/selection.json` frozen (2026-10-13)
  - [x] Second policy review fixes: page prices scored, manual amounts (missed/split/image) and merged claims, one correction path for every destination, value consistency, frozen ledger and PDF hash, nth anchors, visual reconciliation (2026-10-13)
  - [x] Third policy review fixes: image amounts placed by box, no shared words between manual amounts, condition provenance, rendered table rows must be flagged, amounts counted one by one inside a block, `pnpm ledger` prints every hash (2026-10-13)
  - [x] Fourth policy review fixes: page prices keep their printed offer (cited words, scored word for word), render-read words judged at their place, one image entry per print, snapshot words in `pnpm ledger --details` (2026-10-13)
  - [x] Fifth policy review fixes: cited offer words follow the page (one run per block, stream order, whole amounts, confirmed notes), running-text amounts read as `readMoney` (2026-10-13)
  - [x] Staging tool for the 24 dev pages (`pnpm keys:stage`, run from a clean commit): read-only evidence, one folder and `run.sh` per writer, record in `validation/private/stage/` (2026-10-13)
  - [x] Confined writer runs and their audit (`pnpm keys:write`), writer brief, Andrei's policy decisions (recommended prices, spec values, price-list rows) (2026-10-13)
  - [x] Pilot 1 on 5 dev pages: all 10 keys discarded by the audit (listing outside the folder), 143/147 claims agreed; policy and brief fixed (2026-10-13)
  - [x] Pilot 2 on the restaged pages: 10 of 10 audits clean ($10.3), every price, cell and page-price claim agreed; key comparator `pnpm keys:compare` (2026-10-13)
  - [ ] Arbiter, then all dev pages, then the test half under its rules
  - [ ] Andrei: every test price on the crop sheet, 6 structural pages, uncertain layout labels → freeze in KEYS.md
- [x] A5 Dev / sealed test split by publisher group (2026-10-13, `validation/split.json`)
- [ ] A6 Baseline on dev, stage-0 commit, 3 runs · 0.5 d
Phase B, fixes on dev:
- [x] B1 Currency per price (€, £, $, "99p"), glyph-set prices, bare digits shown as printed; CHF, "¢" and trailing signs left (2026-10-14)
- [ ] B1b Text hidden under an opaque shape · 1 d
- [x] Designed output (Andrei, 2026-10-14: the raw page "looks chaotic, nobody wants it"): menus as name–price rows, cards with pictures, galleries, the document's own colours in a title band, contents on 3+ pages, printed whole prices, print CSS; scores of saved runs identical, axe 0 critical/serious light/dark at 1280 and 320 px (2026-10-14)
- [x] AI brief and templates by document type (`docs/DESIGN.md`): type right on 14/15 dev and tuning documents, titles kept only for printed words, heading class from font names, light and dark accents (2026-10-14)
- [ ] Output follow-ups: dietary marks as tags with their legend, add-on lines under their dish, QR codes as links, crop boxes snapped to image objects, smaller inlined images on long documents
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
- [ ] Stack decision with hosting, from `docs/INFRA_RESEARCH.md` (2026-10-13 research: RDS + S3/CloudFront + Lambda per page under Step Functions proposed; Supabase rejected on PITR/SOC 2 cost and coupling)
- [ ] Prices and plans from the measured cost per A4 page (≤ 25 % of revenue), credit allowances, add-ons; first numbers and the NAT decision in `docs/COSTS.md`

## M4 — MVP web app · ~4–6 weeks
- [ ] Free checker (no account, no AI)
- [ ] Auth, upload, layout confirmation, processing queue, spend cap
- [ ] Review editor (three labels, edit text/alt/order/headings/grouping)
- [ ] Report page, publish (hosted link, embed, ZIP), versions at a stable URL
- [ ] Paddle subscriptions, page credits, portal; legal pages (privacy, DPA, terms, imprint)

## M5 — Launch
- [ ] Kill criteria fixed before launch; LinkedIn, English SEO first (US, UK), German second, agencies
