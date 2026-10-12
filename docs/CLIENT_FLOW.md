# Client flow (agreed 2026-10-12)

Source for the SPEC.md rewrite. Changes against the original SPEC are listed at the end.

## 1. Free check, no account
The visitor uploads a PDF on the landing page and gets, in seconds and without AI: whether the document has structure, how many images lack a text alternative, whether the text layer is readable or corrupt. Shown as "N issues in M checks", never as a score. The file is deleted immediately. Call to action: try it free on your own document.

## 2. Account and trial, no card
Sign-up with email + password or magic link. The user can upload **any document**; we say up front that **only its first 10 pages are processed** in the trial. One onboarding question: "Must the original PDF stay downloadable on your site?" (the answers decide whether a tagged PDF is built).

## 3. Processing
The cost in page credits is shown before starting. Pages we cannot process correctly (e.g. a corrupt text layer) are marked **unsupported and not charged**. Email when done.

## 4. Review editor
Split view: original page left, accessible version right. Every element carries one of three labels:
- **auto-checked** — prices recomputed from the PDF, text confirmed against the text layer;
- **AI-generated** — alt text and text read from badges; labelled, no action required;
- **needs review** — uncertain grouping, prices read from bare digits, image text containing digits, words left unused. This is the user's actual work (0–2 items per page on the tested grids).

Editable: text, alt text, order, heading levels, product grouping (split / merge).

## 5. Per-document report
What was checked automatically, what AI generated, what the user confirmed, what remains open. Never "compliant" or "certified".

## 6. Publish (paid plans only)
The trial shows the result and the report but cannot publish: a partial document cannot replace the PDF. Paid plans: hosted link, embed snippet, ZIP export; a short guide "replace the link to the PDF with this page" (a PDF left online is assessed on its own); a new version at the same URL for next week's leaflet.

## 7. Billing
Monthly Stripe subscription with page credits (1 page = 1 credit, a spread = 2), add-on credits, one-click cancel in the Stripe portal.

## Changes against the original SPEC
| Original SPEC | Now |
|---|---|
| 3 free documents | first 10 pages of any document, no publishing |
| quotas per document | page credits |
| tagged PDF in v2 | HTML as the replacement only; tagged PDF depends on the onboarding answers |
| "needs review" for every AI decision | three labels; only what needs a human decision goes to review |
| free check scored out of 100 | "N issues in M checks" |
| every page processed | unsupported pages marked and not charged |
| cost target ≤ €0.05 per page | measured ~$0.04 (text) to ~$0.07 (grids); lower with the Batch API in the MVP |

Open: concrete prices (from the measured cost, at ≤ 25 % of revenue) and the stage-0 verdict; a NARROW verdict limits the launch flow to the document types that passed.
