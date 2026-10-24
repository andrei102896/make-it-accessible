import { deflateSync, inflateSync } from 'node:zlib'
import { fromHex } from '@make-it-accessible/pipeline/html/color'
import type { Grid } from '@make-it-accessible/pipeline/pdf/backdrop'

// Chromium draws a large page two ways from one pdf.js command stream (CASES), so a backdrop's pixels are compared
// within this, per cell byte: 3× the largest drift over 8 draws (1 level of a mean, one 0.001 step of min/max).
export const TOLERANCE = 3
const BYTES = 5

// A WebP's pixel size from its header (VP8X, lossy VP8, lossless VP8L).
export function webpSize(b: Buffer | null): string {
  if (b?.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP' || b.length < 30) return 'none'
  const kind = b.toString('ascii', 12, 16)
  const [w, h] =
    kind === 'VP8X'
      ? [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
      : kind === 'VP8 '
        ? [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
        : [1 + (b.readUInt32LE(21) & 0x3fff), 1 + ((b.readUInt32LE(21) >> 14) & 0x3fff)]
  return `${String(w)}x${String(h)}`
}

// backdrop.json without its pixels (hashed with the folder), and the pixels as one line: grid and WebP sizes, then
// per 8 pt cell its mean RGB, min and max (× 255), deflated.
export function backdropParts(
  page: string,
  grid: Grid,
  x2: Buffer | null,
  x1: Buffer | null,
): { rest: string; line: string } {
  const { min, max, mean, ...rest } = grid
  const cells = Buffer.alloc(mean.length * BYTES)
  mean.forEach((m, i) => {
    cells.set([...fromHex(m), Math.round((min[i] ?? 0) * 255), Math.round((max[i] ?? 0) * 255)], i * BYTES)
  })
  const sizes = `${String(rest.cols)}x${String(rest.rows)} ${webpSize(x2)} ${webpSize(x1)}`
  return { rest: JSON.stringify(rest), line: `${page} backdrop ${sizes} ${deflateSync(cells).toString('base64')}` }
}

const LINE = /^(p\d+) backdrop (\S+ \S+ \S+) (\S+)$/
// Two rounds' pages lines with each page's backdrop compared within TOLERANCE: the same drops out, a change becomes
// one line on the round's side (so the page is opened), never the cells themselves.
export function backdropsCompared(now: readonly string[], was: readonly string[]): [string[], string[]] {
  const of = (ls: readonly string[]): Map<string, RegExpExecArray> => {
    const pages = new Map<string, RegExpExecArray>()
    for (const l of ls) {
      const m = LINE.exec(l)
      if (m?.[1]) pages.set(m[1], m)
    }
    return pages
  }
  const [a, b] = [of(now), of(was)]
  const changes: string[] = []
  for (const p of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const [x, y] = [a.get(p), b.get(p)]
    // A document this round did not build opens nothing.
    if (!x && !now.length) continue
    if (!x || !y) {
      changes.push(`${p} backdrop: ${x ? 'drawn, none before' : 'none, drawn before'}`)
      continue
    }
    if (x[2] !== y[2]) {
      changes.push(`${p} backdrop: sizes ${y[2] ?? ''} → ${x[2] ?? ''}`)
      continue
    }
    const [u, v] = [inflateSync(Buffer.from(x[3] ?? '', 'base64')), inflateSync(Buffer.from(y[3] ?? '', 'base64'))]
    const past = new Set<number>()
    let largest = 0
    u.forEach((byte, i) => {
      const d = Math.abs(byte - (v[i] ?? 0))
      if (d <= TOLERANCE) return
      past.add(Math.floor(i / BYTES))
      largest = Math.max(largest, d)
    })
    if (past.size)
      changes.push(`${p} backdrop: ${String(past.size)} cells past ${String(TOLERANCE)} (largest ${String(largest)})`)
  }
  const rest = (ls: readonly string[]): string[] => ls.filter((l) => !LINE.test(l))
  return [[...rest(now), ...changes], rest(was)]
}
