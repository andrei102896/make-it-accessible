import type { Box } from './types.ts'

const MERGE_OVERLAP = 0.5

export function mergeOverlapping(boxes: Box[]): Box[] {
  const merged: Box[] = []
  for (const box of boxes) {
    const target = merged.findIndex((m) => intersection(m, box) / Math.min(area(m), area(box)) > MERGE_OVERLAP)
    const current = merged[target]
    if (current) merged[target] = union(current, box)
    else merged.push(box)
  }
  return merged
}

export const area = (b: Box): number => b.w * b.h

export function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export function iou(a: Box, b: Box): number {
  const i = intersection(a, b)
  return i / (area(a) + area(b) - i)
}

export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

// A picture's box cut back from every word reaching into its edge (each time the cut keeping the most picture);
// words well inside are its own (a label on a pack). Null when less than `minShare` of it would remain.
const MIN_PICTURE_SHARE = 0.4
const EDGE = 0.2
export function clearOfText(box: Box, words: readonly Box[], minShare = MIN_PICTURE_SHARE): Box | null {
  const inner = {
    x: box.x + box.w * EDGE,
    y: box.y + box.h * EDGE,
    w: box.w * (1 - 2 * EDGE),
    h: box.h * (1 - 2 * EDGE),
  }
  const inside = (w: Box): boolean =>
    w.x >= inner.x && w.y >= inner.y && w.x + w.w <= inner.x + inner.w && w.y + w.h <= inner.y + inner.h
  const edgeWords = words.filter((w) => !inside(w))
  let b = box
  for (let w = edgeWords.find((x) => intersection(b, x) > 0); w; w = edgeWords.find((x) => intersection(b, x) > 0)) {
    const cuts: Box[] = [
      { ...b, h: w.y - b.y },
      { ...b, y: w.y + w.h, h: b.y + b.h - (w.y + w.h) },
      { ...b, w: w.x - b.x },
      { ...b, x: w.x + w.w, w: b.x + b.w - (w.x + w.w) },
    ]
    b = cuts.reduce((best, c) => (c.w > 0 && c.h > 0 && area(c) > area(best) ? c : best), { ...b, w: 0, h: 0 })
    if (area(b) < area(box) * minShare) return null
  }
  return b
}
