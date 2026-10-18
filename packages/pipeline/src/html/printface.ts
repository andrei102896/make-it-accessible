import type { HeadingClass } from '../model/brief.ts'
import { classOf } from '../pdf/face.ts'
import type { Grid } from '../pdf/backdrop.ts'
import type { Extraction, RunFont } from '../pdf/types.ts'
import { familyFor, fileFor, type FontFile, type FontManifest } from './webfonts.ts'

// The printed view's face for a placed line: the printed family when vendored, its lookalike, or a vendored family
// of its typeface class. Its files sit beside the page (fonts/), fetched only where the printed view uses them.

// A stand-in per class; a script or a class not told keeps the role's face (the PDF's own faces come later, 2c).
const STAND_IN: Partial<Record<HeadingClass, string>> = {
  geometric: 'jost',
  oldstyle: 'ebgaramond',
  transitional: 'caladea',
  didone: 'bodonimoda',
  slab: 'robotoslab',
  humanist: 'lato',
  neogrotesque: 'arimo',
  condensed: 'robotocondensed',
}
// Hand-lettered and brush faces stood in for in the printed view only, where each stays at its printed size; the
// text view admits a display face on dish names, where a brush script would be hard to read.
const PRINT_ONLY: [RegExp, string][] = [
  [/^(ozhandicraft|brunojb)/, 'kalam'],
  [/^(brushscript|signpainter|deliscript)/, 'yellowtail'],
]
// Families every desktop has, closer than any vendored face (DESIGN.md: Times keeps its class stack).
const SYSTEM: [RegExp, string][] = [[/^times/, "'Times New Roman', Times, serif"]]
const SANS: ReadonlySet<HeadingClass> = new Set(['geometric', 'humanist', 'neogrotesque', 'condensed'])
// The folder beside the page holding the printed view's face files (eval copies them, previews carry them).
export const PRINT_FONTS_DIR = 'fonts'

export type PrintFace = {
  // The value of `--ff`: a quoted family and its generic fallback.
  family: string
  // The weight the face draws (a file draws only its own range: no synthesis in the printed view).
  weight: number
  file: { manifest: FontManifest; file: FontFile } | null
}

export function printFaceOf(font: RunFont, library: readonly FontManifest[]): PrintFace | null {
  const system = SYSTEM.find(([re]) => re.test(font.key))?.[1]
  if (system) return { family: system, weight: font.weight, file: null }
  const c = classOf(font.key)
  const standIn = c ? STAND_IN[c] : undefined
  const only = PRINT_ONLY.find(([re]) => re.test(font.key))?.[1]
  const manifest = familyFor(font.key, library) ?? library.find((m) => m.key === (only ?? standIn))
  const file = manifest && fileFor(manifest, font.weight, font.italic)
  if (!manifest || !file) return null
  const [lo = 400, hi = lo] = file.weight.split(' ').map(Number)
  const generic = manifest.category === 'display' ? 'cursive' : c && SANS.has(c) ? 'sans-serif' : 'serif'
  return {
    family: `'${nameOf(manifest)}', ${generic}`,
    weight: Math.min(hi, Math.max(lo, font.weight)),
    file: { manifest, file },
  }
}

// A word in a hand we cannot draw: a script face whose maker forbids embedding it (no own face) and that no
// vendored family stands in for (Fig's signature). The backdrop keeps it as printed, ours is read.
export const keptAsPrinted = (font: RunFont, own: boolean, library: readonly FontManifest[]): boolean =>
  !own && classOf(font.key) === 'script' && printFaceOf(font, library) === null

// Its own name, so the text view's embedded face of the same family never resolves to these files (nor they to it).
const nameOf = (m: FontManifest): string => `print-${m.key}`

// One @font-face per file the printed pages' words may take, with its copyright and licence beside it (OFL and
// Apache); a file no placed line uses is never fetched.
export function printFaces(
  pages: readonly { extraction: Extraction; backdrop?: { grid: Pick<Grid, 'fonts'> } | null }[],
  library: readonly FontManifest[],
): string {
  const fonts = pages.flatMap((p) => (p.backdrop ? p.extraction.runs.flatMap((r) => (r.font ? [r.font] : [])) : []))
  const distinct = new Map(fonts.map((f) => [`${f.key}:${String(f.weight)}:${String(f.italic)}`, f]))
  const faces = [...distinct.values()].map((f) => printFaceOf(f, library))
  const files = new Map(faces.flatMap((f) => (f?.file ? [[f.file.file.file, f.file] as const] : [])))
  const own = new Map(pages.flatMap((p) => Object.entries(p.backdrop?.grid.fonts ?? {})))
  // The notice is the font's own text: it must not close the comment or the style element.
  const safe = (t: string): string => t.replace(/\*\/|[<>]/g, '')
  const owned = [...own].map(
    ([id, f]) =>
      `/* ${id}: embedded in the PDF, its maker permits embedding. ${safe(f.notice)} */
@font-face { font-family: "${id}"; font-weight: 1 1000; font-style: normal; font-display: block; src: url(${PRINT_FONTS_DIR}/${id}.otf) format("opentype"); unicode-range: ${f.range}; }`,
  )
  const vendored = [...files.values()].map(({ manifest: m, file: f }) => {
    const licence = m.license === 'OFL' ? 'SIL Open Font License 1.1' : 'Apache License 2.0'
    return `/* ${m.family}: ${m.copyright.replace(/\*\//g, '')} ${licence}. */
@font-face { font-family: "${nameOf(m)}"; font-style: ${f.style}; font-weight: ${f.weight}; font-display: block; src: url(${PRINT_FONTS_DIR}/${f.file}) format("woff2"); unicode-range: ${f.unicodeRange}; }`
  })
  return [...vendored, ...owned].join('\n')
}

// The PDF's own face a placement's `--ff` names first, if any.
export const ownFaceIn = (ff: string): string | null => /^'(pdf-[0-9a-f]+)'/.exec(ff.trim())?.[1] ?? null
// A placement's style without its own face: its stand-in stays, or no family at all (the role's face).
export const withoutOwnFace = (style: string): string =>
  style.replace(/--ff:'pdf-[0-9a-f]+', /, '--ff:').replace(/;?--ff:'pdf-[0-9a-f]+'(?=[;"]|$)/, '')

// Whether a face's unicode-range ("U+41-5A, U+61") holds every letter of the shown text (spaces aside).
export function covers(range: string, text: string): boolean {
  const spans = range.split(',').flatMap((r) => {
    const [lo, hi = lo] = r
      .trim()
      .replace(/^U\+/i, '')
      .split('-')
      .map((h) => parseInt(h, 16))
    return lo === undefined || Number.isNaN(lo) || hi === undefined ? [] : [[lo, hi] as const]
  })
  return Array.from(text.replace(/\s/g, '')).every((ch) => {
    const c = ch.codePointAt(0) ?? 0
    return spans.some(([lo, hi]) => c >= lo && c <= hi)
  })
}
