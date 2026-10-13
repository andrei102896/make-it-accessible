# Key policy (version-3 keys, draft for Andrei's approval, 2026-10-13)

Rules every key writer follows, decided once so two writers do not settle the same question in two ways. File schema: `packages/eval/src/key-schema-v3.ts`; conventions: `validation/KEYS.md`. Examples are invented or come from dev documents only.

## What the writer gets and does
- **The page.** A render (150 DPI, plus 300 DPI tiles), the frozen word snapshot and the **occurrence ledger** from `pnpm ledger <doc> <pdfPage> --details`. The ledger lists every printed amount the eval reader found in the text layer, each with an id (`o1`, `o2`, …), its words, the value read and a crop. It also prints `pdfSha256` (copied to the document), `wordsSha256` and `ledgerSha256` (copied to the page); the writer never computes them.
- **One claim per occurrence.** The writer assigns every occurrence exactly once in `occurrences`:
  - `price`: belongs to product `product`, with `role` and `conditions`;
  - `cell`: a table cell (`table`, `row`, `col`, zero-based);
  - `text`: a price that belongs to no product ("Everything £1", "£3.00 plus 60p for each item"); it must be published with its amount, currency and the offer words given as its `conditions`, flagged when it prints no currency or is read from the render. Two page prices in one sentence each take their own amount;
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
  - `image`: the price is only in the image (outlined, inside a picture). It cites no words and gives its `box` on the page (PDF points from the top left, as in the snapshot), so it can be outlined. It is rejected when any occurrence's centre lies in that box, whatever amount the reader made of it: then claim that occurrence, or correct it as unreadable or misread. The same amount elsewhere on the page is another price.
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
- **previous:** struck through, or labelled "statt", "was", "UVP", "Letzter Preis", "Adv. prijs" or "RRP"; the label is a condition.
- **unit:** a price per kg, l, 100 g or piece; the unit text is a condition ("1 kg", "per capsule"). Always keyed when printed.
- **previousUnit:** a previous price per unit ("1 kg: 9,99, statt 12,99" → 12,99 is `previousUnit` with conditions "statt" and "1 kg").
- **discount:** a money-off amount ("-2€", "Save £1", "2 € billiger"), with the amount as it reads and the wording as a condition.
- **deposit:** "+0,25 Pfand", with "Pfand" as a condition.
- **unknown:** only when the page leaves the role open, with a `reason` on the claim (product prices and page prices alike). This is an accepted, documented uncertainty, not an open dispute: it does not block the freeze and is reported as "role unverified" next to the headline. A question the writer cannot settle at all goes to `disputes`, which does block the freeze.

**`conditions`** are words printed with the price, checked against the text layer. A condition printed only in the image ("2 for" on a badge) is written `{ "text": "2 for", "seen": true }` and waits for Andrei's `confirmed: true`, like any value read from the render; the price it belongs to must then be published flagged. Conditions of a page price are checked in its block as a whole, not tied to one amount in it. They must appear in that price's own label in the output, not anywhere in the product's text, and not negated ("ohne Lidl Plus"). Only when the output has no price element at all are they looked for in the product's text, and that price counts as "role unverified".
- **Multibuy:** "2 for £5" is the amount £5, role `current`, condition "2 for".
- **Percentages:** "-30%" is not a price. A badge goes in the product's `mustContain` when it is text, or in the page's `mustContain` with `seen` when it is only in the image.

**`currency`** is what the occurrence prints. When the price itself prints none, the claim states the document currency only if the page states it ("Alle Preise in CHF", "Prices in £"). Otherwise it stays `null`, and the output must then flag it.

## Reading order, headings, printed pages
- **Reading order.** One anchor per block (heading, product, paragraph, table).
  - Anchors are unique on the page in canon form (Unicode NFKC, case and spacing ignored).
  - A block whose text repeats ("Add bacon" under two dishes) names which occurrence it means: `{ "anchor": "Add bacon", "kind": "text", "occurrence": 2 }`.
  - On grids, list both row by row and column by column, as two alternative orders, whenever both are reasonable.
- **Heading levels** are relative: the page's main heading is 1.
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
- **Amounts.** A price cell (it prints a currency, or its column header does) claims each of its amounts once as `cell`. A spec value ("7.5 m") is claimed as `cell` or as `notPrice`. An unreadable or image-only cell keeps its text from the render, and the output row holding it must be flagged, as for any price read from the render.
- **Headers** are compared with the published header column by column; a full-width title or section row is not a column header.

## Unsupported pages
`expect: "unsupported"` with no content when the page has no usable text layer: a scan, text outlined to vectors, fonts without a Unicode map, or a page that is one image.
