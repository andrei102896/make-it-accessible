# Sections in columns

**Seen in:** 16 of 19 US menus print sections side by side (Carmine's 3 columns in red frames, Almond and Pastabilities 4, Sarge's 3–4); Gargiulo's mixes full-width rows with two-column groups; Prohibition Post flows one article across 4 columns.

**Rule (2026-10-16, `html/layout.ts`):** a section's column is its heading's position; its items' flow decides its shape. Narrow sections cluster by heading overlap into a grid of ≤ 4 columns (desktop) and stack in print order (phone); a section whose items flow across > 60% of the page is a full-width row (two-column list inside); a flowing row to the right of one narrow column stands beside it (side band). Still to do: a running article across columns (Prohibition Post page 2) as CSS multicol; headings spanning columns.

**Measurement:** `columnsPerPage` in `wiki-facts.ts` (lists only); the renderer's bands come from `bandsOf`.
