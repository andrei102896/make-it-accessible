import type { HeadingClass } from '../model/brief.ts'
import type { Box, Run, RunFont } from './types.ts'

// Common families by typeface class; a font name is a stronger signal than a look at a small render.
const FAMILIES: [HeadingClass, RegExp][] = [
  ['condensed', /condensed|narrow|compressed|\bdin|bebas|oswald|leaguegothic|impact|bahnschrift|binner/],
  ['script', /script|signature|brush|hand|pacifico|lobster|dancing|greatvibes|edwardian|zapfino|comic|marker|haystack/],
  ['slab', /slab|rockwell|clarendon|archer|arvo|courier|museoslab|serifa|memphis|glypha/],
  ['didone', /bodoni|didot|playfair|walbaum/],
  ['oldstyle', /garamond|caslon|palatino|bembo|minion|goudy(?!sans)|jenson|sabon|bookantiqua|plantin|iowan/],
  ['transitional', /times|georgia|baskerville|cambria|charter|merriweather|perpetua|bookman|century(?!gothic)/],
  [
    'geometric',
    /futura|avenir|gotham|montserrat|centurygothic|proximanova|poppins|brandon|nunito|raleway|kabel|eurostile/,
  ],
  [
    'humanist',
    /gillsans|myriad|frutiger|optima|lucida|segoe|calibri|opensans|sourcesans|firasans|verdana|trebuchet|tahoma|corbel|candara|goudysans|rooneysans|adellesans/,
  ],
  [
    'neogrotesque',
    /helvetica|arial|univers|roboto|^inter|sfpro|akzidenz|nimbus.?sans|liberationsans|neuehaas|franklingothic/,
  ],
]

export function classOf(fontName: string): HeadingClass | null {
  const family = fontName
    .replace(/^[A-Z]{6}\+/, '')
    .toLowerCase()
    .replace(/[-_\s]/g, '')
  return FAMILIES.find(([, re]) => re.test(family))?.[0] ?? null
}

// Weight words in a font name's style part, longest first so "semibold" is not read as "bold"; short forms only as
// the whole style ("HelveticaNeueLTStd-Bd").
const WEIGHT_WORDS: [string, number][] = [
  ['extralight', 200],
  ['ultralight', 200],
  ['hairline', 100],
  ['semibold', 600],
  ['demibold', 600],
  ['extrabold', 800],
  ['ultrabold', 800],
  ['thin', 100],
  ['light', 300],
  ['regular', 400],
  ['book', 400],
  ['normal', 400],
  ['medium', 500],
  ['heavy', 800],
  ['black', 900],
  ['demi', 600],
  ['bold', 700],
]
const WEIGHT_SHORT: Record<string, number> = { lt: 300, bk: 400, md: 500, dm: 600, bd: 700, hv: 800, blk: 900 }
// A style made of short forms only ("CnBk", "DmCd", "BdIt"): width (Cn, Cd: condensed), weight and italic.
const SHORT_STYLE = /^(cn|cd|lt|bk|md|dm|bd|hv|blk|it)+$/

// Width words kept in the family key, so classOf sees "narrow" and a vendored family is not matched by its base.
const WIDTH = /narrow|condensed|cond|compressed|extended|expanded/

// The face a pdftohtml family names ("PXAAAC+JosefinSans-SemiBold", "Arial,BoldItalic", "OswaldLight"); pdftohtml
// drops "-Bold"/"-Italic" from some names and marks them with <b>/<i>, so a weight word in the name wins.
export function printedFace(
  family: string,
  bold: boolean,
  italic: boolean,
): { key: string; weight: number; italic: boolean } {
  const name = family.replace(/^[A-Z]{6}\+/, '')
  const [first = name, ...rest] = name.split(/[-,\s]+/)
  const glued = WEIGHT_WORDS.find(([word]) => first.toLowerCase().endsWith(word) && first.length > word.length)?.[0]
  const base = glued ? first.slice(0, first.length - glued.length) : first
  const style = [glued ?? '', ...rest].join('-').toLowerCase()
  const bare = style.replace(/^-/, '')
  const short = SHORT_STYLE.test(bare) ? (bare.match(/cn|cd|lt|bk|md|dm|bd|hv|blk|it/g) ?? []) : []
  const named =
    WEIGHT_WORDS.find(([word]) => style.includes(word))?.[1] ??
    short.map((t) => WEIGHT_SHORT[t]).find((w) => w !== undefined)
  const width =
    WIDTH.exec(style)?.[0].replace(/^cond$/, 'condensed') ??
    (short.some((t) => t === 'cn' || t === 'cd') ? 'condensed' : '')
  return {
    key: `${base}${width}`.toLowerCase().replace(/[^a-z0-9]/g, ''),
    weight: named ?? (bold ? 700 : 400),
    italic: italic || /italic|oblique|it$/.test(style),
  }
}

// The pdftohtml text line a word belongs to: the smallest containing its centre, as lines overlap.
export function lineAt<T extends { box: Box }>(lines: readonly T[], word: Box): T | undefined {
  const cx = word.x + word.w / 2
  const cy = word.y + word.h / 2
  return lines
    .filter((c) => cx >= c.box.x && cx <= c.box.x + c.box.w && cy >= c.box.y && cy <= c.box.y + c.box.h)
    .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0]
}

// One printed face: family key, weight and style, as spots.ts and the backdrop's metrics name it.
export const faceKey = (f: RunFont): string => `${f.key}:${String(f.weight)}:${String(f.italic)}`

// The page's body size: the printed size half its letters are at or under (pt); 0 with no sized run.
export function bodySize(runs: readonly Pick<Run, 'str' | 'font'>[]): number {
  const sized = runs.flatMap((r) => (r.font ? [[r.font.size, r.str.length] as const] : []))
  const half = sized.reduce((n, [, w]) => n + w, 0) / 2
  let seen = 0
  return [...sized].sort((a, b) => a[0] - b[0]).find(([, w]) => (seen += w) >= half)?.[0] ?? 0
}

// `segments`: a line printed in more than one style, its text cut where the style changes (pdftohtml's tags).
export type Segment = { text: string; font: RunFont }
export type Line = { box: Box; color?: string; font?: RunFont; segments?: Segment[] }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decoded = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e.startsWith('#')
      ? ((n: number) => (n <= 0x10ffff ? String.fromCodePoint(n) : m))(
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : (ENTITIES[e] ?? m),
  )

// The face most of these pieces' letters are printed in (the first on a tie: a Map keeps order, sort is stable).
function mostLetters(pieces: readonly Segment[]): RunFont | undefined {
  const tally = new Map<string, { font: RunFont; n: number }>()
  for (const { text, font } of pieces) {
    const seen = tally.get(faceKey(font)) ?? { font, n: 0 }
    seen.n += Array.from(text.replace(/\s+/g, '')).length
    tally.set(faceKey(font), seen)
  }
  return [...tally.values()].sort((a, b) => b.n - a.n)[0]?.font
}

// A line's text in pieces of one style: pdftohtml nests its tags (`<i><b>…</b></i>`) and leaves regular text untagged.
function styledPieces(content: string): { text: string; bold: boolean; italic: boolean }[] {
  const out: { text: string; bold: boolean; italic: boolean }[] = []
  let bold = 0
  let italic = 0
  for (const tok of content.split(/(<[^>]*>)/)) {
    const tag = /^<(\/?)([bi])>$/.exec(tok)
    if (tag) {
      const step = tag[1] ? -1 : 1
      if (tag[2] === 'b') bold = Math.max(0, bold + step)
      else italic = Math.max(0, italic + step)
    } else if (!tok.startsWith('<') && tok) {
      const text = decoded(tok)
      const last = out.at(-1)
      if (last && last.bold === bold > 0 && last.italic === italic > 0) last.text += text
      else out.push({ text, bold: bold > 0, italic: italic > 0 })
    }
  }
  return out
}

// pdftohtml -xml text lines with their fontspec's colour and the face most of their letters take (a <b> round a space
// alone counts for nothing: Le Dive's "16 / 64<b> </b>"); a line in more than one style keeps each piece's face.
export function textLines(xml: string): Line[] {
  const specs = new Map(
    [...xml.matchAll(/<fontspec id="(\d+)" size="(-?[\d.]+)" family="([^"]*)" color="(#[0-9a-fA-F]{6})"/g)].map(
      ([, id, size, family, color]) => [id, { size: Number(size), family: family ?? '', color: color?.toLowerCase() }],
    ),
  )
  return [
    ...xml.matchAll(/<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)<\/text>/g),
  ].map(([, top, left, w, h, id, content = '']): Line => {
    const spec = specs.get(id ?? '')
    const box = { x: Number(left), y: Number(top), w: Number(w), h: Number(h) }
    const color = spec?.color ? { color: spec.color } : {}
    if (!spec || spec.size <= 0) return { box, ...color }
    const pieces = styledPieces(content).filter((p) => /\S/.test(p.text))
    const faceOf = (bold: boolean, italic: boolean): RunFont => ({
      ...printedFace(spec.family, bold, italic),
      size: spec.size,
    })
    const segments = pieces.map((p) => ({ text: p.text, font: faceOf(p.bold, p.italic) }))
    const font = mostLetters(segments) ?? faceOf(false, false)
    const mixed = new Set(segments.map((s) => faceKey(s.font))).size > 1
    return { box, ...color, font, ...(mixed ? { segments } : {}) }
  })
}

// Each word's face on a line printed in more than one style, the words in reading order: the face of the piece
// holding most of its letters (the first on a tie). Null when their letters are not the line's, each keeping the line's.
export function segmentFonts(
  { font: lineFont, segments }: { font: RunFont; segments: readonly Segment[] },
  words: readonly Pick<Run, 'str'>[],
): RunFont[] | null {
  const owners = segments.flatMap((s) => Array.from(s.text.replace(/\s+/g, '')).map((ch) => ({ ch, font: s.font })))
  const letters = words.flatMap((w) => Array.from(w.str.replace(/\s+/g, '')))
  if (letters.length !== owners.length || letters.some((ch, i) => owners[i]?.ch !== ch)) return null
  let at = 0
  return words.map((w) => {
    const own = owners.slice(at, (at += Array.from(w.str.replace(/\s+/g, '')).length))
    return mostLetters(own.map(({ ch, font }) => ({ text: ch, font }))) ?? lineFont
  })
}
