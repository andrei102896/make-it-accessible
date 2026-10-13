// Test fixture: one synthetic version-3 page with the words and occurrences a test gives it.
import { KeyDocV3Schema } from './key-schema-v3.ts'
import type { Occurrence } from './ledger.ts'
import type { Word } from './words.ts'

const SHA = 'a'.repeat(64)
export const word = (str: string, x: number, line = 'l', y = 0): Word => ({ str, x, y, w: 10, h: 10, line })
export const occurrence = (
  id: string,
  words: number[],
  text: string,
  cents: number | null,
  extra: Partial<Occurrence> = {},
): Occurrence => ({
  id,
  words,
  text,
  cents,
  currency: null,
  unreadable: cents === null,
  box: { x: 0, y: 0, w: 1, h: 1 },
  ...extra,
})
export function page(extra: Record<string, unknown>) {
  const [p] = KeyDocV3Schema.parse({
    version: 3,
    doc: 'd',
    pdf: 'd.pdf',
    pdfSha256: SHA,
    lang: 'de',
    currency: 'EUR',
    pages: [
      {
        pdfPage: 1,
        keyPage: 1,
        type: 'grid',
        wordsSha256: SHA,
        ledgerSha256: SHA,
        readingOrder: [[{ anchor: 'Tee', kind: 'text' }]],
        products: [
          { id: 'p1', anchor: 'Tee', alt: null },
          { id: 'p2', anchor: 'Milch', alt: null },
        ],
        ...extra,
      },
    ],
  }).pages
  if (!p) throw new Error('no page')
  return p
}
export const TEXT = 'teemilch'
