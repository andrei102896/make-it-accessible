import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Extraction, Run } from '../pdf/types.ts'
import { inventory } from './prompt.ts'

test('a line holding icon words is listed left to right; other lines keep the order read', () => {
  const run = (id: string, str: string, x: number, icon?: true): Run => ({
    id,
    str,
    box: { x, y: 100, w: 20, h: 12 },
    flow: 0,
    line: 1,
    ...(icon && { icon }),
  })
  const e: Extraction = {
    pdfPage: 1,
    width: 600,
    height: 800,
    runs: [run('1:0', 'Cullen', 10), run('1:1', '(', 60), run('1:2', 'available)', 90), run('1:3', 'gluten', 70, true)],
    images: [],
    duplicates: [],
    hidden: [],
  }
  assert.match(inventory(e, { width: 600, height: 800 }), /0=Cullen 1=\( 3=gluten 2=available\)/)
  assert.match(
    inventory({ ...e, runs: e.runs.slice(0, 3) }, { width: 600, height: 800 }),
    /0=Cullen 1=\( 2=available\)/,
  )
})
