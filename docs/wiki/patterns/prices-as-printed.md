# Prices as printed

**Seen in:** every US menu (bare "19", no "$" on the page); market price "MP" (Ridgway), "MKT" (Bernini), "M.P." (Gargiulo's); two-size prices "22/32" (Nick & Toni's), "24/29" (Almond), "4/7" (Prohibition); one decimal "18.9" (Carmine's, 40 prices), "3.5" (Noah's); digits split by a letter-spaced text layer "21.9"+"5" (Almond, 19 prices), "18."+"50" (Gargiulo's).

**Rule:** a page that prints no currency anywhere shows its prices as printed; only a leaflet with fused euro/cent pairs needs a currency and keeps bare digits in review. Market and two-size prices and one decimal are valid printed prices. Split digits are joined when they sit within 0.3 of a height apart at the separator (`pdf/runs.ts`, `text/money.ts`, `validate/validate.ts`).

**Tests:** `runs.test.ts`, `validate.test.ts`, `document-prices.test.ts`.
