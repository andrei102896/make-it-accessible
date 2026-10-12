import { union } from './geometry.ts'
import type { Box, Run } from './types.ts'

export type Paragraph = { lines: Run[][]; box: Box; align: Alignment }
type Alignment = 'left' | 'right' | 'center' | 'none'
type Line = { runs: Run[]; box: Box; sizes: number[] }

const ALIGN_EDGE = 2
const ALIGN_CENTER = 5
const SIZE_TOLERANCE = 0.2
const LINE_HEIGHT_TOLERANCE = 0.1
const MIN_LINE_HEIGHT = 0.5
const MAX_LINE_HEIGHT = 2

const aligned: Record<Alignment, (a: Box, b: Box) => boolean> = {
  left: (a, b) => Math.abs(a.x - b.x) < ALIGN_EDGE,
  right: (a, b) => Math.abs(a.x + a.w - (b.x + b.w)) < ALIGN_EDGE,
  center: (a, b) => Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < ALIGN_CENTER,
  none: () => false,
}

function alignment(a: Box, b: Box, suggested: Alignment): Alignment {
  if (aligned[suggested](a, b)) return suggested
  if (aligned.left(a, b)) return 'left'
  if (aligned.center(a, b)) return 'center'
  if (aligned.right(a, b)) return 'right'
  return 'none'
}

function toLines(runs: readonly Run[]): Line[] {
  const byLine = new Map<number, Run[]>()
  for (const r of runs) byLine.set(r.line, [...(byLine.get(r.line) ?? []), r])
  return [...byLine.values()].map((words) => ({
    runs: words,
    box: words.map((r) => r.box).reduce((a, b) => union(a, b)),
    sizes: [...new Set(words.map((r) => Math.round(r.box.h * 10) / 10))],
  }))
}

const lineHeightRatio = (next: Line, prevTop: number, prevSize: number): number =>
  Math.round(((next.box.y - prevTop) / prevSize) * 100) / 100

// Merges consecutive lines of one paragraph: same alignment (left or centre only), same text size, steady line spacing.
export function groupParagraphs(runs: readonly Run[]): Paragraph[] {
  const lines = toLines(runs).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const used = new Set<number>()
  const paragraphs: Paragraph[] = []
  lines.forEach((first, i) => {
    if (used.has(i)) return
    used.add(i)
    const merged = [first.runs]
    let box = first.box
    let align: Alignment = 'none'
    if (first.sizes.length === 1) {
      const anchor = first.box
      let spacing = 0
      let prevTop = first.box.y
      let prevSize = Math.max(...first.sizes)
      let current = first
      for (;;) {
        const k = lines.findIndex((next, j) => {
          if (j <= i || used.has(j) || next.sizes.length !== 1) return false
          const match = alignment(anchor, next.box, align)
          const centreOnly =
            aligned.center(anchor, next.box) && !aligned.left(anchor, next.box) && !aligned.right(anchor, next.box)
          const alignOk =
            match !== 'none' &&
            match !== 'right' &&
            (align === 'none'
              ? match === 'left' || centreOnly
              : !(align === 'left' && match === 'center') && match === align)
          if (!alignOk) return false
          const sizeOk =
            Math.abs(Math.max(...current.sizes) - Math.max(...next.sizes)) <= SIZE_TOLERANCE ||
            Math.abs(Math.min(...current.sizes) - Math.min(...next.sizes)) <= SIZE_TOLERANCE
          if (!sizeOk) return false
          const ratio = lineHeightRatio(next, prevTop, prevSize)
          return (
            Math.abs(ratio - (spacing || ratio)) <= LINE_HEIGHT_TOLERANCE &&
            ratio > MIN_LINE_HEIGHT &&
            ratio < MAX_LINE_HEIGHT
          )
        })
        const next = lines[k]
        if (!next) break
        if (!spacing) spacing = lineHeightRatio(next, prevTop, prevSize)
        if (align === 'none') align = alignment(anchor, next.box, align)
        prevTop = next.box.y
        prevSize = Math.max(...next.sizes)
        box = union(box, next.box)
        merged.push(next.runs)
        used.add(k)
        current = next
      }
    }
    paragraphs.push({ lines: merged, box, align })
  })
  return paragraphs
}
