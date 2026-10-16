import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePage } from '../model/schema.ts'
import type { Extraction } from '../pdf/types.ts'
import { renderDocument } from './document.ts'

test('a menu with sections gets section links; a price list a visible contents list', () => {
  const doc = (kind: 'menu' | 'pricelist', headings: string[]) => {
    const notACover = { kind: 'products', items: [{ name: { src: [[0, 0]] }, prices: [] }] }
    const blocks = [...headings.map((_, i) => ({ kind: 'heading', level: 1, text: { src: [[i, i]] } })), notACover]
    const page = parsePage(JSON.stringify({ lang: 'en', blocks }))
    const ex: Extraction = {
      pdfPage: 1,
      width: 600,
      height: 800,
      images: [],
      duplicates: [],
      hidden: [],
      runs: headings.map((str, i) => ({
        id: `1:${String(i)}`,
        str,
        box: { x: 0, y: i * 20, w: 40, h: 10 },
        flow: 0,
        line: i,
      })),
    }
    return renderDocument({
      lang: 'en',
      title: 'T',
      kind,
      pages: [{ keyPage: 1, structure: page, extraction: ex, flagged: [], imageSrc: () => undefined }],
    })
  }
  assert.match(
    doc('menu', ['Starters', 'Mains', 'Sides']),
    /<nav class="chips pinned" id="contents" aria-label="Sections"><ul><li><a href="#s0-0">Starters<\/a>/,
  )
  assert.doesNotMatch(doc('menu', ['Starters', 'Mains']), /class="chips"/)
  assert.match(
    doc('pricelist', ['Fees']),
    /<nav class="toc" id="contents" aria-label="Contents"><p class="toc-title">Contents<\/p>/,
  )
  assert.match(doc('menu', ['Starters', 'Mains', 'Sides']), /<h3 id="s0-0">Starters<\/h3>/)
})
