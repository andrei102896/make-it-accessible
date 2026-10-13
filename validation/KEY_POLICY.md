# Key policy (version-3 keys, approved by Andrei 2026-10-13)

Rules every key writer follows, decided once so two writers do not settle the same question in two ways. File schema: `packages/eval/src/key-schema-v3.ts`; conventions: `validation/KEYS.md`. Examples are invented or come from dev documents only.

## What the writer gets and does
- **The page.** A render of the whole page and 300 DPI tiles with rulers in PDF points, the frozen word snapshot and the **occurrence ledger** from `pnpm ledger <doc> <pdfPage> --details`. The ledger lists every printed amount the eval reader found in the text layer, each with an id (`o1`, `o2`, …), its words and the value read; `--details` also lists every snapshot word with its index, line and box, which manual amounts and offers cite. The staging folder adds a crop per occurrence. It also prints `pdfSha256` (copied to the document), `wordsSha256` and `ledgerSha256` (copied to the page); the writer never computes them.
- **One claim per occurrence.** The writer assigns every occurrence exactly once in `occurrences`:
  - `price`: belongs to product `product`, with `role` and `conditions`;
  - `cell`: a table cell (`table`, `row`, `col`, zero-based);
  - `text`: a price that belongs to no product ("Everything £1", "£3.00 plus 60p for each item"), with its `offer` (see "Page prices" below);
  - `notPrice` with a `reason`: a date, a weight or dimension, an article or phone number.
- **The rest of the page.** The writer also keys:
  - `readingOrder`, with alternatives;
  - `headings`, with relative levels;
  - `products`;
  - `tables`;
  - image text with a digit (`mustContain` with `seen`);
  - slug text outside the trim (`outsideTrim`);
  - text hidden under a shape (`mustNotAppear`);
  - the printed pages (`sections`).
- **Check before handing back.** The writer runs `pnpm keys:check <file> --pdf <file.pdf> --details` until it is clean. A key is never changed only to silence the validator: what the writer cannot settle goes to `disputes`.

## Values the ledger cannot give
Every destination (a product price, a table cell, a page price) takes the same correction fields, so where an amount goes never decides how it is proven.
- **Unreadable occurrence** (an unmapped glyph, "£�.99"): the claim carries `value` (`printed`, `cents`, `currency`) read from the render. It is scored as a price the output must flag, and Andrei checks it on the crop sheet.
- **Misread occurrence** (the reader got a readable occurrence wrong): the claim carries `value` and `misread: "open"`. It blocks the freeze until Andrei confirms the value (`"confirmed"`).
- **Manual amounts** (`manual`, ids `m1`, `m2`, …) are claimed in `occurrences` like ledger occurrences. Each one blocks the freeze until Andrei sets `confirmed: true`. There are three kinds:
  - `missed`: the text layer has the price, but the reader made no occurrence of it. Its `words` cite the snapshot words, which no occurrence may hold.
  - `split`: the reader joined several prices into one occurrence. That occurrence is claimed `{ "kind": "split", "into": ["m1", "m2"] }`. The parts are distinct `split` entries, each named by this one split, and together they cite each word of the occurrence exactly once.
  - `image`: the price is only in the image (outlined, inside a picture). It cites no words and gives its `box` on the page (PDF points from the top left, as in the snapshot), so it can be outlined. It is rejected when any occurrence's centre lies in that box, whatever amount the reader made of it: then claim that occurrence, or correct it as unreadable or misread. The same amount elsewhere on the page is another price. One print is one entry: two image entries of the same amount whose boxes overlap are rejected; different amounts may overlap ("£3" stamped over a struck "£5").
  - No word is cited by two manual amounts.
- **Merged occurrence** (the reader cut one price in two): one part is claimed with the whole price as a confirmed misread `value`, and the other is claimed `{ "kind": "merged", "into": "<the first part's id>" }`. The parts, joined in word order, must read as that value.
- **Every value reads as itself:** `printed` must read as `cents` and, when it prints one, as `currency` ("£1" is never 200).
- **Visual reconciliation.** Covering every ledger entry does not prove every price is covered. The arbiter and Andrei look at the page render with every occurrence and manual amount outlined, and any printed price without an outline becomes a `missed` or `image` entry before the freeze.
- **Frozen ledger.** Each page records `wordsSha256` and `ledgerSha256`, and the key records the PDF's `pdfSha256`. If the reader later segments the page differently, validation fails and the key is migrated explicitly; ids are never reinterpreted silently.

## Products
- **One product is one offer:** a name with its own price. Variants sold at one price ("Paprika rot od. gelb"), or a pack and its contents, are one product.
- **`id`:** the writer's own, unique on the page ("p1", "p2", …).
- **`anchor`:** the shortest visible string that occurs exactly once on the page, such as the name, or the name with its weight.
  - Text present in the text layer but hidden under a shape is never an anchor.
  - If a visible price has no visible unique name, use a unique visible string next to it.
  - If none exists, write a dispute.
- **`parent`:** an add-on or accessory with its own price ("+60p add cheese", a grill cover) is its own product with `parent` set to the main product's id. It passes whether the output publishes it inside the parent or on its own, and its anchor may repeat on the page ("Add bacon" under two dishes).
- **`alt`:** the words a description of the product photo must contain, synonyms separated by `|` ("Erbsen|Zarte Mischung"); `null` when the product has no photo.

## Roles and conditions
**`role`** is decided by what the page prints, never by guessing:
- **current:** the price paid now.
- **Loyalty card prices:** both prices are `current`. The card price has the card text as its condition ("Lidl Plus"). The other price is `current` with no condition, or with what the page prints for it ("Regular price").
- **previous:** struck through, or labelled "statt", "was" or "Letzter Preis"; the label is a condition. A recommended price ("RRP", "UVP", "Adv. prijs") is `previous` only when a lower current price is printed with it; printed alone it is the asking price: `current`, with its label as the condition (Andrei, 2026-10-13).
- **unit:** a price per kg, l, 100 g or piece; the unit text is a condition ("1 kg", "per capsule"). Always keyed when printed.
- **previousUnit:** a previous price per unit ("1 kg: 9,99, statt 12,99" → 12,99 is `previousUnit` with conditions "statt" and "1 kg").
- **discount:** a money-off amount ("-2€", "Save £1", "2 € billiger"), with the amount as it reads and the wording as a condition.
- **deposit:** "+0,25 Pfand", with "Pfand" as a condition.
- **unknown:** only when the page leaves the role open, with a `reason` on the claim (product prices and page prices alike). This is an accepted, documented uncertainty, not an open dispute: it does not block the freeze and is reported as "role unverified" next to the headline. A question the writer cannot settle at all goes to `disputes`, which does block the freeze.

**`conditions`** (product prices) are words printed with the price, checked against the text layer. A condition printed only in the image ("2 for" on a badge) is written `{ "text": "2 for", "seen": true }` and waits for Andrei's `confirmed: true`, like any value read from the render; the price it belongs to must then be published flagged. It is rejected only when a text line within three heights of the amount's box prints it; the same words elsewhere on the page belong to another offer. Conditions must appear in that price's own label in the output, not anywhere in the product's text, and not negated ("ohne Lidl Plus"). Only when the output has no price element at all are they looked for in the product's text, and that price counts as "role unverified".

**Page prices** (`text` claims) carry an `offer`: the printed words that state the price, its amount included, and `offerWords`, the snapshot words it is read from, in reading order.
- The prices of one sentence share one offer ("£3.00 plus 60p for each item" for both). The offer's own amount must be among its cited words.
- **The cited words follow the page.** Inside one text block (`flow.block` of the word's `line`) they are one unbroken run, in order: no word is skipped and no line in the middle is left out. Text blocks are cited in stream order. Every amount on a line the offer cites (any occurrence or manual amount, however it is claimed) is cited whole.
- **Notes.** An offer that leaves out words at the start of its first line or the end of its last line (a sentence that starts mid-line), or that cites text blocks out of stream order, carries `offerNote: { "text": "<why>" }`, and it blocks the freeze until Andrei sets `confirmed: true`. A gap inside a block is never allowed, note or not. Two columns that the text layer merges into one line cannot be cited apart: write a dispute.
- The cited words, with every claimed amount among them standing as its claimed value (an unreadable or misread neighbour included), must read as the offer: amounts by value and currency, other words letter for letter. An unmapped glyph stands for one to three letters ("O�er" is "Offer"), and a word hyphenated at a line end is joined to the next line's word.
- An offer read from the render (an image amount, or words only in the image) is `{ "text": "2 for £5", "seen": true }`, cites no words, waits for Andrei's `confirmed: true`, and puts the price under review. It is rejected when a text line within three heights of the amount prints it.
- **Scoring.** The output must print the offer word for word in one block (a paragraph, a list item, or a product's own text when the page price is published as a product), not negated, with these normalisations only: Unicode NFKC, case, spacing and punctuation between words, soft hyphens, curly apostrophes, letter-spaced words ("S A L E"); an amount compares by value ("£3" is "£3.00", "60p" is "£0.60") and by currency when the offer prints one, its sign included. Each price takes its own amount inside the matched offer. A page price with no printed currency or read from the render must be flagged.
- **Multibuy:** "2 for £5" is the amount £5, role `current`, condition "2 for".
- **Percentages:** "-30%" is not a price. A badge goes in the product's `mustContain` when it is text, or in the page's `mustContain` with `seen` when it is only in the image.

**`currency`** is what the occurrence prints. When the price itself prints none, the claim states the document currency only if the page states it ("Alle Preise in CHF", "Prices in £"). Otherwise it stays `null`, and the output must then flag it.

## Reading order, headings, printed pages
- **Reading order.** One anchor per block (heading, product, paragraph, table).
  - Anchors are unique on the page in canon form (Unicode NFKC, case and spacing ignored).
  - A block whose text repeats ("Add bacon" under two dishes) names which occurrence it means, counted in reading order: `{ "anchor": "Add bacon", "kind": "text", "occurrence": 2 }`.
  - On grids, list both row by row and column by column, as two alternative orders, whenever both are reasonable.
- **Heading levels** are relative: the page's main heading is 1. A heading whose text repeats on the page ("Optional Extras" on each half of a price list) names its occurrence the same way, counted in reading order: `{ "anchor": "Optional Extras", "level": 2, "occurrence": 2 }`.
- **`sections`:**
  - one entry per printed page, in reading order;
  - every key page appears, including unsupported ones;
  - `label` is the printed folio as printed ("14"), "Front cover" / "Back cover" on a cover spread, or `null` when nothing is printed;
  - each printed page lists anchors that occur once on its PDF page, and at least one product anchor if it carries products;
  - other sensible orders of folded panels go into `sectionOrders`.

## Tables
- **Shape.** Rows are as wide as the header, in printed column order. Sub-columns under one spanning header are separate columns, and their header cell repeats the spanning text with the sub-column ("Model A mm").
- **Cells:**
  - `""`: the cell is printed empty and must stay empty;
  - `{ "unchecked": "<reason>" }`: not scored (a picture-only cell); counted and reported;
  - `{ "same": "above" | "left" }`: a merged cell, printed once.
- **Amounts.** A price cell (it prints a currency, or its column header does) claims each of its amounts once as `cell`. A spec value ("7.5 m", "2.2l") is claimed as `notPrice` (Andrei, 2026-10-13). A price-list row is a table row, not a product: its amounts are claimed `cell` and no product is keyed for it (Andrei, 2026-10-13). An unreadable or image-only cell keeps its text from the render, and the output row holding it must be flagged, as for any price read from the render.
- **Words in a price cell** ("FOC", "POA", "Included", "T.B.D.") are the cell's text as printed; there is no amount to claim.
- **Headers** are compared with the published header column by column; a full-width title or section row is not a column header.

## Unsupported pages
`expect: "unsupported"` with no content when the page has no usable text layer: a scan, text outlined to vectors, fonts without a Unicode map, or a page that is one image. A page with a text layer but no prices (a photo page with folios, a text page) is keyed as usual, with no price claims.
