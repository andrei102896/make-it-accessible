import type { HeadingClass } from '../model/brief.ts'
import { MAX_BUFFER, poppler } from './poppler.ts'

// Common families by typeface class; a font name is a stronger signal than a look at a small render.
const FAMILIES: [HeadingClass, RegExp][] = [
  ['condensed', /condensed|narrow|compressed|\bdin|bebas|oswald|leaguegothic|impact|bahnschrift/],
  ['script', /script|brush|hand|pacifico|lobster|dancing|greatvibes|edwardian|zapfino|comic|marker/],
  ['slab', /slab|rockwell|clarendon|archer|arvo|courier|museoslab|serifa|memphis/],
  ['didone', /bodoni|didot|playfair|walbaum/],
  ['oldstyle', /garamond|caslon|palatino|bembo|minion|goudy|jenson|sabon|bookantiqua|plantin|iowan/],
  ['transitional', /times|georgia|baskerville|cambria|charter|merriweather|perpetua|bookman|century(?!gothic)/],
  [
    'geometric',
    /futura|avenir|gotham|montserrat|centurygothic|proximanova|poppins|brandon|nunito|raleway|kabel|eurostile/,
  ],
  [
    'humanist',
    /gillsans|myriad|frutiger|optima|lucida|segoe|calibri|opensans|sourcesans|firasans|verdana|trebuchet|tahoma|corbel|candara/,
  ],
  ['neogrotesque', /helvetica|arial|univers|roboto|inter\b|sfpro|akzidenz|nimbus.?sans|liberationsans|neuehaas/],
]

export function classOf(fontName: string): HeadingClass | null {
  const family = fontName
    .replace(/^[A-Z]{6}\+/, '')
    .toLowerCase()
    .replace(/[-_\s]/g, '')
  return FAMILIES.find(([, re]) => re.test(family))?.[0] ?? null
}

// The class most of the document's fonts belong to (pdffonts lists each font once per encoding and style).
export async function fontClass(pdf: string, pages: number): Promise<HeadingClass | null> {
  const { stdout } = await poppler('pdffonts', ['-l', String(pages), pdf], { maxBuffer: MAX_BUFFER })
  const counts = new Map<HeadingClass, number>()
  for (const line of stdout.split('\n').slice(2)) {
    const c = classOf(line.split(/\s+/)[0] ?? '')
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
