import assert from 'node:assert/strict'
import { test } from 'node:test'
import { missingDetails } from './details.ts'

test('an ornament under its named heading is drawn; other details and other headings are not', () => {
  const html = '<h3 id="s0-0" class="hs-3 orn-1">KENDELLS <span>BISTRO</span></h3><h4 class="hs-3">LES ENTRÉES</h4>'
  const details = [
    { kind: 'ornament', near: 'Kendells Bistro' },
    { kind: 'ornament', near: 'Les Entrées' },
    { kind: 'box', near: 'Homemade bread with butter' },
  ] as const
  assert.deepEqual(missingDetails(html, details), details.slice(1))
})
