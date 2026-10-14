import type { Rgb } from '../html/color.ts'

export type Pixels = { width: number; height: number; at: (x: number, y: number) => Rgb }

export function parsePpm(buf: Buffer): Pixels {
  const header = buf.subarray(0, 64).toString('latin1')
  const m = /^P6\s+(?:#.*\s+)*(\d+)\s+(\d+)\s+(\d+)\s/.exec(header)
  if (!m || m[3] !== '255') throw new Error('not an 8-bit binary PPM')
  const [width, height] = [Number(m[1]), Number(m[2])]
  const offset = m[0].length
  return {
    width,
    height,
    at: (x, y) => {
      const i = offset + 3 * (y * width + x)
      return [buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0]
    },
  }
}
