# Roadmap and tracker

Single place for progress. Updated in the same change as the work (AGENTS.md "Docs upkeep"). Status: `[x]` done (date), `[~]` in progress, `[ ]` to do. Estimates are working days, not calendar promises; robustness wins over dates.

**Where we are (2026-10-17):** M0 done (GO). M1 paused at A4 since 2026-10-14 for a demand test (`outreach/`, PROGRESS "Status"). Target set on 2026-10-16: independent restaurants with PDF menus, New York and Florida first, $29 / £25 a month per venue with updates included. Current work: menus right the first time (below), measured on menus never seen; the demand test runs beside it. M1–M2 resume, or the segment changes, at the demand-test thresholds.

## Now — Menus right the first time · loop per held-out batch
Why (Andrei, 2026-10-16): every PDF is a scenario to learn from; a fix that only repairs one menu automates nothing. The loop: a batch of menus never processed, run once → first-time-right rate (AI reviewer, `check:page`, validator) → failures grouped into patterns by how many menus they reach → each pattern fixed where the PDF layer or form lives, with a fixture from the menu that showed it → the next batch, different menus, measures again. Andrei's eye stays the final judge (`docs/reviews/`).
- [x] Layout round on the 19 tuned menus (`docs/LAYOUT.md`, 2026-10-16): chips without scroll, centred masthead, sections in printed columns and side bands, AI reviewer (`pnpm review:page`), inline brand colours, lists as printed, two-column price tables as menu rows, 28-family font library with lookalikes and small caps, frames and panels from the vector layer, alignment as printed, rules and dotted lines from the vector layer
- [x] Andrei's desktop review of the 19 pages, every remark recorded (`docs/reviews/2026-10-16-andrei-desktop.md`, 24 remarks)
- [x] Held-out batch 1 (2026-10-16, `docs/reviews/2026-10-16-heldout-1.md`): 0 of 9 right the first time; patterns by reach
- [x] Step 1, content and robustness (2026-10-16): lost ligatures filled where the gap shows them, sizes and prices per unit as printed, secondary grey on light panels, copy-protected PDFs refused by name, page titles and sentences out of the section chips
- [ ] Step 2, the artwork layer at ingestion (8 of 9): logos, banners, seals and line art drawn as vector paths cropped from the render as figures; pictures the SVG shows but pdftohtml does not report · ~1.5 d
- [ ] Step 3, lettering (7 of 9): display and script faces added to the library by measured need; lettering drawn as artwork kept as a picture with its words as alt · ~1 d
- [ ] Step 4, page colour and background art (6 of 9): a coloured page, banners, curved panels (Boater's cream wave), background illustrations shown faintly behind their section (Noah's p2) · ~1 d
- [ ] Step 5, arrangement (6 of 9): dense multi-column sheets kept in columns, a cover beside its content, free arrangements · ~1.5 d
- [ ] Types of their own: landscape pages (Almond), flattened designs whose page is one image with text over it (Bud & Alley's), the newspaper page (Prohibition p2) · to assess
- [ ] Open from Andrei's review: Sarge's (to review together), Rucola's logo over its frame and small-caps headings, Moosewood's side notes (legend, dressings), Ferrara's two-column list of short items
- [ ] Dietary codes: legend as a key, codes beside the name, icon words (Moosewood fish) · 0.4 d
- [ ] Approved pages locked as regression tests: per document, the layout facts Andrei approved (boxes, rules, columns, alignment, masthead) checked on every change · 1 d
- [ ] Held-out batch 2: 10 new NY/FL menus, run once, after steps 2–5; batch report page instead of loose files (`docs/WORKFLOW.md` step 2)

## Demand test (`outreach/`, local)
- [x] 56 cold emails, 14–15 Oct (UK pubs and restaurants, US agencies and restaurants); one real reply (Kendells), answered with the price on 16 Oct
- [x] 19 NY/FL previews published at andreiprojects.com/preview (`previews/EXPIRY.csv`), refreshed after every engine change
- [ ] Follow-ups to the first 56: first 10 on 19 Oct, the other 46 on 20–21 Oct (drafts only; Andrei sends)
- [ ] Kendells follow-up if no answer by 21 Oct
- [ ] mail-tester.com run on the sending address (until then "0 replies" is not interpretable)
- [ ] Wave of 20 NY/FL restaurants, each email linking its reviewed page, once Andrei passes the layout checkpoint
- [ ] Previews deleted by 15 Nov (`pnpm preview:expire`)
- [ ] Decision at the thresholds in `outreach/emails.md`: continue, change segment, or stop

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
- [x] B1b Text hidden under an opaque shape or drawn invisibly: judged by the ink in each word's box, left out of the model's inventory and the page, listed in the adhoc report; no false hits on the tuning and dev PDFs, true hits on a pub menu, Lidl GB/CH, Honda, Elddis (2026-10-14)
- [x] Designed output (Andrei, 2026-10-14: the raw page "looks chaotic, nobody wants it"): menus as name–price rows, cards with pictures, galleries, the document's own colours in a title band, contents on 3+ pages, printed whole prices, print CSS; scores of saved runs identical, axe 0 critical/serious light/dark at 1280 and 320 px (2026-10-14)
- [x] AI brief and templates by document type (`docs/DESIGN.md`): type right on 14/15 dev and tuning documents, titles kept only for printed words, heading class from font names, light and dark accents (2026-10-14)
- [x] External design review fixes (2026-10-14): crops cleared of neighbouring text, whole amounts without ".00" per list or table, tables readable at 320 px with thead and named regions, cards on shared rows (prices aligned) with a row layout under two columns, printed URLs/e-mails/phones as links, a menu's dietary codes as tags after the name with the legend's words for screen readers, add-on lines, notes kept with their list, pictures sized as printed, brand and document name in one h1, PDF page numbers, headings from h3; rescores identical, axe 0 critical/serious in 5 modes on 4 documents, keyboard clean
- [x] Design review round 2 (2026-10-14; pub menu publishable, the other three with fixes): crops keep the product whole without other offers' words, notes describe their list, sticky row headers, repeated pictures as ornaments, editorial type on price lists, phone card details full width, add-on amounts set apart, short contents visible; rescores identical, axe and keyboard clean
- [x] Design review round 3 (2026-10-14; three of four publishable, leaflet with fixes): crops free of other products' pictures, cut-off badges grown back, text colour for word extents, notes describe the items they name, running pictures decorative, spacing before a tight currency sign; rescores identical
- [x] Design review rounds 4 and 5 (2026-10-14; all four publishable): a product's own words taken in whole along their line; next is a VoiceOver pass
- [x] VoiceOver pass with `pnpm listen` on the menu and the leaflet page (2026-10-15): legend heard as one phrase
- [x] VoiceOver follow-ups (2026-10-15): a price with its previous price as one stop, no "3 items" after the h1 (`role="text"`); rescores identical, pages pixel-identical, axe clean
- [ ] Letter-spaced words split in the text layer ("BILL A")
- [x] Brand from the PDF (2026-10-15): fonts read per word from pdftohtml, open-licensed families embedded (`pnpm fonts:add`), role colours and sizes measured, heading signatures, rules under headings and dish dividers from the render, no automatic dark mode; rescores identical, axe clean at 1280/390/320 and forced colours, WCAG 1.4.12 at 320 px on 5 documents
- [x] Ornaments under headings (2026-10-16): drawn from the render as alpha masks; the brief lists design details and adhoc prints those the page lacks
- [x] US menu prices (2026-10-16): bare numbers, market price, two-size prices and one decimal shown as printed without findings; split digits joined; printed case wins over the model's re-casing; a price cited twice shows once; keyboard check measures 2.4.11
- [~] Workflow automation (`docs/WORKFLOW.md`): preview publishing from this repo (done 2026-10-16), batch report, outreach drafts and due list, self-running guards · 2 d left
- [ ] Scorer reads the masthead (`header.masthead`, outside `section[data-page]`) as part of the first page before any brand-rendered page is keyed
- [ ] Scorer follows the validator on currency-less prices (`score/prices.ts` judge, `metrics.ts` mustFlag) before any US key is written; and on the forms the validator shows as printed since 2026-10-16: sizes (`readMoney("$65/80/90")` is null today, `moneyInText("3.99/4.99/5.99")` reads three prices) and a price per unit ("$30/dz" reads as 3000)
- [ ] A qualifier equal to the dish's description is not shown; a dish whose only picture is a tiny logo renders as a row
- [x] Layout fidelity / brand v2 (`docs/LAYOUT.md`, 2026-10-16): slices 1–7 done (chips, masthead, columns, AI reviewer, inline colours and list shapes, fonts and small caps, frames, panels, alignment and rules from the vector layer); what remains moved to "Now — Menus right the first time"
- [ ] Output follow-ups: add-on prices as price elements (key and scorer role first), QR codes as links, labelled multi-prices, unit-price line, sticky side contents, brief on 2 pages, smaller inlined images on long documents
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
- [ ] Preview, then Customize page (Andrei, 2026-10-15): only controls that cannot break the page, each contrast-checked: theme (as the PDF by default, light, dark, follow the system), accent among the PDF's measured colours, heading and text fonts from the open-licensed list, density, title band on/off, rules under headings; content stays as extracted and reviewed
- [ ] Report page, publish (hosted link, embed, ZIP), versions at a stable URL
- [ ] Paddle subscriptions, page credits, portal; legal pages (privacy, DPA, terms, imprint)

## M5 — Launch
- [ ] Kill criteria fixed before launch; LinkedIn, English SEO first (US, UK), German second, agencies
