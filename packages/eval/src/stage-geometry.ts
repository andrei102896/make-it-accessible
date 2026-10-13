// Where the staged images cut the page: pure arithmetic, tested on its own.
export type Rect = { x: number; y: number; w: number; h: number }

// Starts of `n` equal windows of `size` spread over `length`, the first at 0 and the last flush with the end.
function spread(length: number, size: number, overlap: number): number[] {
  if (length <= size) return [0]
  const n = Math.ceil((length - overlap) / (size - overlap))
  return Array.from({ length: n }, (_, i) => Math.round((i * (length - size)) / (n - 1)))
}

// Tiles of at most `max` px, neighbours sharing at least `overlap` px, covering a width × height image, row by row.
export function tiles(
  width: number,
  height: number,
  max: number,
  overlap: number,
): (Rect & { row: number; col: number })[] {
  const xs = spread(width, max, overlap)
  const ys = spread(height, max, overlap)
  return ys.flatMap((y, row) =>
    xs.map((x, col) => ({ row, col, x, y, w: Math.min(max, width), h: Math.min(max, height) })),
  )
}

// A box widened by `near` of its heights each way (between `min` and `max`), kept on the page.
export function around(box: Rect, page: { w: number; h: number }, near: number, min: number, max: number): Rect {
  const m = Math.min(Math.max(near * box.h, min), max)
  const x = Math.max(0, box.x - m)
  const y = Math.max(0, box.y - m)
  return { x, y, w: Math.min(page.w, box.x + box.w + m) - x, h: Math.min(page.h, box.y + box.h + m) - y }
}
