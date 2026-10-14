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
pnpm stage0                             # tuning documents (validation/split.json) through the model, scored
pnpm stage0 --pages dev                 # dev half; --pages test needs --sealed-test (opened once, phase C)
pnpm stage0 --only 3 01_billa           # one page of one document
pnpm stage0 --effort high --model claude-opus-5-5
pnpm stage0 --rescore out/<run>         # rescore a copy of a saved run (out/<run>-rescore-<time>), no model calls
pnpm aggregate <run> <run> <run> [--before <run> ...]   # 3-run pass rule, price bounds, decisions, regressions
pnpm adhoc <file.pdf> [--pages 1-5] [--title "Evening menu"]   # any PDF without a key: findings, axe, cost, and one self-contained <name>.html to send
pnpm keys:check <key.json> [--pdf <file>] [--set dev|test] [--details]   # one key against its PDF and word snapshot
pnpm select-pages --seed <commit SHA>   # A4 page draw → validation/selection.json (once, after the rules commit)
pnpm ledger <doc> <pdfPage> [--details]  # a page's money occurrences and word-snapshot SHA, for key writers
pnpm keys:stage --set dev [--out <dir>] [--only <doc>-p<NN>]   # evidence folders for the blind key writers (default ../mia-keys)
pnpm keys:write --page <doc>-p<NN> --writer a|b [--model --effort --budget --minutes]   # one confined key writer, then its audit
pnpm keys:compare <a/key.json> <b/key.json>   # two blind keys of one dev page, difference by difference (exit 1 on any)
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
  pdf/crop.ts                 picture crops: word extents in their text colour, own words kept whole, other offers cut at the edge, boxes grown back over a cut-off badge
  pdf/pixels.ts               PPM page renders as pixels
  pdf/visibility.ts           words in the text layer that draw nothing on the page (covered or invisible): never published
  text/normalize.ts           norm (scoring) and canon (provenance) text forms
  text/money.ts               amounts in minor units, formatting, page currency
  model/schema.ts             page structure schema returned by the model
  model/prompt.ts             system prompt and the text inventory sent with the image
  model/client.ts             model call (Claude Code headless in stage 0)
  model/structure.ts          one page: call, parse, single retry
  validate/validate.ts        provenance, price, coverage and alt-text checks
  html/document.ts            deterministic accessible HTML renderer: menus as rows, products with pictures as cards, galleries, contents on long documents
  html/style.ts               the page's CSS (no generated text: screen readers would hear it, the scorer would not)
  html/theme.ts               the document's colours, sampled at its words (never its photos), WCAG-checked
  html/color.ts               WCAG contrast and OKLab lightness moves (a brand colour made readable on light and dark)
  html/source.ts              the visible words a text cites (hidden ones left out); picture boxes of a page
  html/inline.ts              links from printed addresses and phone numbers, a menu's dietary legend and tags, badges
  html/nav.ts                 section links for menus and leaflets, a contents list for price lists and long documents
  model/brief.ts              one AI look per document: type, title, brand swatch picks, heading class, validity dates
  pdf/fonts.ts                the heading class from the PDF's font names (pdffonts), before the brief's guess
packages/eval/src/            evaluation harness, never shipped
  key-schema.ts               key schema as the scorer reads it (stage-0 files parse into it directly)
  key-schema-v3.ts            version-3 key files: products, one claim per money occurrence, tables with cell kinds
  key-v3.ts                   version-3 claims and manual amounts into per-product prices; ledger hash
  key-v3-check.ts             version-3 validation: claims, corrections, manual amounts, split/merged, cells, products
  key-v3-printed.ts           words printed with a price, proven at its place: page-price offers, render-read conditions
  key-v3-fixture.ts           test fixture: a tuning page written as a version-3 key
  key-v3-page-fixture.ts      test fixture: a synthetic version-3 page with given words and occurrences
  score/rules-fixture.ts      test fixture: a strict key page and a minimal accessible page, scored in the browser
  ledger.ts                   money occurrences of a page from its words (glyph runs, chained cents, unreadable)
  snapshot.ts                 frozen word snapshots of keyed pages, drift check
  keys.ts                     key loader (sealed keys from validation/sealed/) and validation against the text layer
  key-proof.ts                amounts the text layer proves for stage-0 keys, eval-owned
  words.ts                    the eval's own word boxes (pdftotext -tsv), independent of the pipeline
  selection.ts                A4 page facts, eligibility, seeded draw and reserve (pure)
  select-pages.ts             CLI: the A4 page draw per document
  ledger-cli.ts               CLI: the occurrence ledger and snapshot words of one page (sealed pages print counts only)
  stage.ts                    CLI: one folder per selected dev page: read-only evidence, a writer folder each, a record in validation/private/stage
  stage-draw.ts               staged images from one 300 DPI render: tiles with point rulers, outlined overlays and crops, overview
  stage-geometry.ts           where the staged images cut the page (pure)
  write-key.ts                CLI: one blind writer as a headless Claude Code process confined to its folder (dontAsk, path rules, no user settings)
  key-audit.ts                a writer run's audit: transcript against the allowlist, unchanged evidence, key on the staged page
  compare-keys.ts             two keys of one page compared in the scorer's own forms (loose anchors, whole-word conditions, offer tokens)
  compare-keys-match.ts       pairs writer-chosen ids: manual entries by place, products by claimed amounts, tables by claimed cells
  compare-keys-cli.ts         CLI: prints the differences and disputes of a dev pair; refuses test documents
  file-hashes.ts              SHA-256 of every file under a folder
  keys-check.ts               CLI: validate one key file; sealed keys print counts only
  manifest.ts                 split (tuning/dev/test) and layout-label manifests
  score/metrics.ts            C1, C3, C4 and C2 per page (pure)
  score/prices.ts             C2 per output product: amount, accepted roles, currency, conditions, add-ons sharing it
  score/conditions.ts         a condition is a whole, non-negated phrase of its label; a page-price offer printed word for word
  score/coverage.ts           C3 whole-text coverage (reported, not gating)
  score/tables.ts             C5 headings and table rows
  score/layout.ts             printed pages: order, labels, anchor placement
  score/decisions.ts          review decisions per page
  score/money.ts              the scorer's own price reader, independent of the pipeline
  score/aggregate.ts          3-run summary, bounds, regression rule
  score/dom.ts                reads the rendered sections in the browser
  score/score.ts              browser scoring
  score/axe.ts                axe summary for any HTML
  score/keyboard.ts           Tab through a page: every link and scroll region reached, focus ring visible, nothing under the sticky bar
  process.ts                  one page through the pipeline, HTML assembly
  look.ts                     a document's title, colours, template and heading class (brief kept in brief.json for rescores)
  cost.ts                     model list prices and the cost of a call
  run.ts                      CLI: run and score against the answer keys
  rescore.ts, scoring.ts      rescoring a copy of a run; shared build-and-score
  aggregate.ts                CLI: summary over several runs
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
- **Pound and dollar amounts are often one word with the sign ("£7500").** `amountOf` splits the sign off; before that every price on the GBP test documents was unreadable (`runs.test.ts`).
- **Table rows are scored by column on the rendered grid.** A text check passed a ■ moved one column over (`score.test.ts`); keys written as full-width rows rely on it.
- **The scorer reads what a reader gets.** Amounts and currencies come from each price's visible text through `score/money.ts`, never from the pipeline's `data-amount` or parser (a parser bug must not grade itself). A price element with two amounts is unreadable. Written amounts count only where a product has no price element.
- **Rescoring never writes into a run.** `--rescore` copies the run first; the originals are the evidence for past decisions.
- **Findings mark the narrowest element.** A product, product list or table is marked only for a grouping doubt; a cell finding marks its row (`rows[r][c]` paths, a bug that left every row unmarked until 2026-10-13).
- **The scorer must score a perfect page at 100 %** (`score.test.ts`). It caught a false "repeated sentence = invented" rule.
- **Key validation never uses the pipeline's extraction or price reading** (only the shared `canon` text form). It read euro/cent pairs through the pipeline's `centPartner`, so a pairing bug could prove its own key. Words come from `words.ts`, occurrences from `ledger.ts`.
- **A page price is scored by its whole printed offer, never by words anywhere in a block.** Block-level conditions let "60p plus £3.00 for each item" pass for "£3.00 plus 60p for each item" (`score/page-prices.test.ts`). The offer is proven by cited words, not searched for: leaflets stream a price and its badge in separate flows. Cited words are checked against page order (`key-v3-offer.test.ts`): read in the order given, they accepted swapped amounts.
- **Every money occurrence of a version-3 page is claimed exactly once.** Counting values let one duplicated £5 cover another £5 left out of the key, and a missing product hid a wrong price on it (`keys.test.ts`). Do not go back to value counts.
- **Conditions are read from the price's own label, not the product text.** With the product text, a card price swapped onto the regular price passed, and "ohne Lidl Plus" satisfied "Lidl Plus" (`rules.test.ts`). Only an output without any price element falls back to the product text, and those prices count as "role unverified".
- **A price's flag is its own.** One flagged price made every error in its product "flagged", including an unflagged image price beside it (`rules.test.ts`).
- **The ledger never ends a price on "£" or "$", and two whole prices never join.** "4.59 £ 5.99" gave "4.59 £" and a currency-less 5.99; "£1 £2" set close vanished (`ledger.test.ts`).
- **Text is never read as prices where price elements exist.** A parent with no price of its own passed on its nested add-on's amount (`rules.test.ts`).
- **The ledger is frozen per key page (`ledgerSha256`).** Rebuilding it with a changed reader could give the same ids other meanings; validation fails and the key is migrated on purpose (`key-v3.test.ts`).
- **An image-only amount is told from a text price by its box, not its value.** By value, an image £1 was rejected because another product printed £1 in the text layer (`key-v3-split.test.ts`).
- **A page price is checked with its currency and offer words in one block.** Checking the amount alone let "Everything £1" vanish while another £1 on the page counted for it (`rules.test.ts`).
- **An unmapped glyph ("£�.99") reads as nothing, never as an amount.** It read as 99p; such occurrences carry their value from the render (`money.test.ts`, `ledger.test.ts`).
- **Hidden text is never published.** A pub menu's "Served 5.00–8.30pm" sat under a shape, Lidl CH printed a price under a "Lieferverzug" sticker, Elddis a running head under its cover: all in the text layer, none visible. `hiddenRuns` judges each word by the ink in its box, after removing other words' boxes; a word too covered to judge is hidden only when it continues a hidden word side by side (an overlapping one is drawn on top, and showed on Lidl GB). Do not judge by text colour: the pub menu's hidden text is white like the rest of the page.
- **Crops keep the product whole.** No cut is chosen by pixel content (paper and marble textures read as product, cuts got refused and the fallback swallowed neighbouring prices). The product's own words are taken in whole; another offer's words and pictures are cut only within a 25 % edge band, never through the product's words. Growth is vertical only and stops at another offer and at full-width photos or bands (horizontal growth crept into a leaflet's sidebar). Word extents use the text colour pdftohtml reports: guessing the ink from the font box took the paper or a green footer band for a red price digit. No crop is marked `data-review` (a flagged image counts its image-read prices as confirmed in the scorer).
- **Sealed keys never print their content** in tests, `pnpm stage0` or `keys:check` without `--details`. The developer of phase-B fixes must not see the test half.

## Dead ends
- **Effort `low` on Sonnet 5.5:** 3 of 6 pages failed outright (broken JSON or schema after the retry), alt text vanished on BILLA p3; not cheaper once retries count. Do not use without new evidence.
- **`pdftohtml` image boxes as final figure boxes:** they are raster bounds, not the visible area (transparent margins, clipped photos, backgrounds). Kept only as hints for the model.
- **Compact citations** (single word ids mixed with ranges in one `src` list): the model confused `[23,25]` with a range, wrote plain strings and broken JSON; 9 of 12 pages needed a retry. Ranges only.
- **Model-as-judge for alt text:** rejected in planning; product alt is checked mechanically, editorial images by hand.
