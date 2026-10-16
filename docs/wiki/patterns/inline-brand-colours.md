# Inline brand colours

**Seen in:** Almond (red farm and owner names inside black dish names and descriptions, #c00000, ~220 characters), Sarge's (red inside headings and notes), Ferrara (dark red notes, blue links), Mezzaluna (blue), Bernini (two blues in headings), Carmine's (crimson "100% Blue Crab Meat" and Mini/Jumbo prices). 7 of 24 documents. Carmine's also sets names, prices and notes in a dark teal (#05262d) that prints black.

**Rule (2026-10-16, `html/profile.ts` inks, `html/source.ts` inkSegments, `html/brand.ts`):** a colour inside a role's words is a brand ink when it lies at least 0.15 (OKLab) from the role's own colour and one of the two has chroma ≥ 0.06, over at least 3 characters. The runs in it are wrapped (`.ink-<hex>`) and coloured with the printed colour made readable on the page (lightness only, never swapped for another colour; dropped when it lands on the text colour). Colours map onto the shown text letter by letter, so the model's text for a small-caps layer keeps them; a repaired word takes a colour only when every run agrees. A dark colour with chroma under 0.06 is ink: on a light page the role takes the text colour, not a tint.

**Tests:** `ink.test.ts`, `profile.test.ts`.
