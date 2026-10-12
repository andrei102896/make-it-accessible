# Make It Accessible

Upload a designed PDF (catalog, leaflet, brochure) and get an accessible HTML version, an honest per-document report and a review editor before publishing. The focus is product grids, where every price must stay attached to the right product.

The repository currently holds **stage 0**: the processing pipeline and the harness that measures it against hand-written answer keys. Plan and results: [docs/STAGE0.md](docs/STAGE0.md). Product spec: [docs/SPEC.md](docs/SPEC.md).

## Stack
- pnpm 12 workspaces, Node 26 (runs TypeScript directly), TypeScript 6 strict (`exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`)
- zod 4 for every external boundary; types inferred from schemas
- Poppler CLI (`pdftotext -tsv`, `pdftohtml -xml`, `pdftoppm`) for text, image positions and rendering
- Claude Sonnet 5.5 for page structure; in stage 0 called through Claude Code headless mode
- Playwright + axe-core for scoring the generated HTML
- ESLint 10 (`typescript-eslint` strict type-checked) + Prettier, `node:test`

## Run / validate
Requires Node 26, Poppler (`brew install poppler`) and, for model runs, a logged-in Claude Code.

```
pnpm install
pnpm check                              # typecheck + lint + format check + tests
pnpm stage0                             # run the tuning pages through the model and score them
pnpm stage0 --pages heldout             # held-out pages (gate only)
pnpm stage0 --only 3 01_billa           # one page of one document
pnpm stage0 --effort high --model claude-opus-5-5
pnpm stage0 --rescore out/<run>         # rebuild HTML and scores from a saved run, no model calls
pnpm adhoc <file.pdf> [--pages 1-5]     # any PDF without an answer key: validator findings, axe, cost
```

The test PDFs are not in git (see [validation/SOURCES.md](validation/SOURCES.md) for URLs and hashes). Tests that need them are skipped when they are missing.

## Architecture map
```
packages/pipeline/src/        product code, reused by the MVP
  pdf/types.ts                Box, Run, Extraction schemas and types
  pdf/poppler.ts              text runs and image positions from Poppler
  pdf/raster.ts               model image size budget, page and crop rendering
  pdf/runs.ts                 joining words, euro/cent pairing, amount of cited words, overprint duplicates
  pdf/paragraphs.ts           grouping printed lines into paragraphs
  pdf/geometry.ts             box arithmetic
  text/normalize.ts           norm (scoring) and canon (provenance) text forms
  text/money.ts               amounts in minor units, formatting, page currency
  model/schema.ts             page structure schema returned by the model
  model/prompt.ts             system prompt and the text inventory sent with the image
  model/client.ts             model call (Claude Code headless in stage 0)
  model/structure.ts          one page: call, parse, single retry
  validate/validate.ts        provenance, price, coverage and alt-text checks
  html/document.ts            deterministic accessible HTML renderer
packages/eval/src/            stage-0 harness, never shipped
  keys.ts                     answer-key schema, loader and validation against the PDF
  score/metrics.ts            C1–C5 metrics (pure)
  score/score.ts              browser scoring
  score/axe.ts                axe summary for any HTML
  process.ts                  one page through the pipeline, HTML assembly, model prices
  run.ts                      CLI: run, score, rescore against the answer keys
  adhoc.ts                    CLI: any PDF without a key
validation/                   answer keys, sources, results (PDFs and renders local only)
docs/                         SPEC, VALIDATION protocol, STAGE0 plan and log
out/                          run outputs (local only)
```

## Regression guards
- **Never use the PDFKit page extracts as input.** They break the glyph mapping ("Kar!ol", "%45!%"); run on the originals, cut subsets with `qpdf --pages` if needed. Do not remove the warning in SOURCES.md.
- **`joinRuns` touching gap is 0.02 of the box height.** At 0.15 it glued words in condensed bold fonts ("JEDENDONNERSTAG"); ligature splits are 0 pt apart. Do not raise it.
- **`centPartner` needs cents ≥ 30 % of the euro height and picks the nearest candidate.** Without it "13" paired with "20 Flaschen". Do not loosen.
- **Euro/cent pairs are found by position, not stream order.** BILLA p3 emits several euro digits before their cents.
- **Scorer reads `innerText`, not `textContent`.** `textContent` glued "€ 2.99" to "2+1" and hid the amount.
- **`amountOf` picks one amount or fails.** A euro/cent pair, else the single word with a separator, else one bare number. Joining all cited numbers turned "(1 kg 22.34)" into 122,34 (`runs.test.ts`). The model never writes amounts, so this is the only guard.
- **The scorer must score a perfect page at 100 %** (`score.test.ts`). It caught a false "repeated sentence = invented" rule.

## Dead ends
- **Effort `low` on Sonnet 5.5:** 3 of 6 pages failed outright (broken JSON or schema after the retry), alt text vanished on BILLA p3; not cheaper once retries count. Do not use without new evidence.
- **`pdftohtml` image boxes as final figure boxes:** they are raster bounds, not the visible area (transparent margins, clipped photos, backgrounds). Kept only as hints for the model.
- **Compact citations** (single word ids mixed with ranges in one `src` list): the model confused `[23,25]` with a range, wrote plain strings and broken JSON; 9 of 12 pages needed a retry. Ranges only.
- **Model-as-judge for alt text:** rejected in planning; product alt is checked mechanically, editorial images by hand.
