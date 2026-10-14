import type { DocumentType } from '../model/brief.ts'

export type TocEntry = { id: string; label: string }
type Labels = { contents: string; sections: string }

// Menus and leaflets: a sticky row of section links once there are enough sections to need it; price lists and
// short contents: a visible list; a longer one on a document of three pages or more: behind a summary.
const MIN_CHIPS = 3
const SHORT_CONTENTS = 6

export function navigation(kind: DocumentType | null, toc: readonly TocEntry[], long: boolean, ui: Labels): string {
  const links = toc.map((t) => `<li><a href="#${t.id}">${t.label}</a></li>`).join('')
  if ((kind === 'menu' || kind === 'retail') && toc.length >= MIN_CHIPS)
    return `<nav class="chips" id="contents" aria-label="${ui.sections}"><ul>${links}</ul></nav>`
  if ((kind === 'pricelist' || (long && toc.length <= SHORT_CONTENTS)) && toc.length)
    return `<nav class="toc" id="contents" aria-label="${ui.contents}"><p class="toc-title">${ui.contents}</p><ol>${links}</ol></nav>`
  if (long && toc.length)
    return `<nav class="toc" id="contents" aria-label="${ui.contents}"><details><summary>${ui.contents}</summary><ol>${links}</ol></details></nav>`
  return ''
}
