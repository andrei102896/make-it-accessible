# Make It Accessible — Product Specification

> Upload your brochure. Get an accessible web version you can publish today, plus an honest report of what still needs a human eye.

Status: pre-build. Last updated: 2026-10-12.
Numbers marked *(proposal)* are starting points to validate, not decisions.

---

## 1. Product overview

### 1.1 Problem
Marketing teams publish catalogs, brochures and leaflets as designed PDFs (InDesign, Canva). These files are almost never accessible: no reading order, no headings, no alt text, text baked into images. Regulation now makes this a liability:

- **EU — European Accessibility Act (EAA)**, enforceable since 2025-06-28. Covers consumer-facing e-commerce, banking, e-books, transport, telecoms. PDFs on an in-scope site are "non-web documents" under EN 301 549 clause 10. Germany (BFSG) already sees warning letters of €3.5k–20k; France saw formal notices and emergency proceedings against Auchan, Carrefour, E.Leclerc, Picard.
- **US — ADA Title II** (state/local government, schools): WCAG 2.1 AA required by 2027-04-26 (50k+ population) and 2028-04-26 (smaller entities). PDFs are covered. **ADA Title III** website lawsuits: 3,117 federal suits in 2025 (+27% YoY).

Existing tools target government forms, statements and academic papers. Designed marketing layouts (multi-column, product grids, text on images) are where auto-tagging breaks, and nobody publishes quality data for them.

### 1.2 Promise
- An **accessible HTML version** of the document as the primary output, hosted or exported.
- A **per-document accessibility report** stating exactly what was fixed automatically, what needs human review, and what remains unresolved.
- Fast (minutes), self-serve, transparent pricing, cancel anytime.

### 1.3 What we never promise
- Never "100% compliant", "certified", "ADA/EAA compliant in one click". The FTC fined accessiBe $1M (2025) for that claim. Our wording: "accessibility checks passed", "issues fixed", "items to review".
- No overlay widget. We change the content, not the page chrome.

### 1.4 Positioning
| | Generic remediation tools | Make It Accessible |
|---|---|---|
| Built for | forms, reports, papers | designed brochures, catalogs, leaflets |
| Primary output | tagged PDF | accessible HTML (tagged PDF in v2) |
| Pricing | quote / per page / per seat | per document or flat monthly, public |
| Honesty | score or "compliant" badge | fixed / to review / unresolved, per element |
| Human control | export, then fix in Acrobat | built-in review editor before publishing |

---

## 2. Market context (research summary, Oct 2026)

| Segment | Crowding (1–5) | Our stance |
|---|---|---|
| Enterprise manual remediation services ($4–25/page) | 5 | Avoid |
| Self-serve AI PDF remediation (AoD $0.30–1.80/page, EqualWeb $3–5/page, Adobe Auto-Tag API, PDFix, Siteimprove agent) | 4, rising | Compete only on designed documents |
| Site-wide PDF scanning (Siteimprove, DocAccess, Edlio) | 4 (gov/edu locked) | Later, not MVP |
| Accessible HTML version of marketing documents | 2–3 | **Our wedge** |

Key competitor price anchors:
- Adobe Acrobat Pro: $19.99/mo; Auto-Tag API 500 free transactions/month.
- Accessibility on Demand: $0.30 (standard), $1.80 (enhanced), $12+ (human-reviewed) per page.
- Manual services: $4–12/page typical, $50–100 per form.
- PDFix Pro: €350/yr. axesWord: €329/user/yr.
- Siteimprove: ~$15k–50k+/yr (enterprise).

Documented pain points to design against:
- Acrobat auto-tag deletes existing alt text and mis-levels headings.
- Remediated files that pass checkers but are structurally wrong.
- Opaque, phone-for-a-quote pricing.
- Turnaround of 5–70 business days.
- Canva PDFs are not PDF/UA; "Flatten PDF" strips tags.
- Cancellation friction (Pictory: "They don't allow you to cancel").

---

## 3. Target customers

| Persona | Why they buy | Trigger |
|---|---|---|
| **EU retail / e-commerce marketer** (weekly leaflets, seasonal catalogs) | EAA/BFSG exposure, warning letters | legal notice, agency audit, competitor news |
| **Agency / freelance designer** making brochures for clients | clients now ask "is it accessible?" | client requirement in a brief |
| **US school district / small municipality** | ADA Title II deadline | 2027/2028 deadline, audit |
| **Print shop offering digital versions** | upsell to existing clients | — |

Out of initial focus: pure B2B companies and EU microenterprises (outside EAA scope), large enterprises needing procurement.

**Launch market:** Germany + English-speaking markets. German landing page and SEO content from day one.

---

## 4. Scope

### 4.1 MVP (v1)
1. Free accessibility check without an account (no AI).
2. Sign-up / login (Google, email magic link).
3. Upload PDF → AI processing → accessible HTML version.
4. Review editor: fix alt text, headings, reading order, mark images decorative.
5. Publish: hosted link, embed snippet, ZIP export of the HTML.
6. Per-document accessibility report (web + downloadable PDF).
7. Plans, free tier (3 documents), Stripe billing, cancel anytime.
8. Account page: documents list, usage this period, billing portal, delete account.

### 4.2 v2 (after first paying customers)
- Tagged PDF output (PDF/UA), validated with veraPDF.
- Multilingual versions (translated alt text, summaries and text; language switcher).
- Embed without branding, custom accessibility statement per document.
- Re-upload a new version of the same document, keep the same URL.

### 4.3 Later
- Canva app: "Make it accessible" directly from a Canva design.
- Team accounts and agency plan (client workspaces).
- Site scan: find PDFs on a domain, score them, batch-fix.
- Custom domains for hosted documents.

### 4.4 Explicitly out of scope
- Overlay / widget for whole websites.
- Word, PowerPoint, InDesign file inputs (PDF only).
- Fillable PDF forms.
- Human remediation service (we may partner, not staff it).

---

## 5. User flows

### 5.1 Free check (no account)
1. Landing → "Check your brochure" → drop a PDF (≤ 50 MB, ≤ 100 pages).
2. Server runs non-AI checks: tagged or not, title/lang metadata, images without alt, text extractable vs. image-only pages, reading-order heuristics.
3. Result: score out of 100 + top 3 issues with page thumbnails + "Fix it free — 3 documents on us" CTA.
4. The file is deleted immediately after the check. Stated on the page.
5. Rate limit: 5 checks per IP per day.

### 5.2 Sign-up
- Google OAuth or email magic link. No password.
- Cloudflare Turnstile on the email form.
- Disposable email domains rejected.
- No card required for the free tier.

### 5.3 Upload and processing
1. Dashboard → "New document" → drop PDF.
2. Pre-checks: size, page count vs. plan limit, virus scan, encrypted/password-protected PDFs rejected with a clear message.
3. Show the cost against quota before starting ("This uses 1 of your 3 free documents").
4. Processing screen with step progress: *Reading layout → Finding structure → Describing images → Building accessible version → Checking result*.
5. Email when done if the user left the page.

### 5.4 Review
- Split view: original page image (left), accessible version (right), synchronized by page.
- Issues panel grouped as **Needs review / Auto-fixed / Unresolved**, each linking to its element.
- Editable inline: alt text, "decorative" toggle, heading level, element order (drag), table header row/column, document title and language.
- "Mark as reviewed" per item. Report updates live.
- Publishing is allowed with open review items, but the report shows them.

### 5.5 Publish and export
- Hosted URL: `makeitaccessible.<tld>/d/<slug>` *(domain TBD)*.
- Embed snippet (iframe with title attribute, responsive).
- ZIP export: static HTML + assets + report, self-hostable.
- Free tier: small "Made accessible with Make It Accessible" footer badge on hosted/embedded versions.

### 5.6 Billing
- Upgrade from the quota wall, the dashboard, or the pricing page → Stripe Checkout.
- Manage / cancel → Stripe Customer Portal (one click, no call, no survey wall).

---

## 6. Pricing *(decided for restaurants, Andrei, 2026-10-20)*

The unit is the **venue** (one address). A venue's plan covers every menu it publishes up to **60 live pages**, every update, the same link for each new version and the report.

| | Monthly, per venue | Annual, per venue (the default) |
|---|---|---|
| **Founding rate**: Howies, Kendells and the next ~5 buyers, locked while they stay | £25 / $29 | £300 / $350 |
| **List price, UK** | £35 | £350 (two months free) |
| **List price, US** | $45 | $450 |
| **Groups of 5+ venues** | — | 20 % off, annual only |

Rules:
- Annual is offered first ("nothing changed this month, why pay?" has no answer on a monthly plan); monthly stays available.
- More than 60 live pages counts as a second venue. Updates are not counted: a fair-use clause (~30 uploads a month) is logged and stated in the terms only, never in the price.
- A price once quoted is honoured; the list price goes only to people who reply from now on. The US list price is higher on the ADA lawsuit risk, an assumption until a US buyer.
- Stripe Checkout and Stripe Tax; whether the UK price includes VAT is open (accountant).
- Dropped: document quotas (€29 for 10 documents) and page credits for restaurants, and an "N uploads a month" quota (Andrei's idea, attacked 2026-10-20): every restaurant tool prices per location (Popmenu, BentoBox, Owner, MenuTiger by store count); a venue holds 4–5 PDFs, so one seasonal change would use a quota up; and a quota makes the owner ration fixes, so the page drifts from the menu, the one thing sold. A full Howies re-run costs about $2.70 in model calls (`docs/COSTS.md`): cost never needs a quota.

### 6.1 Cancellation policy
- Cancel anytime from the billing portal; access continues until the end of the paid period.
- After the period ends, hosted pages stay live **30 more days**, with email reminders at cancellation, at day 0 and at day 23.
- Exports (ZIP, report PDF, tagged PDF) are the customer's to keep forever.
- No dark patterns. This is a marketing point, not just policy.

---

## 7. Abuse prevention

| Vector | Control |
|---|---|
| AI cost abuse via free tier | login required for any AI processing; 3 free docs per account; 20-page cap |
| Multiple free accounts | disposable-email blocklist; soft limit of free accounts per IP and device hash; Turnstile |
| Free checker scraping | no AI in checker; 5/IP/day; files never stored |
| Malicious files | ClamAV scan; reject encrypted PDFs; processing timeout (10 min); sandboxed worker |
| Huge files | 50 MB / page caps per plan, enforced before processing |
| Hosting abuse (phishing PDFs) | hosted pages `noindex` on free tier; report-abuse link on every hosted page; manual takedown flow |

Expected cost exposure per free document is low *(target ≤ €0.05/page, measure in stage 0)*, so abuse is bounded even if some slips through.

---

## 8. Technical specification

### 8.1 Stack
| Concern | Choice | Why |
|---|---|---|
| Web app + API | Next.js (App Router, TypeScript) | one codebase for landing, app, API routes |
| Database | Postgres (Supabase or Neon, EU region) | relational data, cheap, managed |
| Auth | Supabase Auth or Auth.js (Google + magic link) | no passwords to manage |
| Billing | Stripe Checkout + Customer Portal + webhooks + Stripe Tax | cancel-anytime and EU VAT out of the box |
| File storage | Cloudflare R2 or S3 (EU region) | cheap egress for hosted documents |
| Job queue / worker | Trigger.dev or Inngest, or one worker process on Railway/Fly | long-running pipeline outside request lifecycle |
| PDF layout parsing | external parser API (Reducto / LlamaParse / Mistral OCR — pick in stage 0) | commodity, ~$0.01/page; do not build |
| Vision + language AI | Claude (Sonnet-class for structure and alt text; Haiku-class for summaries/translation) | quality on images with text |
| Validation | axe-core (HTML); veraPDF (PDF/UA, v2) | objective checks for the report |
| Rendering (thumbnails, report PDF) | Chromium (Puppeteer/Playwright) | page images and report export |
| Email | Resend or Postmark | transactional email |
| Bot protection | Cloudflare Turnstile | sign-up and checker |
| Monitoring | Sentry + basic product analytics (PostHog, EU) | errors, funnel |

One repo, one web app, one worker. No microservices.

### 8.2 Data model
```
users
  id, email, name, auth_provider, locale, country,
  signup_ip_hash, device_hash, created_at, deleted_at

subscriptions
  user_id, stripe_customer_id, stripe_subscription_id,
  plan (free|starter|pro), status, current_period_start,
  current_period_end, cancel_at_period_end, hosting_grace_until

documents
  id, user_id, title, slug, source_file_key, page_count,
  primary_language, status (uploaded|processing|review|published|failed),
  failure_reason, quota_source (free|plan|single), badge (bool),
  structure_key, html_bundle_key, report_key,
  created_at, processed_at, published_at, hosted_until

document_issues
  id, document_id, page_index, element_ref, wcag_criterion,
  type, severity (critical|serious|moderate|minor),
  state (auto_fixed|needs_review|unresolved|user_fixed|reviewed),
  message, updated_at

single_purchases
  id, user_id, stripe_payment_intent_id, document_id, created_at

free_checks
  id, ip_hash, file_sha256, score, created_at
```
Quota usage is derived (count of `documents` per user per billing period by `quota_source`), not stored separately.

### 8.3 Processing pipeline
Each step writes its output to storage so a failed run resumes from the last completed step.

1. **Intake:** virus scan, page count, encryption check, store original.
2. **Layout extraction:** parser API → blocks with type (text, image, table, figure), bounding boxes, font sizes, raw text; plus a rendered PNG per page.
3. **Structure inference** (vision model per page, with the page image and blocks):
   - reading order across columns and boxes
   - heading levels (consistent across the document)
   - lists, tables (header row/column), product grids (each product → name, price, description, image)
   - decorative vs. meaningful images; text baked into images (transcribe it)
   - document language and language changes
4. **Content generation:**
   - alt text for meaningful images (product-aware: "Oak dining table, 180 cm, €499")
   - short summary per page (optional section in the output)
   - document title and description if missing
5. **HTML build** from `structure.json` (requirements in 8.4).
6. **Validation:** axe-core on the HTML; internal heuristics (empty alt on meaningful image, heading skips, very long alt, tables without headers, low-confidence AI decisions).
7. **Issue list:** merge validation results + low-confidence AI decisions (→ *needs_review*) + things we cannot fix, e.g. brand colour contrast inside images (→ *unresolved*).
8. **Report build** (8.5).

`structure.json` is the single source of truth. The review editor edits it, and the HTML and report are rebuilt from it in seconds without new AI calls.

### 8.4 Accessible HTML output requirements
Target: WCAG 2.2 AA (maps to EN 301 549 clause 9).
- `<html lang>` set; `lang` on passages in other languages.
- Exactly one `<h1>` (document title); no skipped heading levels.
- Landmarks: `header`, `nav` (page navigation), `main`, `footer`; skip link to main content.
- Each original page is a `section` with an accessible name ("Page 4 — Garden furniture") so users can jump by page.
- Logical DOM order equals reading order; no CSS reordering of content.
- Images: meaningful → descriptive `alt`; decorative → `alt=""`; text in images reproduced as real text.
- Products as lists of structured items (name, price, description, image).
- Tables with `caption`, `th` and `scope`.
- Links with descriptive text; external links indicated.
- Reflows at 320 px width without horizontal scrolling (1.4.10); text resizable to 200%.
- Visible focus styles; full keyboard operation; no keyboard traps.
- Our own UI colours meet contrast 4.5:1. Colours inside source images are reported, not altered.
- Original page images available in an optional "view original page" disclosure, with alt text.
- No tracking scripts on hosted documents beyond privacy-friendly page-view counting.

### 8.5 Accessibility report
Contents:
- Document name, date, version, standards referenced (WCAG 2.2 AA; EN 301 549 clause 9).
- Summary: checks passed, auto-fixed count, reviewed count, open "needs review" count, unresolved count.
- Itemized list with page thumbnail, element, WCAG criterion, state, and who resolved it (AI / user).
- Method statement: what was automated, what was human-reviewed and by whom (account user).
- Limitations: "This report describes automated checks and the review performed in this tool. It is not a legal certification of conformance."

### 8.6 API surface (internal, Next.js routes)
```
POST   /api/check                     free check (no auth, rate-limited)
POST   /api/documents                 create + upload URL (auth, quota check)
POST   /api/documents/:id/process     enqueue pipeline
GET    /api/documents/:id             status, issues, links
PATCH  /api/documents/:id/structure   review edits → rebuild HTML/report
POST   /api/documents/:id/publish
GET    /api/documents/:id/export      ZIP
DELETE /api/documents/:id
POST   /api/billing/checkout          Stripe Checkout session
POST   /api/billing/portal            Stripe Customer Portal session
POST   /api/webhooks/stripe           subscription + payment events
GET    /d/:slug                       hosted accessible document (public)
```

### 8.7 Security and privacy (GDPR)
- All data and processing in EU regions. Sub-processors listed publicly (hosting, storage, AI provider, parser API, Stripe, email).
- AI and parser providers used under zero-data-retention / no-training terms. Verify before launch.
- Files encrypted at rest; signed URLs for private assets; hosted documents public by design (stated clearly at publish).
- Free-check files deleted immediately; source PDFs deleted 30 days after account deletion or on request.
- DPA available for business customers; cookie-less analytics on the marketing site where possible.
- Our own site is accessible (WCAG 2.2 AA) and has its own accessibility statement. Non-negotiable credibility requirement.

### 8.8 Cost model *(validate in stage 0)*
| Item | Target |
|---|---|
| Parsing | ~€0.01 / page |
| AI (structure + alt text + summary) | ≤ €0.04 / page |
| Total processing | **≤ €0.05 / page** |
| 20-page free document | ≤ €1 |
| Starter worst case (10 × 60 pages) | ≤ €30 → over budget, so cap AI work per page and measure; adjust page caps if needed |

Rule: processing cost must stay below 10% of revenue per plan at typical usage.

---

## 9. Marketing

### 9.1 Message
- **Headline:** "Make your brochure accessible in minutes — not weeks."
- **Sub:** "Upload a catalog or brochure. Get an accessible web version and an honest report. 3 documents free."
- **Pillars:**
  1. *Built for designed documents.* Catalogs, leaflets, brochures — not just forms.
  2. *Honest by design.* We show what we fixed and what you should check. No magic "compliant" badges.
  3. *You stay in control.* Review and edit everything before it goes live.
  4. *Simple pricing, cancel anytime.* Public prices. One click to cancel. Your files stay yours.

### 9.2 Tone rules
- Plain, calm, factual. Accessibility is about people, not fear.
- Never: "100% compliant", "avoid lawsuits instantly", "AI fixes everything".
- Always link regulation claims to a primary source.
- Our marketing pages are themselves accessible (alt text, captions, contrast).

### 9.3 Landing page structure
1. Hero: headline, sub, file drop for the free check, "No account needed".
2. Before / after: screen-reader view of a typical brochure vs. our output (own sample documents).
3. How it works: Upload → Review → Publish (3 steps).
4. What you get: accessible web version, report, export, embed.
5. Why us vs. generic tools (table from 1.4).
6. Regulation explainer: EAA / BFSG / ADA Title II in 3 short cards with sources.
7. Pricing (with "cancel anytime" and "files stay yours").
8. FAQ: Is this legally compliant? (honest answer) · Which files? · Where is my data? · Can I cancel?
9. Footer: accessibility statement, privacy, DPA, sub-processors.

### 9.4 Channels
| Channel | Action | When |
|---|---|---|
| **Free checker (SEO + virality)** | "Is your brochure accessible?" tool as the main entry point | launch |
| **SEO content (EN + DE)** | articles answering real queries (9.5) | from stage 2, 2 articles/week |
| **LinkedIn** | before/after posts, short screen-reader demo videos, founder build-in-public | launch |
| **Agencies & designers** | partner offer: 20% recurring commission or discounted Pro | after first 10 customers |
| **Print shops** | white-label-lite referral ("accessible digital version" upsell) | v2 |
| **Communities** | accessibility forums, design communities — contribute, don't spam | ongoing |
| **Product Hunt** | launch once the review editor is polished | after stage 2 |
| **Canva Apps Marketplace** | distribution channel for "accessible export" | later phase |

Do not run public teardowns of real companies' documents without permission. Use our own sample brochures.

### 9.5 SEO keyword clusters
- EN: "accessible PDF brochure", "make PDF accessible", "PDF accessibility checker", "European Accessibility Act PDF", "EAA PDF requirements", "ADA Title II PDF deadline", "is my Canva PDF accessible", "accessible product catalog", "WCAG PDF brochure".
- DE: "BFSG PDF barrierefrei", "barrierefreie PDF erstellen", "Barrierefreiheitsstärkungsgesetz Prospekt", "barrierefreier Katalog", "PDF Barrierefreiheit prüfen".

### 9.6 Launch sequence
1. **Pre-launch (stage 0–1):** landing with waitlist + free checker; 10 conversations with EU retail marketers and agencies.
2. **Soft launch:** waitlist users get free tier + feedback call; fix top issues.
3. **Public launch:** LinkedIn + Product Hunt + German SEO articles live; partner outreach to 30 agencies.
4. **Post-launch:** monthly "accessibility for marketers" newsletter from checker sign-ups.

---

## 10. Metrics

| Metric | Definition | Target *(proposal)* |
|---|---|---|
| Checker → sign-up | sign-ups / free checks | ≥ 15% |
| Activation | users who publish ≥ 1 document / sign-ups | ≥ 50% |
| Free → paid | paying users / users who used all 3 free docs | ≥ 8% |
| Review load | open "needs review" items per 20 pages | ≤ 10, trending down |
| Processing time | upload → review screen, 20 pages | ≤ 3 min |
| Cost ratio | processing cost / revenue | ≤ 10% |
| Monthly churn | cancelled / active paid | ≤ 6% |

---

## 11. Roadmap

| Stage | Duration (estimate) | Output | Exit criteria |
|---|---|---|---|
| **0. Quality gate** | 1 week | Script running the pipeline on 10 real-world style brochures (multi-column, product grids, text on images) | reading order correct on ≥ 90% of blocks (manual check); alt text acceptable on ≥ 85% of images; 0 critical axe-core violations; ≤ €0.05/page; **if not met, stop or narrow the document type** |
| **1. MVP** | 3–4 weeks | Sections 4.1 + 5 + 6 + 7 + 8 | 5 external testers publish a document end-to-end |
| **2. Launch** | 2 weeks | Landing, checker, SEO starter content, Stripe live | first paying customer |
| **3. v2** | after ~10 paying customers | Tagged PDF, multilingual, branding-free embed, versioning | veraPDF pass on 80% of outputs |
| **4. Distribution** | after v2 | Canva app, agency plan | — |

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Output quality on complex layouts | product fails its promise | stage 0 gate before any app code; review editor; narrow to document types that pass |
| Legal claims misread as guarantees | regulatory / reputational | strict wording rules (1.3, 9.2); report limitations section |
| EAA scope smaller than marketed by others (B2B and microenterprises exempt; national thresholds) | smaller EU market | target B2C retail; include US Title II and agencies |
| Adobe / Canva improve native accessible export | wedge narrows | specialize in designed documents; HTML-first output; honest reporting |
| AI cost spikes on image-heavy documents | margin | per-page AI budget; page caps; measure per plan |
| Hosting abuse (phishing) | domain reputation | noindex free tier, abuse reporting, takedown flow |
| Tagged PDF harder than expected | v2 delay | HTML-first positioning; evaluate vendor SDK/API vs. own tagging |

---

## 13. Legal checklist before launch
- Terms of Service (no conformance guarantee; customer responsible for final review).
- Privacy policy, DPA, sub-processor list.
- Cookie policy (prefer cookie-less analytics).
- Accessibility statement for our own site.
- Company entity, VAT registration, Stripe Tax configured.
- All code written from scratch; only licensed third-party services and open-source libraries with compatible licenses.

---

## 14. Open decisions
1. Domain (check availability of variants of "makeitaccessible").
2. Launch market order: Germany + English (recommended) or English only.
3. Final prices and page caps (after stage 0 cost measurement).
4. Parser provider (decide in stage 0 on quality per layout type).
5. Auth/DB provider: Supabase all-in-one vs. Neon + Auth.js.
