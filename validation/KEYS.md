# Answer-key freeze log

Answer keys are frozen by SHA-256 before they are used. Any later edit is logged below with its reason and evidence before a run uses the new key; a held-out key edited after its held-out run fails the gate unless the page image proves the key wrong.

## Frozen keys

| File | SHA-256 | Date | What |
|---|---|---|---|
| `heldout.md` | `226c25e878fbb40c0ca8b76293b55b3f4af6bcde8e3d09419344efb9674e8778` | 2026-10-12 | held-out key (BILLA p6, Pollin p5), written before any prompt existed |
| `keys/01_billa.json` | `b29c9a6c307cd43133e87aab927e5e30195d58c31a3677f20555070842969c3d` | 2026-10-12 | tuning and held-out key in JSON, validated against the Poppler text (anchors, amounts, cells) |
| `keys/02_pollin.json` | `67013fbd7e999d13bacce226a7ce368903b6aef1dfddf0f9bff0f4d340e28425` | 2026-10-12 | tuning and held-out key in JSON, validated against the Poppler text (anchors, amounts, cells) |

## Key changes after the freeze

| Date | File | Change | Reason | New SHA-256 | Effect on the baseline score |
|---|---|---|---|---|---|
| 2026-10-12 | `keys/01_billa.json` | p1 Präsident 11,99 and the p8 "BIS …" / "1 STÜCK" / "1 PKG." amounts (8 products) get `roleFree`: the amount stays required, its role (current or previous) is no longer checked | conversion error: the markdown key lists these amounts in its "Old price / discount" column, the JSON had them as current prices; the print does not strike them, so both roles are reasonable, and amount plus qualifier ("BIS 250 G") are still checked | `a863425c3a466e9ad53b29c9e31cfd2b513608b5ffa965df5e4dc57acf887397` | none (the baseline was not scored on roles) |
| 2026-10-12 | `keys/02_pollin.json` | p3: the "9V-Block" accessory (1,39 €) moves from the required amounts of its 3 parent products to `optional` | arbitrary conversion choice: the markdown key lists it under the products, not inside them; a separate item right after the parent is as correct for a reader | `a88c40e7e3c51553023f368e0ef01e4fd61e5370080e06f7cb29f9945636d27c` | none (the baseline did not count it) |
| 2026-10-12 | `keys/01_billa.json` | p3 Bio-Erbsen: alt accepts "Erbsen" or "Zarte Mischung"; p8 Kalbsleber: 29,99 / 36,99 (per-kilo price, "statt") become `optional` | the product name is "Bio-Erbsen od. Zarte Mischung" and the photo shows the Zarte Mischung variant; "per Kilo 29.99 statt 36.99" is a printed previous unit price, so the "previous" role is correct | `70af7a3d2326dd0312da838eae2ced0a01d6674e227633b0c0f2cd8a24406d26` | none |
| 2026-10-12 | `keys/02_pollin.json` | p3 BLDC: alt accepts "Treiber" or "BLDC" | "BLDC-Controller" names the same product ("Treiber für BLDC-Motoren") | `91659627cc9617ac8195ea92a33d8b980057655aeb0d83e198c8a4eacefcd48a` | none |
