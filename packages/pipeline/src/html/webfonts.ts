import { z } from 'zod'

// An open-licensed family vendored unmodified from Google Fonts (subsetting would break a Reserved Font Name).
export const FontManifestSchema = z
  .object({
    family: z.string().min(1),
    key: z.string().regex(/^[a-z0-9]+$/),
    license: z.enum(['OFL', 'APACHE2']),
    copyright: z.string(),
    category: z.enum(['text', 'display']),
    // The face's x-height as a share of its size, measured when the family is vendored (fonts-add).
    xHeight: z.number().positive().max(1).optional(),
    files: z
      .array(
        z
          .object({
            file: z.string().regex(/^[\w.-]+\.woff2$/),
            style: z.enum(['normal', 'italic']),
            weight: z.string().regex(/^\d{3}( \d{3})?$/),
            unicodeRange: z.string().regex(/^[\dA-Fa-fU+,\s-]+$/),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
export type FontManifest = z.infer<typeof FontManifestSchema>
export type FontFile = FontManifest['files'][number]
// A face chosen for the page, with its bytes read by the caller (the html modules do no IO).
export type EmbeddedFace = { manifest: FontManifest; file: FontFile; data: Uint8Array }

// Commercial families printed in many documents, mapped only where the free face is a recognised stand-in.
const LOOKALIKES: Record<string, string> = {
  futura: 'jost',
  garamond: 'ebgaramond',
  adobegaramond: 'ebgaramond',
  didot: 'playfairdisplay',
  bodoni: 'playfairdisplay',
}
// What may follow a family name and still be that family: weights, styles and foundry suffixes, not "slab" or "mono".
const STYLE_REST =
  /^(thin|hairline|extralight|ultralight|light|regular|book|normal|medium|semibold|demibold|bold|extrabold|ultrabold|heavy|black|italic|oblique|it|mt|std|pro|lt|pt|bt|ot)*$/
const named = (key: string, name: string): boolean => key.startsWith(name) && STYLE_REST.test(key.slice(name.length))

// The vendored family for a PDF font key: its own, or a recognised stand-in for a commercial family.
export function familyFor(key: string, library: readonly FontManifest[]): FontManifest | undefined {
  const own = library.find((m) => named(key, m.key))
  if (own) return own
  const alike = Object.entries(LOOKALIKES).find(([name]) => named(key, name))?.[1]
  return alike ? library.find((m) => m.key === alike) : undefined
}

// The file of a family that draws a weight and style: a variable range containing it, else the nearest static one.
export function fileFor(m: FontManifest, weight: number, italic: boolean): FontFile | undefined {
  const styled = m.files.filter((f) => f.style === (italic ? 'italic' : 'normal'))
  const files = styled.length ? styled : m.files
  const range = (f: FontFile): [number, number] => {
    const [lo = 400, hi = lo] = f.weight.split(' ').map(Number)
    return [lo, hi]
  }
  const distance = (f: FontFile): number => {
    const [lo, hi] = range(f)
    return weight < lo ? lo - weight : weight > hi ? weight - hi : 0
  }
  return [...files].sort((a, b) => distance(a) - distance(b))[0]
}

const base64 = (data: Uint8Array): string => Buffer.from(data).toString('base64')

// One @font-face per embedded file, each with its copyright and licence beside it (OFL condition).
export function fontFaces(faces: readonly EmbeddedFace[]): string {
  return faces
    .map(({ manifest: m, file: f, data }) => {
      const licence = m.license === 'OFL' ? 'SIL Open Font License 1.1' : 'Apache License 2.0'
      const note = `/* ${m.family}: ${m.copyright.replace(/\*\//g, '')} ${licence}. */`
      return `${note}\n@font-face { font-family: "${m.family}"; font-style: ${f.style}; font-weight: ${f.weight}; font-display: swap; src: url(data:font/woff2;base64,${base64(data)}) format("woff2"); unicode-range: ${f.unicodeRange}; }`
    })
    .join('\n')
}

// The files to embed, most-used first, within a count and a byte budget; the rest fall back to their class stack.
export function withinBudget<T extends { bytes: number; words: number }>(
  wanted: readonly T[],
  maxFiles: number,
  maxBytes: number,
): T[] {
  const out: T[] = []
  let bytes = 0
  for (const w of [...wanted].sort((a, b) => b.words - a.words)) {
    if (out.length >= maxFiles || bytes + w.bytes > maxBytes) continue
    out.push(w)
    bytes += w.bytes
  }
  return out
}
