import type { Browser, Page } from 'playwright'
import type { PrintedFace } from '@make-it-accessible/pipeline/pdf/printedfaces'
import { degraded } from '@make-it-accessible/pipeline/degraded'

// The printed faces that draw capitals for lowercase (Howies' Lulo Clean: its words show in capitals in both views,
// html/source.ts), measured on the letters the printed subset has in a browser.

// One canvas measurement's deadline; past it the tab is abandoned (its evaluate would block every later call).
const TIMEOUT_MS = 20_000
// A face whose flat lowercase letters reach this share of its cap height draws capitals for them.
const CAPS_ONLY = 0.95
// Lowercase letters whose top is the x-height (no ascender), and the capitals sampled.
const FLAT = 'aceorsxzvwunm'
const CAPS = 'HEITLNABCDFGJKMOPQRSUVWXYZ'

export type Measured = { xh: number | null; ch: number | null }
// Per face key, whether it draws capitals for lowercase.
export type Cache = Map<string, boolean>
const TIMED_OUT = Symbol('timed out')

// The faces of a page drawing capitals for lowercase, measured once per document (`cache`, by face key) in a tab of
// `browser`, renewed when a measurement times out.
export async function capsFacesOf(
  browser: Browser,
  printed: ReadonlyMap<string, PrintedFace>,
  cache: Cache,
): Promise<string[]> {
  const out: string[] = []
  let tab: Page | null = null
  try {
    for (const [key, face] of printed) {
      if (!cache.has(key)) {
        tab ??= await browser.newPage()
        const p = await read(tab, key, face)
        if (p === TIMED_OUT) {
          degraded(`${key}: face measure timed out`)
          await tab.close()
          tab = null
        }
        cache.set(key, p !== TIMED_OUT && p !== null && drawsCapitals(p))
      }
      if (cache.get(key)) out.push(key)
    }
  } finally {
    await tab?.close()
  }
  return out
}

// Its flat lowercase letters as tall as its capitals; a face with neither height measured draws nothing to tell.
export const drawsCapitals = ({ xh, ch }: Measured): boolean =>
  (!!xh || !!ch) && xh !== null && ch !== null && xh >= ch * CAPS_ONLY

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

// The printed face's x-height and cap height: null when it did not load, TIMED_OUT past the deadline.
async function read(tab: Page, key: string, face: PrintedFace): Promise<Measured | null | typeof TIMED_OUT> {
  const style = face.font.italic ? 'italic' : 'normal'
  const family = `P-${key.replace(/[^a-z0-9]/gi, '')}`
  // Declared for every weight in its style: nothing is synthesised.
  const src = `url(data:font/opentype;base64,${Buffer.from(face.data).toString('base64')}) format("opentype")`
  await tab.addStyleTag({
    content: `@font-face{font-family:"${family}";font-style:${style};font-weight:1 1000;src:${src}}`,
  })
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      resolve(TIMED_OUT)
    }, TIMEOUT_MS)
  })
  try {
    const letters = lettersIn(face.range)
    const args = { family, weight: face.font.weight, style, ...letters, FLAT }
    return await Promise.race([late, tab.evaluate(inBrowser, args)])
  } finally {
    clearTimeout(timer)
  }
}

type Args = { family: string; weight: number; style: string; lower: string; caps: string; FLAT: string }
// x-height and cap height as shares of the size (medians over the letters present, .notdef boxes left out).
async function inBrowser({ family, weight, style, lower, caps, FLAT }: Args): Promise<Measured | null> {
  const px = 100
  const font = `${style} ${String(weight)} ${String(px)}px "${family}"`
  const loaded = await document.fonts.load(font)
  if (!loaded.some((f) => f.status === 'loaded')) return null
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  ctx.font = font
  // A letter the face lacks draws .notdef: the same box as a code point no font has.
  const box = (ch: string): string => {
    const t = ctx.measureText(ch)
    return [t.actualBoundingBoxAscent, t.width, t.actualBoundingBoxRight, t.actualBoundingBoxLeft].join(':')
  }
  const notdef = box('\uE123')
  const present = (s: string): string =>
    Array.from(s)
      .filter((l) => box(l) !== notdef)
      .join('')
  const median = (xs: number[]): number | null =>
    xs.length ? ([...xs].sort((a, b) => a - b)[xs.length >> 1] ?? null) : null
  const asc = (s: string): number | null =>
    median(Array.from(s).map((l) => ctx.measureText(l).actualBoundingBoxAscent / px))
  const xh = asc(
    Array.from(present(lower))
      .filter((l) => FLAT.includes(l))
      .join(''),
  )
  return { xh, ch: asc(present(caps)) }
}
