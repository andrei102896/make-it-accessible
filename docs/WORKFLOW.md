# Workflow: optimisation and automation plan (2026-10-16)

Why: the first US batch (20 menus) took ~15 minutes of compute and ~$2.90 of model calls, but about two hours of ad hoc scripting (rebuild, recount, screenshots, axe, overflow, keyboard), and every new batch of documents has so far cost half a day to a day of engine repairs. Andrei's part is manual too: reviewing 38 screenshots or 19 files, copying previews into a protected folder, deploying, pasting emails. The demand loop (send, wait, follow up) is the slow path; the engineering between its steps must become cheap.

## Measured today
| Step | Compute | My time | Andrei's time |
|---|---|---|---|
| 20 conversions (`pnpm adhoc` ×20, 4 in parallel) | ~12 min, $2.90 | 5 min | — |
| Triage of findings (726 → 21 real) | — | ~1 h, needed two rule changes | — |
| Rebuild, recount, screenshots, axe, overflow, keyboard | ~10 min | ~1.5 h of scratch scripts | — |
| Review of pages | — | — | 19 files × 2 views, not yet done |
| Publish a preview (portofolio, Vercel) | 1 min | — | copy + `vercel --prod` per batch, blocked once by a wrong commit author |
| One email (draft in Proton) | — | 2–3 min each | reads, presses Send |

## Principles
1. One command per recurring job; no scratch scripts copied into `packages/eval/src` and deleted again.
2. Andrei touches three things: the review page, Send, and `git push`. Everything else is a command I run or a script that runs itself.
3. Measure the whole batch before planning a fix (lesson 2026-10-16: "one decimal (1)" was 43).
4. Build only between demand steps when the batch report shows a defect an owner would see. Everything else waits for replies.

## Plan, in order of payoff

### 1. Publish previews from this repo (0.5 day) — unblocks the next send · done 2026-10-16 (served from andreiprojects.com/preview, deployed with the Vercel CLI; Andrei chose his own site over Cloudflare Pages)
- `previews/` (gitignored content, tracked `README`) holds the pages to publish; `pnpm preview:add <page.html> <slug>` copies a page in with `noindex`, a random suffix and a row in `previews/EXPIRY.csv` (slug, url, added, delete-by = +30 days).
- `pnpm preview:publish` copies the listed pages into the portfolio site (`../portofolio/public/preview`, Andrei granted write access on 2026-10-16) ; Andrei runs `vercel --prod` there (the CLI needs his login and a readable cwd).
- `pnpm preview:expire` deletes rows past their date and republishes.
- Replaces: copying into `~/Desktop/portofolio` (protected by macOS), `vercel --prod`, the commit-author trap.

### 2. Batch report (1 day) — one page for Andrei instead of 38 files
- `pnpm batch <targets.csv> [--out batch/<date>]`: downloads each PDF into its own empty folder, gates it (`pdfinfo`: ≤20 pages, not copy-protected; a page with no text layer is read by OCR since 2026-10-19), runs `pnpm adhoc` with 4 in parallel, then writes `batch/<date>/report.html`:
  - per menu: PDF render (page 1) beside our page at 1280 and 390, findings (errors, review, design details not reproduced), axe/forced/1.4.12/overflow/keyboard results, cost, the researched hook line, an approve/reject checkbox that writes `decisions.json` (local file, no server);
  - a summary row: converted, gated out and why, cost, total findings.
- `pnpm inject [--per 3] [--verify [--sealed]]` (2026-10-19): injects content defects into every saved page and counts those the gates catch (`out/inject.json`); `--verify` runs on the verification set, `--sealed` on its sealed half (aggregates only).
- `pnpm fidelity [--verify [--sealed]] [<slug>…]` (2026-10-23): every rebuilt document's pages as shown (the backdrop pdf.js drew, our text transparent) against their PDF drawn by pdf.js, in one Chromium at retina density: the page's ink over the page and per eighth of its height, under 0.85 of the PDF's reported as lighter (`pdf/fidelity-verdict.ts`); `pNN/fidelity.json`, `out/fidelity.json`. Reported only: inside every build (`eval/printcheck.ts`) a page shows Text only when its transparent text misfits or collides, and `report.json` says why in the owner's words. Until 2026-10-23 it measured our redrawn letters per line and `--inject` placed print defects in them; both went with the redrawn letters. `pnpm rerender --all --verify [--sealed]` rebuilds the verification set first.
- `pnpm review:open --all | <slug>… [--with <page.html> <file.pdf>]` (done 2026-10-18): out/rebuilt/review.html, every document's PDF pages beside our printed sheets captured at a desktop width (1440 px), each PDF page drawn by pdf.js in the same Chromium at its sheet's width (since 2026-10-18: Poppler's raster drew strokes 20–30 % lighter than the browser, Bannatyne p2; Poppler stays the labelled fallback), no switch or contents box; opened in Safari after every rendering change so Andrei reviews the whole set (memory: his eye is the final judge).
- Promote the scratch scripts to commands used by `batch` and on their own: `pnpm rerender <slug>|--all` (done 2026-10-16; `rebuild` is pnpm's own command: renders a saved run again into out/rebuilt, from the local source list), `pnpm check:page <html> [--shots]` (done: axe at 1280/390/320, forced colours, 1.4.12, overflow), `pnpm preview:refresh [--copy <dir>]` (done: the listed previews take their rebuilt pages); still scratch: recount, keyboard.
- Replaces: the zz-* scripts, manual screenshot folders, me reading findings out of logs.

### 3. Outreach as commands (0.5 day) — drafts, never sends · due and log done 2026-10-18
- `pnpm outreach:due [--date YYYY-MM-DD]` prints the day's follow-ups from `targets.csv`, oldest first, at most 20 (follow-up 1 from day 3 after `sent`, follow-up 2 from day 8 and at least 3 days after the first; a bounce or a real reply stops them, an auto-reply does not), each greeted and signed as its first email in `batch*.json` (a later batch replaces an earlier draft to the same address; US ones keep the address and opt-out lines), with the document the first email named, a CHECK line where it had to guess, and the `outreach:log` line to record them once sent.
- `pnpm outreach:log <sent|followup1|followup2|reply> <date or text> <business>...` records sends (several businesses at once, never over a date already set) and a reply word for word (one business, appended); `targets.csv` is rewritten whole and the previous copy kept as `targets.csv.bak`.
- `pnpm outreach:drafts <batch.json>` (Proton drafts over CDP from the approved pages) waits for the wave of 20: follow-ups are replies in existing threads, which a paste covers, and clicking in Proton once sent an email.
- Once: a mail-tester.com run to know whether the Proton address lands in spam; until then, "0 replies" is not interpretable.

### 4. Guards that run themselves (0.5 day)
- `pnpm rescore:baseline`: rescores the two stage-0 runs and compares with the saved baseline outputs under `validation/baselines/` (hash, not my eye on a diff).
- `.githooks/pre-commit` (`git config core.hooksPath .githooks`): typecheck, lint, format check (~20 s); tests and rescores stay in `pnpm check`, run before every hand-over.
- `pnpm check:pages` on five fixture documents (Kendells, Carew, BILLA, Stone House, Bannatyne, from their saved runs) before every commit that touches `html/`.

### 5. Engine work only from the report (ongoing)
- A rule changes only when the batch report shows it on an owner's page; the fix follows plan → two critics → tests → `pnpm check` → `rescore:baseline` → `check:pages` → `/reviewer`, as now, but the measurements come from the report, not from scratch scripts.
- Known items waiting for evidence: `gf`-style codes printed before names as tags, a dish whose only picture is a tiny logo, a qualifier equal to the description, the scorer following the validator on currency-less prices.

### 6. Session hygiene (me)
- Small steps, one verification each; no chained commands that fail silently in the middle.
- SSH URLs for every GitHub remote; the right commit email is now chosen by remote (`~/.gitconfig` includeIf).
- Whole-batch counts before any plan; lessons appended after every critic round.

## Order and effort
1 → 2 → 3 → 4, about 2.5 days in total, interleaved with the demand steps: step 1 before the 20 emails go out (the links), step 2 right after (the follow-up batch and every batch after), step 3 before the follow-ups on 19–21 Oct, step 4 whenever an engine change is next needed.

## What we track from now on
Per batch: pages converted, gated out, model cost, findings per page (errors, review), defects Andrei rejects, my time, Andrei's time; per wave: sent, delivered (mail-tester), replies, PDFs received, price answers. Written in `batch/<date>/summary.json` and `outreach/targets.csv`, summarised in PROGRESS when a decision depends on them.
