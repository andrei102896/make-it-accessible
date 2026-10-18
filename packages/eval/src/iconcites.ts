import type { Run } from '@make-it-accessible/pipeline/pdf/types'

type Range = [number, number]

// A saved structure cites icon words by index after the text layer's `base` runs; the icon reading may have changed
// since (one run per label), so each citation moves to the fresh icon runs drawn at the same place. False when one
// has no fresh twin or its twins are not one range: the structure is then left half-moved and must not be used.
export function moveIconCites(structure: unknown, saved: readonly Run[], fresh: readonly Run[], base: number): boolean {
  const twins = new Map<number, number>()
  for (let i = base; i < saved.length; i++) {
    const b = saved[i]?.box
    const j = b ? fresh.findIndex((f, k) => k >= base && f.icon && holds(f.box, b.x + b.w / 2, b.y + b.h / 2)) : -1
    if (j >= 0) twins.set(i, j)
  }
  const move = ([a, b]: Range): Range | null => {
    if (b < base) return [a, b]
    if (a < base) return null
    const js = new Set(Array.from({ length: b - a + 1 }, (_, k) => twins.get(a + k)))
    if (js.has(undefined)) return null
    const sorted = [...js].map(Number).sort((x, y) => x - y)
    const [lo = 0, hi = 0] = [sorted[0], sorted.at(-1)]
    return hi - lo + 1 === sorted.length ? [lo, hi] : null
  }
  let ok = true
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object' && v !== null)
      for (const [key, x] of Object.entries(v)) {
        if (key !== 'src' || !Array.isArray(x)) {
          walk(x)
          continue
        }
        const moved = x.map((r: unknown) => (Array.isArray(r) ? move([Number(r[0]), Number(r[1])]) : null))
        if (moved.some((r) => !r)) ok = false
        // Two saved words of one label become one citation.
        else Reflect.set(v, 'src', [...new Map(moved.map((r) => [String(r), r])).values()])
      }
  }
  walk(structure)
  return ok
}

const holds = (b: Run['box'], x: number, y: number): boolean => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
