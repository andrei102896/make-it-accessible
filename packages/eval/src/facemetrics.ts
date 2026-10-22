import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import type { FaceMetrics } from '@make-it-accessible/pipeline/pdf/backdrop'
import type { PrintedFace } from '@make-it-accessible/pipeline/pdf/printedfaces'
import { printFaceOf } from '@make-it-accessible/pipeline/html/printface'
import type { FontFile, FontManifest } from '@make-it-accessible/pipeline/html/webfonts'
import { FONTS_DIR } from './paths.ts'
import { degraded } from '@make-it-accessible/pipeline/degraded'

// Each printed face measured in a browser beside its lookalike, on the letters the printed subset has: the size
// scales to the printed x-height and cap height (placed.ts blends them per line) and the weight with the printed stem.

// Measured on the set (2026-10-18): same-family pairs 1.00; Brandon → Montserrat 0.76 (x-height), Beton → Roboto
// Slab 0.74, Bimbo → Caveat 1.19. Outside this a reading is a mis-measure (no flat lowercase in the subset): no scale.
const SCALE_MIN = 0.7
const SCALE_MAX = 1.25
// Candidate weights of a variable file; a static family offers each of its files.
const WEIGHT_STEP = 50
// One canvas measurement's deadline; past it the tab is abandoned (its evaluate would block every later call).
const TIMEOUT_MS = 20_000
// A face whose flat lowercase letters reach this share of its cap height draws capitals for them.
const CAPS_ONLY = 0.95
// Lowercase letters whose top is the x-height (no ascender), letters with a stem, and the capitals sampled.
const FLAT = 'aceorsxzvwunm'
const STEMMED = 'lIiHTLhnmdbpqku'
const CAPS = 'HEITLNABCDFGJKMOPQRSUVWXYZ'

type Measured = { xh: number | null; ch: number | null; stem: number | null; lower: string; caps: string }
type Face = { metrics: FaceMetrics | null; caps: boolean }
export type Cache = Map<string, Face>
const NONE: Face = { metrics: null, caps: false }
const TIMED_OUT = Symbol('timed out')

// The metrics of a page's printed faces set in a lookalike, and the faces drawing capitals for lowercase, measured
// once per document (`cache`, by face key) in a tab of `browser`, renewed when a measurement times out.
export async function faceMetrics(
  browser: Browser,
  printed: ReadonlyMap<string, PrintedFace>,
  library: readonly FontManifest[],
  cache: Cache,
): Promise<{ metrics: Record<string, FaceMetrics>; capsFaces: string[] }> {
  const metrics: Record<string, FaceMetrics> = {}
  const capsFaces: string[] = []
  let tab: Page | null = null
  try {
    for (const [key, face] of printed) {
      if (!cache.has(key)) {
        tab ??= await browser.newPage()
        const measured = await measure(tab, key, face, library)
        if (measured === TIMED_OUT) {
          degraded(`${key}: face metrics timed out`)
          await tab.close()
          tab = null
        }
        const f = measured === TIMED_OUT ? NONE : measured
        if (!f.metrics && printFaceOf(face.font, library)?.file) console.info(`${key}: no metrics measured`)
        cache.set(key, f)
      }
      const f = cache.get(key)
      if (f?.metrics) metrics[key] = f.metrics
      if (f?.caps) capsFaces.push(key)
    }
  } finally {
    await tab?.close()
  }
  return { metrics, capsFaces }
}

async function measure(
  tab: Page,
  key: string,
  face: PrintedFace,
  library: readonly FontManifest[],
): Promise<Face | typeof TIMED_OUT> {
  const look = printFaceOf(face.font, library)
  const style = look?.file?.file.style ?? (face.font.italic ? 'italic' : 'normal')
  const family = `P-${key.replace(/[^a-z0-9]/gi, '')}`
  // Declared for every weight in the lookalike's style: nothing is synthesised on either side.
  await load(tab, family, face.data, 'opentype', style, '1 1000')
  const p = await read(tab, family, face.font.weight, style, lettersIn(face.range))
  if (p === TIMED_OUT) return p
  if (!p || (!p.xh && !p.ch)) return NONE
  const caps = p.xh !== null && p.ch !== null && p.xh >= p.ch * CAPS_ONLY
  if (!look?.file) return { ...NONE, caps }
  const { manifest } = look.file
  const letters = { lower: p.lower, caps: p.caps }
  let scales: { lower: number | null; caps: number | null } | null = null
  let best: { weight: number; stem: number | null } = { weight: look.weight, stem: null }
  // Every file of the style: a static family's weights are files of their own (Lato 300/400/700/900).
  for (const file of manifest.files.filter((f) => f.style === style)) {
    const lookFamily = `L-${manifest.key}-${file.file}`
    await load(tab, lookFamily, await readFile(join(FONTS_DIR, manifest.key, file.file)), 'woff2', style, file.weight)
    for (const w of weightsOf(file)) {
      const x = await read(tab, lookFamily, w, style, letters)
      if (x === TIMED_OUT) return x
      if (!x) continue
      if (w === look.weight) scales = scalesOf(p, x)
      if (x.stem !== null && p.stem !== null && nearer(x.stem, best.stem, p.stem)) best = { weight: w, stem: x.stem }
    }
  }
  return scales ? { metrics: { ...scales, weight: best.weight }, caps } : { ...NONE, caps }
}

const nearer = (a: number, b: number | null, target: number): boolean =>
  b === null || Math.abs(a - target) < Math.abs(b - target)

// The x-height and cap-height ratios, printed over lookalike, each within the measured range (else null); a face
// with neither known has no scale.
export function scalesOf(
  p: Pick<Measured, 'xh' | 'ch'>,
  l: Pick<Measured, 'xh' | 'ch'>,
): { lower: number | null; caps: number | null } | null {
  const ratio = (a: number | null, b: number | null): number | null =>
    a && b && a / b >= SCALE_MIN && a / b <= SCALE_MAX ? Math.round((a / b) * 1000) / 1000 : null
  const lower = ratio(p.xh, l.xh)
  const caps = ratio(p.ch, l.ch)
  return lower === null && caps === null ? null : { lower, caps }
}

// A variable file's weights in steps, a static file's one weight.
export function weightsOf(file: Pick<FontFile, 'weight'>): number[] {
  const [lo = 400, hi = lo] = file.weight.split(' ').map(Number)
  return lo === hi
    ? [lo]
    : Array.from({ length: Math.floor((hi - lo) / WEIGHT_STEP) + 1 }, (_, i) => lo + i * WEIGHT_STEP)
}

// The sample letters a face's unicode-range holds.
export function lettersIn(range: string): { lower: string; caps: string } {
  const codes = new Set<number>()
  for (const r of range.split(',')) {
    const [a, b = a] = r
      .trim()
      .replace(/^U\+/i, '')
      .split('-')
      .map((h) => parseInt(h, 16))
    if (a !== undefined && b !== undefined && !Number.isNaN(a)) for (let c = a; c <= b; c++) codes.add(c)
  }
  const has = (letters: string): string =>
    Array.from(letters)
      .filter((l) => codes.has(l.codePointAt(0) ?? 0))
      .join('')
  return { lower: has('abcdefghijklmnopqrstuvwxyz'), caps: has(CAPS) }
}

async function load(tab: Page, family: string, data: Uint8Array, format: string, style: string, weight: string) {
  const src = `url(data:font/${format};base64,${Buffer.from(data).toString('base64')}) format("${format}")`
  await tab.addStyleTag({
    content: `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};src:${src}}`,
  })
}

// One face at one weight: null when it did not load, TIMED_OUT past the deadline (the evaluate keeps running).
async function read(
  tab: Page,
  family: string,
  weight: number,
  style: string,
  letters: { lower: string; caps: string },
): Promise<Measured | null | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      resolve(TIMED_OUT)
    }, TIMEOUT_MS)
  })
  try {
    return await Promise.race([late, tab.evaluate(inBrowser, { family, weight, style, ...letters, FLAT, STEMMED })])
  } finally {
    clearTimeout(timer)
  }
}

type Args = {
  family: string
  weight: number
  style: string
  lower: string
  caps: string
  FLAT: string
  STEMMED: string
}
// x-height and cap height as shares of the size (medians over the letters present, .notdef boxes left out), and
// the stem: the longest ink run across the middle of the band, as a share of the band.
async function inBrowser({ family, weight, style, lower, caps, FLAT, STEMMED }: Args): Promise<Measured | null> {
  const px = 100
  const font = `${style} ${String(weight)} ${String(px)}px "${family}"`
  const loaded = await document.fonts.load(font)
  if (!loaded.some((f) => f.status === 'loaded')) return null
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 200
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.font = font
  // A letter the face lacks draws .notdef: the same box as a code point no font has.
  const box = (ch: string): string => {
    const t = ctx.measureText(ch)
    return [t.actualBoundingBoxAscent, t.width, t.actualBoundingBoxRight, t.actualBoundingBoxLeft].join(':')
  }
  const notdef = box('')
  const present = (s: string): string =>
    Array.from(s)
      .filter((l) => box(l) !== notdef)
      .join('')
  lower = present(lower)
  caps = present(caps)
  const median = (xs: number[]): number | null =>
    xs.length ? ([...xs].sort((a, b) => a - b)[xs.length >> 1] ?? null) : null
  const asc = (s: string): number | null =>
    median(Array.from(s).map((l) => ctx.measureText(l).actualBoundingBoxAscent / px))
  const xh = asc(
    Array.from(lower)
      .filter((l) => FLAT.includes(l))
      .join(''),
  )
  const ch = asc(caps)
  const band = xh ?? ch
  const stems = Array.from(lower + caps)
    .filter((l) => STEMMED.includes(l) && band)
    .map((l) => {
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#000'
      ctx.fillText(l, 20, 150)
      const row = Math.round(150 - (band ?? 0) * px * 0.5)
      const d = ctx.getImageData(0, row, c.width, 1).data
      let run = 0
      let longest = 0
      for (let i = 3; i < d.length; i += 4) {
        run = (d[i] ?? 0) > 127 ? run + 1 : 0
        longest = Math.max(longest, run)
      }
      return longest / ((band ?? 1) * px)
    })
  return { xh, ch, stem: median(stems), lower, caps }
}
