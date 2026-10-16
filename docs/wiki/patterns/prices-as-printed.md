# Prices as printed

**Seen in:** every US menu (bare "19", no "$" on the page); market price "MP" (Ridgway), "MKT" (Bernini), "M.P." (Gargiulo's); two-size prices "22/32" (Nick & Toni's), "24/29" (Almond), "4/7" (Prohibition); one decimal "18.9" (Carmine's, 40 prices), "3.5" (Noah's); digits split by a letter-spaced text layer "21.9"+"5" (Almond, 19 prices), "18."+"50" (Gargiulo's).

**Rule:** a page that prints no currency anywhere shows its prices as printed; only a leaflet with fused euro/cent pairs needs a currency and keeps bare digits in review. Market and two-size prices and one decimal are valid printed prices. Split digits are joined when they sit within 0.3 of a height apart at the separator (`pdf/runs.ts`, `text/money.ts`, `validate/validate.ts`). A price label sits where it is printed ("Bowl 8" before the amount in 48 of 56 labelled prices; "3.5 ea" after it at Noah's and Frankie's), a separator printed after the pair ("ea," "20,") stands between the prices, outside them, and on a menu the label is a muted word, not a badge (2026-10-16).

**Tests:** `runs.test.ts`, `validate.test.ts`, `document-prices.test.ts`.
