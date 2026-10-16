import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expired, expiryRow, formatExpiry, parseExpiry, previewFile, withNoindex } from './preview.ts'

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
