# AGENTS.md — Make It Accessible

Read before coding, in order: this file → README.md → PROGRESS.md → docs/ROADMAP.md (tracker) → docs/HARDENING.md (current plan).

## What this is
A SaaS that turns a designed PDF (retail leaflet, catalog, brochure) into an accessible HTML version, with an honest per-document report and a review editor. The wedge is product grids with price fidelity. Current phase: stage 0, a measured quality test of the pipeline against hand-written answer keys. Stack: pnpm workspaces, Node 26 running TypeScript natively, TypeScript 6 strict, zod, Poppler CLI, Claude (stage 0 via Claude Code headless mode), Playwright + axe for scoring.

## Hard rules
- Max 300 lines per non-test file (ESLint `max-lines` enforces it); new files target ≤200. Check line counts of files you will touch; split an over-cap file before adding to it.
- Comments: max 2 lines, prefer 1, only the non-obvious "why". Never narrate changes. Re-read every comment before finishing.
- Types are defined, never asserted: no `as` (except `as const`), no non-null `!`, no `any`. External data (files, model output, CLI events) is parsed with zod; types are inferred from the schema, not written twice.
- Erasable TypeScript only (no `enum`, no parameter properties, no namespaces): Node strips types at run time.
- No barrel files. Import from the defining module (`@make-it-accessible/pipeline/pdf/runs`).
- Pure logic separated from IO (Poppler, model calls, browser); the pure parts get unit tests.
- One concern per change. No adjacent refactors, no scope expansion. No dead code, no commented-out blocks, no `console.log`.
- Shared values (thresholds, budgets, prices) are named constants in the module that owns them.
- Every fix ships with its test. Never weaken a test to make it pass.

## Project rules
- Honest claims only: never "compliant", "certified", "100 %" in code, docs or copy.
- Never mention or reference the author's employer or its code anywhere in this repository.
- Publishers' PDFs and anything derived from them (renders, text, competitor output) stay local and out of git; see `validation/SOURCES.md`.
- Answer keys under `validation/keys/` are frozen by SHA-256 in `validation/KEYS.md`. Any edit is logged there with the reason before it is used.
- Never name competitors next to our test results in tracked files; comparisons stay in `validation/private/` (local only).
- The stage-0 prompt is frozen once its hash is recorded; held-out pages are never used for tuning.
- Docs in English. Replies to Andrei in natural Romanian (no word-for-word translation), English tech terms kept.

## Git
- Never push: Andrei pushes. Hand over the exact commands. Commit only when asked. No AI-attribution trailers. Commit email: purcar.andrei28@gmail.com.

## Definition of done
```
pnpm check        # typecheck + lint + format check + tests
```
All green before declaring done. List every file touched. Behaviour-preserving refactors are confirmed with `pnpm stage0 --rescore <run>` (scores must not change).

## Docs upkeep
- Docs are the source of truth: update them in the same change or stop and ask.
- Record regression guards (incident + "do not remove") and dead ends (evidence + "do not rebuild") in README.md.
- Log decisions in PROGRESS.md and stage-0 results in docs/STAGE0.md, dated.
- Tick tasks in docs/ROADMAP.md in the same change that completes them.
