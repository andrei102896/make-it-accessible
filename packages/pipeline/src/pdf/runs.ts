import { CENTS_HEIGHT_RATIO } from '../text/money.ts'
import { iou } from './geometry.ts'
import type { Run } from './types.ts'

const DUPLICATE_IOU = 0.8
const TOUCHING_GAP = 0.02
const MIN_CENTS_RATIO = 0.3

export function findDuplicates(runs: readonly Run[]): string[] {
  const duplicates: string[] = []
  runs.forEach((r, i) => {
    const earlier = runs.slice(0, i).some((o) => o.str === r.str && iou(o.box, r.box) > DUPLICATE_IOU)
    if (earlier) duplicates.push(r.id)
  })
  return duplicates
}

// Ligatures and kerning split one word into touching runs ("effi" + "ciency"); those join without a space.
export function joinRuns(runs: readonly Run[]): string {
  return runs
    .map((r, i) => {
      const prev = runs[i - 1]
      if (!prev) return r.str
      const touching = prev.line === r.line && Math.abs(r.box.x - (prev.box.x + prev.box.w)) < r.box.h * TOUCHING_GAP
      return (touching ? '' : ' ') + r.str
    })
    .join('')
}

// Leaflet prices print cents smaller, right of and top-aligned with the euros; the stream order is unreliable.
export function centPartner(euros: Run, runs: readonly Run[]): Run | undefined {
  if (!/^-?\d+[,.]?$/.test(euros.str)) return undefined
  const right = euros.box.x + euros.box.w
  const distance = (c: Run): number => Math.abs(c.box.x - right) + Math.abs(c.box.y - euros.box.y)
  const candidates = runs.filter(
    (c) =>
      /^\d{2}$/.test(c.str) &&
      c.box.h < euros.box.h * CENTS_HEIGHT_RATIO &&
      c.box.h > euros.box.h * MIN_CENTS_RATIO &&
      Math.abs(c.box.x - right) < euros.box.h * 0.3 &&
      c.box.y >= euros.box.y - 1 &&
      c.box.y < euros.box.y + euros.box.h * 0.5,
  )
  return candidates.sort((a, b) => distance(a) - distance(b))[0]
}
