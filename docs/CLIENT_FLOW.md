# Client flow (agreed 2026-10-12)

Source for the SPEC.md rewrite. Changes against the original SPEC are listed at the end.

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
- **needs review** — uncertain grouping, prices read from bare digits, image text containing digits, words left unused. This is the user's actual work (measured 2–6 per page on the stage-0 grids; target ≤ 0.5, `docs/HARDENING.md`).

Editable: text, alt text, order, heading levels, product grouping (split / merge).

## 5. Per-document report
What was checked automatically, what AI generated, what the user confirmed, what remains open. Never "compliant" or "certified".

## 6. Publish (paid plans only)
The trial shows the result and the report but cannot publish: a partial document cannot replace the PDF. Paid plans: hosted link, embed snippet, ZIP export; a short guide "replace the link to the PDF with this page" (a PDF left online is assessed on its own); a new version at the same URL for next week's leaflet.

## 7. Billing
Monthly subscription through Paddle as merchant of record (it handles US sales tax, UK VAT and EU VAT; `docs/COSTS.md`) with page credits (by page area: 1 credit per A4 equivalent, so a spread costs 2 whatever the layout setting), add-on credits, one-click cancel in Paddle's customer portal.

## Changes against the original SPEC
| Original SPEC | Now |
|---|---|
| 3 free documents | a converted example on the landing page; one PDF of up to 10 pages in the trial, with an account; no publishing |
| quotas per document | page credits |
| Stripe and Stripe Tax | Paddle as merchant of record |
| tagged PDF in v2 | HTML as the replacement only; tagged PDF depends on the onboarding answers |
| "needs review" for every AI decision | three labels; only what needs a human decision goes to review |
| free check scored out of 100 | "N issues in M checks" |
| every page processed | unsupported pages marked and not charged |
| cost target ≤ €0.05 per page | measured ~$0.04 (text) to ~$0.07 (grids); lower with the Batch API in the MVP |

Open: concrete prices (from the measured cost, at ≤ 25 % of revenue; first numbers in `docs/COSTS.md`) and the stage-0 verdict; a NARROW verdict limits the launch flow to the document types that passed.
