import type { HeadingClass } from '../model/brief.ts'
import type { Box, RunFont } from './types.ts'

// Common families by typeface class; a font name is a stronger signal than a look at a small render.
const FAMILIES: [HeadingClass, RegExp][] = [
  ['condensed', /condensed|narrow|compressed|\bdin|bebas|oswald|leaguegothic|impact|bahnschrift|binner/],
  ['script', /script|signature|brush|hand|pacifico|lobster|dancing|greatvibes|edwardian|zapfino|comic|marker/],
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

export type Line = { box: Box; color?: string; font?: RunFont }

// pdftohtml -xml text lines with the colour and face of their fontspec; bold and italic come from the line's tags.
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
    const face =
      spec && spec.size > 0 ? printedFace(spec.family, content.includes('<b>'), content.includes('<i>')) : null
    return {
      box: { x: Number(left), y: Number(top), w: Number(w), h: Number(h) },
      ...(spec?.color ? { color: spec.color } : {}),
      ...(face && spec ? { font: { ...face, size: spec.size } } : {}),
    }
  })
}
