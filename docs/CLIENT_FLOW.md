# Client flow (agreed 2026-10-12)

Source for the SPEC.md rewrite. Changes against the original SPEC are listed at the end.

**Superseded in part on 2026-10-16 and 2026-10-20** (PROGRESS, Decisions; SPEC §6): the buyer is a restaurant with PDF menus, and what it pays for is the kept page, not a conversion: one price per venue (founding £25 / $29 a month, list £35 / $45; annual by default), up to 60 live pages, every update included, the same link for every new version, Stripe. Sections 2, 3, 6 and 7 below describe page credits and a self-serve trial for long documents; they stand for later segments and are rewritten with the SPEC.

## 1. Landing: a converted example, and a free check (decided 2026-10-13)
The landing page shows a **sample PDF already converted**: the original next to the accessible page, with the three labels and the report, served from a file we keep. No upload and no AI cost; it is what convinces the visitor that the tool is useful.
Next to it, the **free check** stays: the visitor uploads a PDF and gets, in seconds and without AI: whether the document has structure, how many images lack a text alternative, whether the text layer is readable or corrupt. Shown as "N issues in M checks", never as a score. The file is deleted immediately.
Call to action: **"Try it on your PDF"**, which needs an account. No AI runs for a visitor without one.

## 2. Account and trial, no card
Sign-up with email + password or magic link. The trial converts **one PDF of up to 10 pages** (a longer PDF: its first 10 pages); anything more needs an upgrade. One trial per account; disposable email domains are refused and a bot check runs before the upload. One onboarding question: "Must the original PDF stay downloadable on your site?" (the answers decide whether a tagged PDF is built). The trial runs on the model's batch lane (cheaper, minutes instead of seconds, email when done).

## 3. Processing
The cost in page credits is shown before starting. Pages we cannot process correctly (e.g. a corrupt text layer) are marked **unsupported and not charged**. Email when done.

## 4. Review editor
Split view: original page left, accessible version right. Every element carries one of three labels:
- **auto-checked** — prices recomputed from the PDF, text confirmed against the text layer;
- **AI-generated** — alt text and text read from badges; labelled, no action required;
- **needs review** — uncertain grouping, prices read from bare digits, image text containing digits, words left unused. This is the user's actual work (measured 2–6 per page on the stage-0 grids; target ≤ 0.5, `docs/HARDENING.md`);
- **checked by us against the PDF** — a needs-review detail Make It Accessible compared with the owner's PDF by hand (2026-10-22, Andrei: it goes live before the owner confirms; `eval/approved.ts`): bound to the exact words published, never an error; the owner is told and corrects it by replying.

Editable: text, alt text, order, heading levels, product grouping (split / merge).

## 5. Per-document report
What was checked automatically, what AI generated, what the user confirmed, what remains open. Never "compliant" or "certified". First version built (2026-10-20, `eval/report.ts`, `report.json` beside held.json): per page whether it opens As printed or as Text only and why, in the switch's words ("Page 2 opens as Text only, where every word reads clearly. Nothing for you to do."), how many details on it wait for the owner's confirmation, and once per document the details As printed still differ from the print ("the letter spacing of some lines", "a dotted line or frame"). The wording of each held detail for the owner is the review editor's (§4). Since 2026-10-22 each detail checked by us against the PDF is named once, dated: "On 22 October 2026, Andrei at Make It Accessible checked this detail against your PDF by hand: STILL / SPARKING WATER: 330ml 2.50, 750ml 4.25. If it differs from your menu, reply to this email and we'll correct it." Several on one page make one sentence per day and person, labels apart by semicolons, and one closing ("…checked these details…: A; B. If anything differs…"). A label says what the page shows, as the print does ("shown without a dairy-free mark, as in your PDF"), never a claim about the dish.

## 6. Publish (paid plans only)
The trial shows the result and the report but cannot publish: a partial document cannot replace the PDF. Paid plans: hosted link, embed snippet, ZIP export; a short guide "replace the link to the PDF with this page" (a PDF left online is assessed on its own); a new version at the same URL for next week's leaflet.

## 7. Billing
Restaurants: one subscription per venue, annual by default, monthly available (SPEC §6), through Stripe Checkout and Stripe Tax; one-click cancel in Stripe's Customer Portal (`docs/COSTS.md`). Later segments: page credits (by page area: 1 credit per A4 equivalent, so a spread costs 2 whatever the layout setting) and add-on credits.

## Changes against the original SPEC
| Original SPEC | Now |
|---|---|
| 3 free documents | a converted example on the landing page; one PDF of up to 10 pages in the trial, with an account; no publishing |
| quotas per document | page credits |
| Stripe and Stripe Tax | Stripe and Stripe Tax (Paddle considered 2026-10-12, dropped 2026-10-18) |
| tagged PDF in v2 | HTML as the replacement only; tagged PDF depends on the onboarding answers |
| "needs review" for every AI decision | three labels; only what needs a human decision goes to review |
| free check scored out of 100 | "N issues in M checks" |
| every page processed | unsupported pages marked and not charged |
| cost target ≤ €0.05 per page | measured ~$0.04 (text) to ~$0.07 (grids); lower with the Batch API in the MVP |

Open: concrete prices (from the measured cost, at ≤ 25 % of revenue; first numbers in `docs/COSTS.md`) and the stage-0 verdict; a NARROW verdict limits the launch flow to the document types that passed.

## Open questions from the landing design (2026-10-18)
Raised by the design of the restaurant flow (landing, check, preview, publish). Each carries a recommendation, not a decision: Andrei decides before the website is built.

| Question | Recommendation |
|---|---|
| Must the original PDF stay downloadable next to the page, or does the page replace it? Asked at publish, no longer at sign-up. | Default: the page replaces the link to the PDF. An owner may keep the PDF, told once that a PDF left online is assessed on its own (§6). |
| Path B: the check deletes the file, sign-up keeps it in the tab. If the tab closes before the code is typed? | Ask them to choose the file again; keep nothing server-side, so "the file is deleted as soon as the check ends" stays true. |
| Path A: anyone with the email link opens the preview. Can someone else (a manager on another address) keep and pay for it? | Yes: whoever pays owns the venue's account; the address we wrote to is told it was taken. |
| Menu updates: live when the automatic checks pass, or after the owner confirms "needs you" items? Turnaround? | Live at once when nothing needs the owner; otherwise the current version stays live until the owner, or we against the PDF (2026-10-22), confirm, so an uncertain price is never published unchecked. Minutes on the batch lane, with an email. |
| After cancelling: does the link stop, redirect to the PDF, or show a notice? | SPEC §6.1: live to the end of the paid period and 30 days more, with reminders; then a notice linking to the venue's own site, never a dead link. |
| More than 10 pages in all (lunch, dinner, drinks): what is offered, at what price? | Decided 2026-10-20 (SPEC §6): a venue covers up to 60 live pages; more counts as a second venue. |
| Unsupported pages (a photographed drinks board): can the owner type the items in, and does that fit "never retyped"? | Yes, labelled "entered by the venue" in the page and the report, outside "checked against the PDF": "never retyped" is about us, not the owner. |
| Link domain: is menus.makeitaccessible.com right; can a venue use its own domain? | Domain not chosen yet (SPEC §5.5, "domain TBD"); own domains later (SPEC §4.3). |
| Pricing: is the price VAT-inclusive, is US sales tax added, any minimum term or first-month offer? | Stripe Tax computes VAT and sales tax; whether the UK price includes VAT is Andrei's call, after the accountant. Annual by default, monthly available, cancel anytime; no first-month offer. |
| The 30-day deletion of an unkept preview: a reminder before deleting? | Yes, one reminder a few days before, sent only once Andrei has approved the product's own emails. |
| UK spelling ("colour", "cancelled") as well as £ on the UK version? | Yes: the UK version reads as British English. |
