import type { DocumentType } from '../model/brief.ts'
import type { Block } from '../model/schema.ts'

// `label` is the heading's markup, `name` its plain words (compared with the document's title).
export type TocEntry = { id: string; label: string; name: string }
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

const same = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
// The title's words of three or more characters, compared letters and digits only.
export const titleWordsOf = (title: string): string[] =>
  title
    .split(/[\s·]+/)
    .map(same)
    .filter((w) => w.length >= 3)
// A sentence is no section name ("If we are out of something, don't worry, it's half price.").
const SENTENCE_WORDS = 6

// The headings a page lists (block indices): its highest level, a page title left out (a sentence, or a heading above
// all others that names the document with no list of its own) so its sections are listed instead. A menu cover none.
export function listedHeadings(
  blocks: readonly Block[],
  name: (b: Block & { kind: 'heading' }) => string,
  titleWords: readonly string[],
  menu: boolean,
): Set<number> {
  const listing = (b: Block): boolean => b.kind === 'products' || b.kind === 'list' || b.kind === 'table'
  if (menu && !blocks.some(listing)) return new Set()
  const headings = blocks.flatMap((b, i) => (b.kind === 'heading' ? [{ b, i, words: name(b) }] : []))
  const above = (level: number): boolean => headings.filter((h) => h.b.level <= level).length === 1
  const titleLike = ({ b, i, words }: (typeof headings)[number]): boolean => {
    const sentence = words.split(/\s+/).length >= SENTENCE_WORDS && /[.!?]$/.test(words.trim())
    const next = blocks.slice(i + 1).find((x) => x.kind !== 'paragraph' && x.kind !== 'figure')
    const named =
      titleWords.length > 0 && titleWords.filter((w) => same(words).includes(w)).length * 2 >= titleWords.length
    // Sarge's "SARGE'S NOSHES, FRANKS, & APPETIZERS" names the place too, beside its sibling sections: a section.
    return sentence || (named && above(b.level) && !(next && listing(next)))
  }
  const sections = headings.filter((h) => !titleLike(h))
  const top = Math.min(...sections.map((h) => h.b.level))
  return new Set(sections.filter((h) => h.b.level === top).map((h) => h.i))
}
