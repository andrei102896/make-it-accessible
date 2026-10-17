import type { Block, TextValue } from '../model/schema.ts'
import { noteTargets } from './inline.ts'
import { headedLists } from './source.ts'

export type ListNote = { id: string; items: number[] | null; headed: boolean }

// A note printed right under a menu-style list describes the items it names, or the whole list when it names none.
// A note naming the heading it sits under describes every list since that heading, outside any box. Small print at
// the foot of the page (`tail`) is never a list's note.
export function listNotes(
  blocks: readonly Block[],
  tail: ReadonlySet<number>,
  pdfPage: number,
  raw: (t: TextValue) => string,
): { notes: Map<string, ListNote>; describedBy: Map<string, string> } {
  const notes = new Map<string, ListNote>()
  const describedBy = new Map<string, string>()
  blocks.forEach((b, i) => {
    const next = blocks[i + 1]
    if (b.kind !== 'products' || b.items.some((it) => it.image) || next?.kind !== 'paragraph' || tail.has(i + 1)) return
    const id = `note-${String(pdfPage)}-${String(i + 1)}`
    const lists = headedLists(blocks, i + 1, raw)
    lists?.forEach((l) => describedBy.set(`blocks[${String(l)}]`, id))
    const items = lists
      ? null
      : noteTargets(
          raw(next.text),
          b.items.map((it) => raw(it.name)),
        )
    notes.set(`blocks[${String(i)}]`, { id, items, headed: lists !== null })
  })
  return { notes, describedBy }
}
