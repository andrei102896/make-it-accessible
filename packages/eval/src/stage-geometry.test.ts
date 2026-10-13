import assert from 'node:assert/strict'
import { test } from 'node:test'
import { around, tiles } from './stage-geometry.ts'

test('tiles cover the image, stay within the size limit and overlap their neighbours', () => {
  for (const [w, h] of [
    [2480, 3508],
    [4961, 3508],
    [900, 700],
    [1200, 1201],
  ] as const) {
    const all = tiles(w, h, 1200, 120)
    for (const t of all)
      assert.ok(t.w <= 1200 && t.h <= 1200 && t.x >= 0 && t.y >= 0 && t.x + t.w <= w && t.y + t.h <= h)
    const covered = (px: number, py: number): boolean =>
      all.some((t) => px >= t.x && px < t.x + t.w && py >= t.y && py < t.y + t.h)
    for (const [px, py] of [
      [0, 0],
      [w - 1, h - 1],
      [Math.floor(w / 2), Math.floor(h / 2)],
      [w - 1, 0],
    ] as const)
      assert.ok(covered(px, py), `${String(w)}x${String(h)} at ${String(px)},${String(py)}`)
    const cols = all.filter((t) => t.row === 0)
    cols.slice(1).forEach((t, i) => {
      const prev = cols[i]
      assert.ok(prev && prev.x + prev.w - t.x >= 120, 'neighbours overlap')
    })
  }
})

test('a crop widens a box by its height, within a minimum and a maximum, and stays on the page', () => {
  assert.deepEqual(around({ x: 100, y: 100, w: 20, h: 10 }, { w: 595, h: 842 }, 3, 36, 72), {
    x: 64,
    y: 64,
    w: 92,
    h: 82,
  })
  assert.deepEqual(around({ x: 5, y: 830, w: 20, h: 20 }, { w: 595, h: 842 }, 3, 36, 72), {
    x: 0,
    y: 770,
    w: 85,
    h: 72,
  })
  assert.deepEqual(around({ x: 200, y: 200, w: 100, h: 40 }, { w: 595, h: 842 }, 3, 36, 72), {
    x: 128,
    y: 128,
    w: 244,
    h: 184,
  })
})
