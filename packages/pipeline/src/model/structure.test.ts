import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Extraction } from '../pdf/types.ts'
import type { ModelCall } from './client.ts'
import { parsePage, type PageStructure } from './schema.ts'
import { better, structurePage, type Review } from './structure.ts'

const e: Extraction = {
  pdfPage: 1,
  width: 600,
  height: 800,
  runs: [{ id: '1:0', str: 'Soup', box: { x: 0, y: 0, w: 20, h: 10 }, flow: 0, line: 0 }],
  images: [],
  duplicates: [],
  hidden: [],
}
const answer = (heading: string): string =>
  JSON.stringify({
    lang: 'en',
    blocks: [{ kind: 'heading', level: 2, text: { src: [[0, 0]], text: heading } }],
    dropped: [],
  })
const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
// A model answering each call in turn; the prompts it was given are kept.
const model = (...raws: string[]) => {
  const prompts: string[] = []
  const call = (_image: string | readonly string[], text: string): Promise<ModelCall> => {
    prompts.push(text)
    return Promise.resolve({ raw: raws[prompts.length - 1] ?? '', usage, ms: 0 })
  }
  return { call, prompts }
}
// Each heading's weight: its errors, then the dishes it shows (negative: more is better).
const weights: Record<string, number[]> = { Soup: [0, -1], Soop: [1, -1], Sop: [2, -1], Gone: [0, 0] }
const review = (page: PageStructure): Review => {
  const b = page.blocks[0]
  const t = b?.kind === 'heading' && 'text' in b.text ? (b.text.text ?? '') : ''
  const weight = weights[t] ?? [9]
  return { reason: weight.some((n) => n > 0) ? `"${t}" does not match` : null, weight }
}
const run = (m: ReturnType<typeof model>) =>
  structurePage(e, { width: 600, height: 800 }, 'p.jpg', { model: 'm', effort: 'low' }, review, m.call)

test('a clean answer is not asked again; one with findings is, with its own answer and the findings', async () => {
  const clean = model(answer('Soup'))
  assert.equal((await run(clean)).calls.length, 1)
  const fixed = model(answer('Soop'), answer('Soup'))
  const r = await run(fixed)
  assert.equal(r.kept, 'retry')
  assert.match(fixed.prompts[1] ?? '', /Your previous answer:\n\{"lang":"en".*"Soop"/)
  assert.match(fixed.prompts[1] ?? '', /Checked against the print: "Soop" does not match/)
})

test('a retry no better, or one losing content, or not parsing keeps the first answer', async () => {
  for (const second of [answer('Sop'), answer('Gone'), 'not json']) {
    const r = await run(model(answer('Soop'), second))
    assert.equal(r.kept, 'first')
    assert.equal(r.calls.length, 2)
  }
  assert.equal(better([0, 0], [1, -1]), false)
  assert.equal(better([0, -1], [1, -1]), true)
})

test('an answer that corrects itself is read as its last object; one with no object after the prose still throws', () => {
  const broken = '{"lang":"en","blocks":[{"kind":"paragraph","text":{"src":[[0,0]]}}]]}'
  const fixed = '{"lang":"en","blocks":[{"kind":"paragraph","text":{"src":[[0,1]]}}],"dropped":[]}'
  const page = parsePage(`${broken}\n\nWait — that is invalid. Here is the corrected, complete object:\n\n${fixed}`)
  assert.deepEqual(page.blocks[0], { kind: 'paragraph', text: { src: [[0, 1]] } })
  assert.throws(() => parsePage(`${broken}\n\nWait — that is invalid.`))
})
