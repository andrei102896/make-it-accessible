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
