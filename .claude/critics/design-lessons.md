# Design lessons (curated; newest last; merge duplicates)

- Owners judge the page by its resemblance to their PDF first: their colours, fonts and hierarchy; a generic template reads as "rough". (Kendells, first real reply, 2026-10-15)
- Brand colours drawn in small areas (red section titles, icons) are lost by area-based sampling; take colours from the text roles. (Kendells accent came out black)
- A page that follows the OS dark mode looks nothing like a white PDF on the owner's Mac. (Kendells, 2026-10-15)
- Every menu shape must render: unpriced dishes, set menus, prices inside notes. (Kendells tea-time menu)
- Screen readers: a price and its condition must be one phrase; a legend one phrase; code letters read as their words. (VoiceOver pass 2026-10-15)
- Content only from the PDF: never reword or reorder; no CSS-generated text. Whole-amount display per list is accepted; a currency sign is shown only when the page prints one.
- Review every page at 1280, 390 and 320 px, light and dark, with axe and the keyboard, side by side with the PDF render.
- Notes describe only the items they name; pictures repeated in the same place are decorative; crops keep the product and its own words whole. (external review rounds 1–4)
- Brand fidelity first: a business's page is its brand. Fonts, colours, hierarchy and structure come from the PDF as truthfully as possible; accessibility only corrects (contrast, minimum size, reflow), it never replaces the identity. (Andrei, 2026-10-15)
- Resemblance comes from structure as much as from fonts: tracked centred headings with their rules, the colour level above them, sections side by side as printed, the PDF's density. (critic-design on the Kendells plan, 2026-10-15)
- Style headings by their printed signature (family, size, colour), not by the level the model gave them: Kendells' red stencil section titles and black condensed headings share one level. (2026-10-15)
- Text sizes shrink with clamp() on phones, so the 3:1 large-text exception is unsafe: require 4.5:1 for every text role. (2026-10-15)
- Measured heading sizes need a phone clamp: a fixed 2.55rem tracked headline split "ÖSTERREICH" mid-word at 320px; headings use clamp() and no letter-spacing unless the face is condensed. (BILLA, 2026-10-15)
- A brand face's x-height decides its real size: running text in Josefin or Cormorant needs font-size-adjust; names and prices in a tall-eyed face must not get it. (Kendells, Stone House, 2026-10-15)
- A note that names its own heading ("TEA TIME SET MENU: …") prices every list under that heading, without a box. (Kendells, 2026-10-15)
- A brand colour that passes only after a large lightness move stops being the brand: use the document's other brand colour when it reads (BILLA yellow → its green, not mustard). (2026-10-15)
