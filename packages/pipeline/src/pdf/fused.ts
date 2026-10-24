import type { PdfItem } from './pdfjs.ts'
import { findDuplicates, isLeader } from './runs.ts'
import type { Extraction, Run } from './types.ts'

// A gap inside one word past this (em of the larger item) is a column: word spaces measure 0.23–0.3 em; the fusions
// measured (Eusebi's "11" | "31", The Baring's "spritz" | "13") 1.05–30.8 em, nothing printed as one word above 0.5.
const COLUMN_GAP = 0.75
const LEVEL = 1e-6
// Items on one baseline within this (pt) of each other.
const SAME_BASELINE = 0.5
// Overlap (pt) that makes an item the word's: past rounding of the previous word's advance.
const OVERLAP = 0.5
const LETTER = /[\p{L}\p{N}]/u
// A word's reading units and where each starts: a character, or a whole leader (the readers count its dots apart:
// Bernie's "Wings . . . 6" holds 64 for Poppler, 66 for pdf.js).
const UNIT = /(?:[.…·_]\s*){3,}|\S/gu
function units(s: string): { text: string; at: number[] } {
  const found = [...s.matchAll(UNIT)]
  return { text: found.map((m) => (m[0].length > 1 ? '\u22ef' : m[0])).join(''), at: found.map((m) => m.index) }
}
const bare = (t: string): string => units(t).text

export type Split = { runs: Run[]; pieces: Map<string, string[]> }

// Words pdftotext fused across a column gap or a leader, split where pdf.js' items part them ("1131" → "11" + "31",
// "Clams . . . 7" → "Clams" + leader + "7"); a word whose letters its items do not give exactly stays whole.
export function splitFused(
  runs: readonly Run[],
  items: readonly PdfItem[],
  view: readonly [number, number, number, number],
  pdfPage: number,
): Split {
  const level = items.filter(
    ({ str, width, transform: [a, b, c, d] }) =>
      str.trim() && width > 0 && a > 0 && d > 0 && Math.abs(b) < LEVEL && Math.abs(c) < LEVEL,
  )
  const split = runs.map((r) => piecesOf(r, level, view))
  if (split.every((p) => p.length === 1)) return { runs: [...runs], pieces: new Map() }
  // Renumbered in order, not appended: reconcile and align read the next run as the next word printed.
  const out: Run[] = []
  const pieces = new Map<string, string[]>()
  runs.forEach((old, k) => {
    const ids = (split[k] ?? [old]).map((p) => {
      const id = `${String(pdfPage)}:${String(out.length)}`
      out.push({ ...p, id })
      return id
    })
    pieces.set(old.id, ids)
  })
  return { runs: out, pieces }
}

// The page with its fused words split: a hidden or lost word's pieces are hidden or lost (lost over-holds: the
// safe side); duplicates are found again among the pieces.
export function withSplit(e: Extraction, split: Split): Extraction {
  if (!split.pieces.size) return e
  const remap = (ids: readonly string[]): string[] => ids.flatMap((id) => split.pieces.get(id) ?? [id])
  const lost = e.lost && remap(e.lost)
  return {
    ...e,
    runs: split.runs,
    hidden: remap(e.hidden),
    duplicates: findDuplicates(split.runs),
    ...(lost && { lost }),
  }
}

function piecesOf(r: Run, level: readonly PdfItem[], view: readonly [number, number, number, number]): Run[] {
  if (!r.str.trim()) return [r]
  const foot = r.box.y + r.box.h
  const right = r.box.x + r.box.w
  const base = (i: PdfItem): number => view[3] - i.transform[5]
  const left = (i: PdfItem): number => i.transform[4] - view[0]
  // A real overlap: a neighbour's item touching the word by its width's rounding is not its own.
  const over = level.filter(
    (i) =>
      base(i) >= r.box.y &&
      base(i) <= foot &&
      Math.min(right, left(i) + i.width) - Math.max(r.box.x, left(i)) > OVERLAP,
  )
  const nearest = Math.min(...over.map((i) => Math.abs(foot - base(i))))
  const line = over
    .filter((i) => Math.abs(Math.abs(foot - base(i)) - nearest) <= SAME_BASELINE)
    .sort((p, q) => left(p) - left(q))
  if (line.length < 2) return [r]
  // Exact letters: the first item's tail (it may start before the word), then every other item whole.
  const { text: word, at } = units(r.str)
  const sizes = line.map((i, k) => (k ? bare(i.str).length : 0))
  const tail = line
    .slice(1)
    .map((i) => bare(i.str))
    .join('')
  const head = word.slice(0, word.length - tail.length)
  if (!head || !word.endsWith(tail) || !bare(line[0]?.str ?? '').endsWith(head)) return [r]
  sizes[0] = head.length
  const starts = [0]
  for (let k = 1; k < line.length; k++) {
    const [a, b] = [line[k - 1], line[k]]
    if (!a || !b) continue
    const gap = (left(b) - left(a) - a.width) / Math.max(a.transform[3], b.transform[3])
    const [la, lb] = [isLeader(a.str), isLeader(b.str)]
    if (gap >= COLUMN_GAP || (la !== lb && LETTER.test(la ? b.str : a.str))) starts.push(k)
  }
  if (starts.length === 1) return [r]
  // Each piece: its characters of the word, from the run's left edge or its first item's, to the next piece at most.
  const ends = [...starts.slice(1), line.length]
  const lettersBefore = (k: number): number => sizes.slice(0, k).reduce((n, s) => n + s, 0)
  const xs = starts.map((s, j) => {
    const first = line[s]
    return j && first ? Math.max(r.box.x, left(first)) : r.box.x
  })
  return starts.map((s, j): Run => {
    const last = line[(ends[j] ?? line.length) - 1]
    const next = xs[j + 1]
    const end = next === undefined || !last ? right : Math.min(next, left(last) + last.width)
    const cut = (n: number): number => at[n] ?? r.str.length
    const str = r.str.slice(cut(lettersBefore(s)), cut(lettersBefore(ends[j] ?? line.length)))
    const x = xs[j] ?? r.box.x
    return { ...r, str: str.trim(), box: { ...r.box, x, w: Math.max(0, end - x) } }
  })
}
