import { z } from 'zod'
import { MAX_BUFFER, poppler } from '../pdf/poppler.ts'
import type { Run } from '../pdf/types.ts'

export type Rgb = readonly [number, number, number]
const Hex = z.string().regex(/^#[0-9a-f]{6}$/)
// `band`: the document's own background and text colour for the title band (none for a plain white page);
// `accent`: a colour of the document readable on a light page, for section headings. Hex only: it lands in CSS.
export const ThemeSchema = z
  .object({ band: z.object({ bg: Hex, fg: Hex }).strict().nullable(), accent: Hex.nullable() })
  .strict()
export type Theme = z.infer<typeof ThemeSchema>
export type Pixels = { width: number; height: number; at: (x: number, y: number) => Rgb }

const AA = 4.5
// A background this close to white is a plain page: no band.
const PLAIN = 1.25
const SAMPLE_DPI = 72
const WHITE: Rgb = [255, 255, 255]

const channel = (v: number): number => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
// WCAG 2 contrast ratio.
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}
const hex = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`

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

// Most frequent colour among the samples, quantised to 16 levels per channel and returned at the bucket's centre.
function mode(samples: readonly Rgb[]): Rgb | null {
  const counts = new Map<string, number>()
  for (const [r, g, b] of samples) {
    const key = `${String(r >> 4)},${String(g >> 4)},${String(b >> 4)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  const [r = 0, g = 0, b = 0] = top[0].split(',').map((q) => Number(q) * 16 + 8)
  return [r, g, b]
}

// Colours are read only at the text: ink inside the word boxes, background in a ring around them, so photos
// (often most of a page) never decide the theme. `boxes` are in the image's pixels.
export function themeFromPixels(
  img: Pixels,
  boxes: readonly { x: number; y: number; w: number; h: number }[],
): Theme | null {
  const ring: Rgb[] = []
  const inside: Rgb[] = []
  const clamp = (v: number, max: number): number => Math.min(max - 1, Math.max(0, Math.round(v)))
  for (const b of boxes) {
    const pad = Math.max(1, b.h * 0.25)
    for (let x = b.x - pad; x <= b.x + b.w + pad; x++) {
      ring.push(img.at(clamp(x, img.width), clamp(b.y - pad, img.height)))
      ring.push(img.at(clamp(x, img.width), clamp(b.y + b.h + pad, img.height)))
    }
    for (let y = b.y; y <= b.y + b.h; y++)
      for (let x = b.x; x <= b.x + b.w; x++) inside.push(img.at(clamp(x, img.width), clamp(y, img.height)))
  }
  const band = mode(ring)
  if (!band) return null
  const ink = mode(inside.filter((c) => contrast(c, band) >= AA))
  if (!ink || contrast(band, ink) < AA) return null
  const accent = [band, ink].find((c) => contrast(c, WHITE) >= AA) ?? null
  return {
    band: contrast(band, WHITE) < PLAIN ? null : { bg: hex(band), fg: hex(ink) },
    accent: accent && hex(accent),
  }
}

export async function pageTheme(pdf: string, pdfPage: number, runs: readonly Run[]): Promise<Theme | null> {
  const page = String(pdfPage)
  const { stdout } = await poppler('pdftoppm', ['-q', '-f', page, '-l', page, '-r', String(SAMPLE_DPI), pdf], {
    encoding: 'buffer',
    maxBuffer: MAX_BUFFER,
  })
  const k = SAMPLE_DPI / 72
  const boxes = runs.map((r) => ({ x: r.box.x * k, y: r.box.y * k, w: r.box.w * k, h: r.box.h * k }))
  return themeFromPixels(parsePpm(stdout), boxes)
}
