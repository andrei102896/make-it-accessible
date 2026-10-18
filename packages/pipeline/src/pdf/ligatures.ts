import type { ActualText } from './actualtext.ts'
import type { PdfItem } from './pdfjs.ts'
import type { Run } from './types.ts'

// A drawn glyph Poppler left out is covered by a run only when it overlaps one by more than this share of its size;
// one that ends (or starts) within it of a word is glued to that word: word spaces measure ~0.23 em (Gigi, Noah's).
const GLUED = 0.05
// A glyph's replacement text sits at its origin within this (pt): both are read from the same cm and Tm.
const SAME_ORIGIN = 0.5

export type Restored = { runs: Run[]; hidden: string[]; lost: string[] }
// Poppler's copy of a replacement text, at the page's edge with no height: never a word of the page.
export const isCopy = (r: Run, height: number): boolean => r.box.y >= height - 1 && r.box.h === 0

// The page's words with the letters of each glyph the text layer dropped (a ligature its font does not name: Gigi's
// "Pance" + tt + "a"), read from the PDF's replacement text there; `lost`: words a dropped glyph leaves unwhole.
export function restoreLigatures(
  runs: readonly Run[],
  items: readonly PdfItem[],
  texts: readonly ActualText[],
  view: readonly [number, number, number, number],
): Restored {
  const out = runs.map((r) => ({ ...r, box: { ...r.box } }))
  const height = view[3] - view[1]
  const orphans = out.filter((r) => isCopy(r, height))
  const used = new Set<string>()
  const lost: string[] = []
  if (!orphans.length) return { runs: out, hidden: [], lost }
  for (const { str, transform, width } of items) {
    const [a, b, c, size, ex, ey] = transform
    if (a <= 0 || b !== 0 || c !== 0 || !str.trim()) continue
    const [left, base, tol] = [ex - view[0], view[3] - ey, size * GLUED]
    const right = left + width
    const line = out.filter((r) => base >= r.box.y && base <= r.box.y + r.box.h)
    if (line.some((r) => Math.min(right, r.box.x + r.box.w) - Math.max(left, r.box.x) > tol)) continue
    const before = line.find((r) => Math.abs(r.box.x + r.box.w - left) <= tol && /\p{L}$/u.test(r.str))
    const after = line.find((r) => Math.abs(r.box.x - right) <= tol && /^\p{L}/u.test(r.str))
    // Letters join the word on the right (word-initial "fi" + "lets"), else the left one, grown to the glyph's edge.
    const word = after ?? before
    if (!word) continue
    // The text at the glyph whose copy this page carries (same letters, same Tm), so another page's is never taken.
    const text = texts.find((t) => Math.abs(t.x - ex) <= SAME_ORIGIN && Math.abs(t.y - ey) <= SAME_ORIGIN)
    const orphan = orphans.find(
      (r) => text && r.str === text.text && Math.abs(r.box.x - text.copyX) <= SAME_ORIGIN && !used.has(r.id),
    )
    if (!text || !orphan) {
      lost.push(word.id)
      continue
    }
    used.add(orphan.id)
    word.restored = true
    if (word === after) {
      word.str = text.text + word.str
      word.box.w += word.box.x - left
      word.box.x = left
    } else {
      word.str += text.text
      word.box.w = right - word.box.x
    }
  }
  for (const r of orphans) r.str = ''
  return { runs: out, hidden: orphans.map((r) => r.id), lost }
}
