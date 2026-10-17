export type Rgb = readonly [number, number, number]

const channel = (v: number): number => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

// The grey of a relative luminance (sRGB).
export function grayOf(l: number): Rgb {
  const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255)
  return [c, c, c]
}

// WCAG 2 contrast ratio.
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

export const hex = (c: Rgb): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
export function fromHex(h: string): Rgb {
  const n = Number.parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// OKLab (Björn Ottosson), so lightness changes keep the hue the eye sees.
function toOklab(c: Rgb): [number, number, number] {
  const [r = 0, g = 0, b = 0] = c.map(channel)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
// How far apart two colours look, and how far from grey one is (OKLab chroma): what tells a brand colour from ink.
export function distanceOk(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toOklab(a)
  const [l2, a2, b2] = toOklab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}
export const chromaOk = (c: Rgb): number => Math.hypot(toOklab(c)[1], toOklab(c)[2])
export const lightnessOk = (c: Rgb): number => toOklab(c)[0]

function fromOklab([L, a, b]: readonly [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const encode = (v: number): number => {
    const x = Math.min(1, Math.max(0, v))
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
  }
  const [r = 0, g = 0, bl = 0] = linear.map(encode)
  return [Math.round(r), Math.round(g), Math.round(bl)]
}

// The same hue moved in lightness only as far as needed to reach `target` contrast against `bg` (a brand colour
// kept as close to itself as the page allows); null when no lightness gets there.
export function readableOn(c: Rgb, bg: Rgb, target: number): Rgb | null {
  if (contrast(c, bg) >= target) return c
  const [L, a, b] = toOklab(c)
  const darker = luminance(bg) > 0.18
  let lo = darker ? 0 : L
  let hi = darker ? L : 1
  let best: Rgb | null = null
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const candidate = fromOklab([mid, a, b])
    const ok = contrast(candidate, bg) >= target
    if (ok) best = candidate
    // Darkening: keep the lightest that passes; lightening: keep the darkest that passes.
    if (ok === darker) lo = mid
    else hi = mid
  }
  return best && contrast(best, bg) >= target ? best : null
}
