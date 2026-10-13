// Test fixture: one strict key page and a minimal accessible page around a body, scored in the browser.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KeyDocSchema } from '../key-schema.ts'
import type { KeyDoc } from '../keys.ts'
import { scoreDocument } from './score.ts'
import type { PageScore } from './types.ts'

export const price = (role: string, text: string, qualifier = '', flag = ''): string =>
  `<span class="price" data-role="${role}"${flag}>${qualifier ? `<span class="qualifier">${qualifier}</span> ` : ''}${text}</span>`
export const product = (name: string, ...prices: string[]): string =>
  `<li><p class="name">${name}</p><p>${prices.join(' ')}</p></li>`

export async function score(page: Record<string, unknown>, body: string): Promise<PageScore> {
  const key: KeyDoc = {
    ...KeyDocSchema.parse({
      doc: 'rules',
      pdf: 'none.pdf',
      lang: 'de',
      currency: 'EUR',
      pages: [
        {
          pdfPage: 1,
          keyPage: 1,
          type: 'grid',
          strict: true,
          readingOrder: [[{ anchor: 'Top', kind: 'text' }]],
          ...page,
        },
      ],
    }),
    pdfPath: '',
  }
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>T</title></head><body><main><h1>T</h1><section aria-labelledby="a" data-page="1"><h2 id="a">Seite 1</h2><p>Top</p>${body}</section></main></body></html>`
  const path = join(await mkdtemp(join(tmpdir(), 'mia-rules-')), 'index.html')
  await writeFile(path, html)
  const [result] = (await scoreDocument(path, key, [1])).pages
  if (!result) throw new Error('no page score')
  return result
}
export const eur = (cents: number, role: string, conditions: string[] = []): Record<string, unknown> => ({
  printed: (cents / 100).toFixed(2).replace('.', ','),
  cents,
  role,
  currency: 'EUR',
  conditions,
})
// A price that belongs to no product, with the words that state it.
export const offer = (cents: number, words: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  printed: (cents / 100).toFixed(2).replace('.', ','),
  cents,
  role: 'current',
  currency: 'EUR',
  offer: words,
  ...extra,
})
export const list = (...items: string[]): string => `<ul class="products" role="list">${items.join('')}</ul>`
export const plus = {
  products: [{ anchor: 'Kaffee', alt: null, prices: [eur(199, 'current', ['Lidl Plus']), eur(249, 'unknown')] }],
}
