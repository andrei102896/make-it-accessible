import assert from 'node:assert/strict'
import { test } from 'node:test'
import { familyBudget, shownFiles, type FontManifest } from './webfonts.ts'

const lato: FontManifest = {
  family: 'Lato',
  key: 'lato',
  license: 'OFL',
  copyright: 'Copyright The Lato Authors',
  category: 'text',
  files: [
    { file: 'lato-400.woff2', style: 'normal', weight: '400', unicodeRange: 'U+0000-00FF' },
    { file: 'lato-400i.woff2', style: 'italic', weight: '400', unicodeRange: 'U+0000-00FF' },
    { file: 'lato-700.woff2', style: 'normal', weight: '700', unicodeRange: 'U+0000-00FF' },
    { file: 'lato-700i.woff2', style: 'italic', weight: '700', unicodeRange: 'U+0000-00FF' },
  ],
}

test('the files embedded are those its words draw in, each part counting only the words it cites', () => {
  // Names bold upright, descriptions mostly italic: no word draws in Lato 700 italic, so none asks it.
  const names = {
    face: { key: 'lato', weight: 700, italic: false },
    words: 3,
    letters: [{ weight: null, italic: false, letters: 12 }],
  }
  const descs = {
    face: { key: 'lato', weight: 400, italic: true },
    words: 9,
    letters: [
      { weight: null, italic: true, letters: 30 },
      { weight: null, italic: false, letters: 8 },
      // A word its line sets apart in its own weight draws in it.
      { weight: 700, italic: true, letters: 0 },
    ],
  }
  const files = shownFiles([
    { manifest: lato, style: names },
    { manifest: lato, style: descs },
  ]).map((s) => [s.file.file, s.letters])
  assert.deepEqual(files, [
    ['lato-700.woff2', 12],
    ['lato-400i.woff2', 30],
    ['lato-400.woff2', 8],
    ['lato-700i.woff2', 0],
  ])
  // A style built without its letters draws its role's face upright.
  assert.deepEqual(
    shownFiles([{ manifest: lato, style: { face: names.face, words: 3 } }]).map((s) => s.file.file),
    ['lato-700.woff2'],
  )
})

test("files go in by letters within the count and bytes; a family's others only once its most-used is in", () => {
  const f = (family: string, file: string, letters: number, bytes: number) => ({
    manifest: { key: family },
    file: { file },
    letters,
    bytes,
  })
  const shown = [
    f('lato', 'regular', 50, 60),
    f('lato', 'italic', 5, 50),
    f('bodoni', 'bold', 40, 100),
    f('bodoni', 'italic', 20, 10),
  ]
  // Bodoni's main file does not fit, so its italic (which would switch Bodoni on for upright words) stays out.
  assert.deepEqual(
    familyBudget(shown, 4, 150).map((w) => `${w.manifest.key}/${w.file.file}`),
    ['lato/regular', 'lato/italic'],
  )
  assert.deepEqual(
    familyBudget(shown, 1, 500).map((w) => `${w.manifest.key}/${w.file.file}`),
    ['lato/regular'],
  )
})
