import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  expired,
  expiryRow,
  formatExpiry,
  HELD_FILE,
  heldErrors,
  heldOf,
  parseExpiry,
  previewFile,
  withAssets,
  withNoindex,
} from './preview.ts'

test('a preview file name is the slug with a random suffix; its row expires after 30 days', () => {
  const file = previewFile("Bud & Alley's")
  assert.match(file, /^bud-alley-s-[0-9a-f]{6}\.html$/)
  const row = expiryRow(file, "Bud & Alley's", new Date('2026-10-16T09:00:00Z'))
  assert.equal(row.added, '2026-10-16')
  assert.equal(row.deleteBy, '2026-11-15')
})

test('noindex is added once, after the viewport meta', () => {
  const page =
    '<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>x</title>'
  const once = withNoindex(page)
  assert.match(once, /initial-scale=1">\n<meta name="robots" content="noindex, nofollow">\n<title>/)
  assert.equal(withNoindex(once), once)
})

test('the expiry list round-trips, keeps commas in names, and names the rows past their date', () => {
  const rows = [
    expiryRow('a-1a2b3c.html', 'Ferrara Bakery, Cafe', new Date('2026-10-01T00:00:00Z')),
    expiryRow('b-4d5e6f.html', 'Rucola', new Date('2026-10-16T00:00:00Z')),
  ]
  const csv = formatExpiry(rows)
  assert.deepEqual(parseExpiry(csv), rows)
  assert.deepEqual(
    expired(rows, new Date('2026-10-31T12:00:00Z')).map((r) => r.file),
    ['a-1a2b3c.html'],
  )
  assert.throws(() => parseExpiry('file,business\nx,y'))
})

test("a preview's backdrops become files in a folder named like the page; its crops stay inline", () => {
  const html =
    '<img class="backdrop" src="p01/backdrop.jpg" alt=""><img src="data:image/jpeg;base64,AA"><img class="backdrop" src="p12/backdrop.jpg"><style>src: url(fonts/jost-normal.woff2) src: url(fonts/pdf-0123456789ab.otf)</style>'
  const out = withAssets(html, 'gigi-a1b2c3.html')
  assert.equal(
    out.html,
    '<img class="backdrop" src="gigi-a1b2c3/p01.jpg" alt=""><img src="data:image/jpeg;base64,AA"><img class="backdrop" src="gigi-a1b2c3/p12.jpg"><style>src: url(gigi-a1b2c3/fonts/jost-normal.woff2) src: url(gigi-a1b2c3/fonts/pdf-0123456789ab.otf)</style>',
  )
  assert.deepEqual(out.assets, [
    { from: 'p01/backdrop.jpg', to: 'gigi-a1b2c3/p01.jpg' },
    { from: 'p12/backdrop.jpg', to: 'gigi-a1b2c3/p12.jpg' },
    { from: 'fonts/jost-normal.woff2', to: 'gigi-a1b2c3/fonts/jost-normal.woff2' },
    { from: 'fonts/pdf-0123456789ab.otf', to: 'gigi-a1b2c3/fonts/pdf-0123456789ab.otf' },
  ])
})

test('a document is held while it has content errors, or was built before the gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mia-held-'))
  try {
    assert.match((await heldErrors(dir))[0] ?? '', /before the publication gate/)
    await writeFile(join(dir, HELD_FILE), '[]')
    assert.deepEqual(await heldErrors(dir), [])
    await writeFile(join(dir, HELD_FILE), JSON.stringify([{ pdfPage: 2, path: 'blocks[0]', problem: 'not an amount' }]))
    assert.deepEqual(await heldErrors(dir), ['p2 blocks[0]: not an amount'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a page that did not convert holds its document, as a content error does', () => {
  const ok = { pdfPage: 1, validation: { errors: [] } }
  assert.deepEqual(heldOf([1], [ok]), [])
  assert.deepEqual(heldOf([1, 2], [ok]), [
    { pdfPage: 2, path: 'page', problem: 'the page did not convert (failure.txt in its folder)' },
  ])
  const wrong = { pdfPage: 1, validation: { errors: [{ path: 'blocks[0]', problem: 'not an amount' }] } }
  assert.deepEqual(heldOf([1], [wrong]), [{ pdfPage: 1, path: 'blocks[0]', problem: 'not an amount' }])
})
