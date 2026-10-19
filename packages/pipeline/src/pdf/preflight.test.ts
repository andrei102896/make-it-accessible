import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { LIMITS, preflight } from './preflight.ts'
import { Refused } from './refused.ts'
import { flateStreams } from './streams.ts'

// A minimal valid PDF: one page per size, each drawing a word, plus `extra` raw stream objects (an adversarial body).
function pdf(sizes: readonly [number, number][], extra: readonly Buffer[] = []): Buffer {
  const objects: Buffer[] = []
  const add = (body: Buffer | string): number => objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body))
  const content = 'BT /F1 12 Tf 10 10 Td (Menu) Tj ET'
  add('<< /Type /Catalog /Pages 2 0 R >>')
  const kids = sizes.map((_, i) => `${String(4 + i * 2)} 0 R`).join(' ')
  add(`<< /Type /Pages /Kids [${kids}] /Count ${String(sizes.length)} >>`)
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  for (const [w, h] of sizes) {
    const self = objects.length + 1
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(w)} ${String(h)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(self + 1)} 0 R >>`,
    )
    add(`<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`)
  }
  for (const data of extra)
    add(
      Buffer.concat([
        Buffer.from(`<< /Length ${String(data.length)} /Filter /FlateDecode >>\nstream\n`),
        data,
        Buffer.from('\nendstream'),
      ]),
    )
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')]
  const offsets: number[] = []
  let at = parts[0]?.length ?? 0
  objects.forEach((o, i) => {
    offsets.push(at)
    const obj = Buffer.concat([Buffer.from(`${String(i + 1)} 0 obj\n`), o, Buffer.from('\nendobj\n')])
    parts.push(obj)
    at += obj.length
  })
  const xref = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  parts.push(
    Buffer.from(
      `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(at)}\n%%EOF\n`,
    ),
  )
  return Buffer.concat(parts)
}

const bomb = (bytes: number): Buffer => deflateSync(Buffer.alloc(bytes))

test('a decompression bomb is refused once the document budget is spent, every attempt charged', () => {
  assert.throws(() => flateStreams(pdf([[100, 100]], [bomb(2_000_000)]), { left: 1_000_000 }), Refused)
  assert.equal(flateStreams(pdf([[100, 100]], [bomb(1000)]), { left: 1_000_000 })[0]?.length, 1000)
  // Two streams that each fit but together pass the budget.
  const both = Buffer.concat([pdf([[100, 100]], [bomb(600_000), bomb(600_000)])])
  assert.throws(() => flateStreams(both, { left: 1_000_000 }), Refused)
})

test('preflight refuses too many pages, a page past A0 or a bomb, and passes a menu with its page count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mia-preflight-'))
  const file = async (name: string, data: Buffer): Promise<string> => {
    await writeFile(join(dir, name), data)
    return join(dir, name)
  }
  try {
    assert.equal(await preflight(await file('menu.pdf', pdf([[612, 792]]))), 1)
    const limits = { ...LIMITS, inflated: 1_000_000 }
    const many = await file('many.pdf', pdf(Array.from({ length: 21 }, (): [number, number] => [612, 792])))
    await assert.rejects(preflight(many), /21 pages, more than 20/)
    await assert.rejects(preflight(await file('huge.pdf', pdf([[14400, 14400]]))), /larger than A0/)
    await assert.rejects(preflight(await file('bomb.pdf', pdf([[612, 792]], [bomb(2_000_000)])), limits), Refused)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
