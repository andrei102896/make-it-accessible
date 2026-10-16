import type { DocumentType } from '../model/brief.ts'

export type TocEntry = { id: string; label: string }
type Labels = { contents: string; sections: string }

// Menus and leaflets: a row of section chips once there are enough sections to need it, wrapped, never scrolled
// (a scrollbar in a menu is out). Pinned to the top of a wide screen only while the labels fit one or two rows;
// many sections fold behind "Sections (n)" on a phone. Price lists and short contents: a visible list; a longer
// one on a document of three pages or more: behind a summary.
const MIN_CHIPS = 3
const PINNED_CHARS = 90
const FOLD_CHIPS = 8
const SHORT_CONTENTS = 6

export function navigation(kind: DocumentType | null, toc: readonly TocEntry[], long: boolean, ui: Labels): string {
  const links = toc.map((t) => `<li><a href="#${t.id}">${t.label}</a></li>`).join('')
  if ((kind === 'menu' || kind === 'retail') && toc.length >= MIN_CHIPS) {
    const pinned = toc.reduce((n, t) => n + t.label.length, 0) <= PINNED_CHARS ? ' pinned' : ''
    // The phone fold is a second copy shown only below 40rem (CSS cannot open a <details> by viewport width).
    const fold =
      toc.length > FOLD_CHIPS
        ? `<details class="chips-fold" aria-label="${ui.sections}"><summary>${ui.sections} (${String(toc.length)})</summary><ul>${links}</ul></details>`
        : ''
    return `<nav class="chips${pinned}" id="contents" aria-label="${ui.sections}">${fold}<ul>${links}</ul></nav>`
  }
  if ((kind === 'pricelist' || (long && toc.length <= SHORT_CONTENTS)) && toc.length)
    return `<nav class="toc" id="contents" aria-label="${ui.contents}"><p class="toc-title">${ui.contents}</p><ol>${links}</ol></nav>`
  if (long && toc.length)
    return `<nav class="toc" id="contents" aria-label="${ui.contents}"><details><summary>${ui.contents}</summary><ol>${links}</ol></details></nav>`
  return ''
}
