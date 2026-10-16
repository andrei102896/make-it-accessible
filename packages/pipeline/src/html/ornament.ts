import { crc32, deflateSync } from 'node:zlib'
import { fromHex, hex, type Rgb } from './color.ts'
import { CENTRED, isInk, MAX_THICK, REACH } from './rules.ts'
import type { Pixels } from '../pdf/pixels.ts'
import type { Box } from '../pdf/types.ts'

// An ornament printed right under a heading (a flourish, a rule with arrow ends): one shape of ink that is not a
// plain rule and touches no words. Read from the page render; boxes in PDF points, `k` render pixels per point.
export type Ornament = { box: Box; color: string; centered: boolean }

// Ink this close counts as one shape: anti-aliasing leaves hairline gaps between a flourish and its line.
const GAP = 2
// A shape this large is a picture or a panel: it is rejected, never cut down to a part of itself.
const MAX_PIXELS = 20_000
const MIN_WIDTH = 12
// Ornaments are line art: a shape inked over more than this share of its box is a bar or a panel.
const MAX_DENSITY = 0.5
const PAD = 2
// A line of letters: MIN_LETTERS or more pieces of the shape (no joining gap) at least this share of the heading's
// height tall (a 13 pt x-height under a 20 pt heading is 0.29). Image text under a heading (Carmine's beer names)
// is no ornament; the dots of a dotted rule are smaller.
const MIN_LETTERS = 4
const LETTER_SHARE = 0.2
// Ornaments of the same size (points) are the same drawing repeated; a page embeds at most MAX_ORNAMENTS of them.
const SAME_SIZE = 1.5
export const MAX_ORNAMENTS = 4

type Rect = { x0: number; y0: number; x1: number; y1: number }
const rect = (b: Box, k: number): Rect => ({
  x0: Math.floor(b.x * k),
  y0: Math.floor(b.y * k),
  x1: Math.ceil((b.x + b.w) * k),
  y1: Math.ceil((b.y + b.h) * k),
})
const inside = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

// `words` are the page's visible words other than the heading's own.
export function ornamentBelow(
  img: Pixels,
  k: number,
  heading: Box,
  pageWidth: number,
  words: readonly Box[],
  bg: Rgb,
): Ornament | null {
  const own = rect(heading, k)
  const text = words.map((w) => rect(w, k))
  const bottom = Math.min(img.height - 1, Math.round((heading.y + heading.h * (1 + REACH)) * k))
  const stack: [number, number][] = []
  const seen = new Uint8Array(img.width * img.height)
  for (let y = own.y1 + 1; y <= bottom && !stack.length; y++)
    for (let x = Math.max(0, own.x0); x <= Math.min(img.width - 1, own.x1); x++) {
      if (!isInk(img.at(x, y), bg)) continue
      // Text right under the heading: nothing is drawn between them.
      if (text.some((r) => inside(r, x, y))) return null
      stack.push([x, y])
      seen[y * img.width + x] = 1
    }
  let [x0, y0, x1, y1, n] = [Infinity, Infinity, -1, -1, 0]
  const colors = new Map<string, number>()
  const inked: number[] = []
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [x, y] = next
    if (++n > MAX_PIXELS || text.some((r) => inside(r, x, y))) return null
    inked.push(y * img.width + x)
    ;[x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
    if (y1 - y0 > heading.h * k) return null
    const c = hex(img.at(x, y))
    colors.set(c, (colors.get(c) ?? 0) + 1)
    for (let dy = -GAP; dy <= GAP; dy++)
      for (let dx = -GAP; dx <= GAP; dx++) {
        const [nx, ny] = [x + dx, y + dy]
        if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height || seen[ny * img.width + nx]) continue
        seen[ny * img.width + nx] = 1
        if (!inside(own, nx, ny) && isInk(img.at(nx, ny), bg)) stack.push([nx, ny])
      }
  }
  const [w, h] = [x1 - x0 + 1, y1 - y0 + 1]
  if (!n || h <= MAX_THICK + 1 || w < MIN_WIDTH || n > w * h * MAX_DENSITY) return null
  // A frame drawn round words: its lines touch none of them, its box holds them.
  if (text.some((r) => r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0)) return null
  if (lettersIn(inked, img.width, heading.h * k * LETTER_SHARE) >= MIN_LETTERS) return null
  const box = { x: (x0 - PAD) / k, y: (y0 - PAD) / k, w: (w + 2 * PAD) / k, h: (h + 2 * PAD) / k }
  const offset = Math.abs(box.x + box.w / 2 - (heading.x + heading.w / 2)) / pageWidth
  const color = [...colors].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#000000'
  return { box, color, centered: offset < CENTRED }
}

// How many pieces of the shape, joined only where pixels touch, are at least `minHeight` tall.
function lettersIn(inked: readonly number[], width: number, minHeight: number): number {
  const left = new Set(inked)
  let letters = 0
  for (const start of inked) {
    if (!left.delete(start)) continue
    const stack = [start]
    let [y0, y1] = [Infinity, -1]
    for (let p = stack.pop(); p !== undefined; p = stack.pop()) {
      const [x, y] = [p % width, Math.floor(p / width)]
      ;[y0, y1] = [Math.min(y0, y), Math.max(y1, y)]
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const q = (y + dy) * width + x + dx
          if (x + dx >= 0 && x + dx < width && left.delete(q)) stack.push(q)
        }
    }
    if (y1 - y0 + 1 >= minHeight) letters++
  }
  return letters
}

export type Found = Ornament & { key: string; page: number }
export type OrnamentGroup = Found & { headings: string[] }

// The distinct ornaments, each with the headings that carry it, most used first.
export function groupOrnaments(found: readonly Found[]): OrnamentGroup[] {
  const groups: OrnamentGroup[] = []
  for (const f of found) {
    const same = groups.find(
      (g) => Math.abs(g.box.w - f.box.w) <= SAME_SIZE && Math.abs(g.box.h - f.box.h) <= SAME_SIZE,
    )
    if (same) same.headings.push(f.key)
    else groups.push({ ...f, headings: [f.key] })
  }
  return groups.sort((a, b) => b.headings.length - a.headings.length).slice(0, MAX_ORNAMENTS)
}

// The ornament as an alpha mask (PNG, grey and alpha): its colour comes from CSS, its paper stays the page's.
export function ornamentMask(img: Pixels, bg: Rgb, color: string): Uint8Array {
  const strength = (c: Rgb): number => Math.max(...c.map((v, i) => Math.abs(v - (bg[i] ?? 0))))
  const full = Math.max(1, strength(fromHex(color)))
  const row = 1 + 2 * img.width
  const raw = Buffer.alloc(row * img.height)
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      raw[y * row + 2 + 2 * x] = Math.min(255, Math.round((255 * strength(img.at(x, y))) / full))
  const header = Buffer.alloc(13)
  header.writeUInt32BE(img.width, 0)
  header.writeUInt32BE(img.height, 4)
  header.set([8, 4, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}
