# Small-caps text layer

**Seen in:** Carmine's (BodoniBT-Bold-SC700: "MEatball app", "italian sausagE gino"), Rucola ("White NAgroni").

**What the PDF does:** a small-caps font maps lower-case letters to small-capital glyphs; pdftohtml reports the glyph case, not the printed one, and strips the "SC700" part of the family name.

**Rule:** the model's text stands in for the cited words when the printed case is not one a designer could set (`caseReliable`, `html/source.ts`); a role whose runs fail that check is a small-caps face and gets `font-variant-caps: small-caps` (planned, `docs/LAYOUT.md`).

**Tests:** `document-prices.test.ts` ("MEatball app" shows the model's text).
