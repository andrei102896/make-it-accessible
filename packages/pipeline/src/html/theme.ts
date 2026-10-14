import { z } from 'zod'
import type { Pixels } from '../pdf/pixels.ts'
import { renderPixels } from '../pdf/poppler.ts'
import type { Run } from '../pdf/types.ts'
import { contrast, hex, readableOn, type Rgb } from './color.ts'

const Hex = z.string().regex(/^#[0-9a-f]{6}$/)
// `band`: the document's own background and text colour for the title band (none for a plain white page);
// `accent`: one brand colour, made readable on the light and on the dark page. Hex only: it lands in CSS.
export const ThemeSchema = z
  .object({
    band: z.object({ bg: Hex, fg: Hex }).strict().nullable(),
    accent: z.object({ light: Hex, dark: Hex }).strict().nullable(),
  })
  .strict()
export type Theme = z.infer<typeof ThemeSchema>
// Colours measured on the pages, offered to the brief by index so it never invents one.
export type Swatch = { hex: string; role: 'background' | 'text'; share: number }
type Box = { x: number; y: number; w: number; h: number }

const AA = 4.5
// A background this close to white is a plain page: no band.
const PLAIN = 1.25
const SAMPLE_DPI = 72
const MIN_SHARE = 0.03
const MAX_SWATCHES = 5
const WHITE: Rgb = [255, 255, 255]
// Must match --bg of the dark scheme in style.ts.
const DARK_BG: Rgb = [18, 18, 18]
const BLACK: Rgb = [0, 0, 0]

// Colours quantised to 16 levels per channel, most frequent first, at each bucket's centre.
function ranked(samples: readonly Rgb[]): { c: Rgb; share: number }[] {
  const counts = new Map<string, number>()
  for (const [r, g, b] of samples) {
    const key = `${String(r >> 4)},${String(g >> 4)},${String(b >> 4)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => {
      const [r = 0, g = 0, b = 0] = key.split(',').map((q) => Number(q) * 16 + 8)
      const c: Rgb = [r, g, b]
      return { c, share: n / samples.length }
    })
}

// Colours are read only at the text: ink inside the word boxes, background in a ring around them, so photos
// (often most of a page) never decide the theme. `boxes` are in the image's pixels.
export function sample(img: Pixels, boxes: readonly Box[]): { ring: Rgb[]; inside: Rgb[] } {
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
  return { ring, inside }
}

export function swatches(s: { ring: Rgb[]; inside: Rgb[] }): Swatch[] {
  const backgrounds = ranked(s.ring)
    .filter((x) => x.share >= MIN_SHARE)
    .slice(0, MAX_SWATCHES)
  const bg = backgrounds[0]?.c ?? WHITE
  const inks = ranked(s.inside.filter((c) => contrast(c, bg) >= 3)).slice(0, MAX_SWATCHES)
  return [
    ...backgrounds.map((x) => ({ hex: hex(x.c), role: 'background' as const, share: x.share })),
    ...inks.map((x) => ({ hex: hex(x.c), role: 'text' as const, share: x.share })),
  ]
}

// A theme from a band background and an accent, both measured colours: the band keeps the document's own ink when
// it reads on it (else black or white), the accent is moved in lightness only as far as each page needs.
export function themeFrom(band: Rgb | null, ink: Rgb | null, accent: Rgb | null): Theme {
  const fg =
    band && (ink && contrast(ink, band) >= AA ? ink : contrast(BLACK, band) >= contrast(WHITE, band) ? BLACK : WHITE)
  const light = accent && readableOn(accent, WHITE, AA)
  const dark = accent && readableOn(accent, DARK_BG, AA)
  return {
    band: band && fg && contrast(band, WHITE) >= PLAIN ? { bg: hex(band), fg: hex(fg) } : null,
    accent: light && dark ? { light: hex(light), dark: hex(dark) } : null,
  }
}

// Without a brief: the most frequent background around the text and the ink on it.
export function themeFromPixels(img: Pixels, boxes: readonly Box[]): Theme | null {
  const s = sample(img, boxes)
  const band = ranked(s.ring)[0]?.c
  if (!band) return null
  const ink = ranked(s.inside.filter((c) => contrast(c, band) >= AA))[0]?.c ?? null
  if (!ink) return null
  return themeFrom(band, ink, contrast(band, WHITE) >= PLAIN ? band : ink)
}

export async function pagePixels(
  pdf: string,
  pdfPage: number,
  runs: readonly Run[],
): Promise<{ img: Pixels; boxes: Box[] }> {
  const k = SAMPLE_DPI / 72
  return {
    img: await renderPixels(pdf, pdfPage, SAMPLE_DPI),
    boxes: runs.map((r) => ({ x: r.box.x * k, y: r.box.y * k, w: r.box.w * k, h: r.box.h * k })),
  }
}

export async function pageTheme(pdf: string, pdfPage: number, runs: readonly Run[]): Promise<Theme | null> {
  const { img, boxes } = await pagePixels(pdf, pdfPage, runs)
  return themeFromPixels(img, boxes)
}
