import { z } from 'zod'
import type { RoleStyle } from './profile.ts'

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
            weight: z.string().regex(/^\d{3,4}( \d{3,4})?$/),
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

// Commercial families printed in the documents measured so far, each mapped to the free face of the same genre
// (docs/wiki); the key's rest after the match must be a weight or style word, as for a vendored name.
const LOOKALIKES: [RegExp, string][] = [
  [/^dincondensed/, 'barlowcondensed'],
  [/^din(pro|ot|next|text)?/, 'barlow'],
  [/^(gotham|baufra|novecentosans(wide)?|articulatcf|semplicita|proximanova|brandon(grotesque|text)?)/, 'montserrat'],
  [/^(futura|neutra(text|face)?(tf)?|centurygothic)/, 'jost'],
  [/^verlag/, 'montserrat'],
  [/^windsor/, 'fraunces'],
  [/^(adobe|a)?garamond(premier|classic(fs)?)?/, 'ebgaramond'],
  [/^minion/, 'crimsonpro'],
  [/^bodoni(egyptian|flf)?/, 'bodonimoda'],
  [/^didot/, 'playfairdisplay'],
  [/^avenir(next)?/, 'nunitosans'],
  [/^myriad/, 'ptsans'],
  [/^(helvetica(neue)?|arial)/, 'arimo'],
  [/^cambria/, 'caladea'],
  [/^calibri/, 'carlito'],
  [/^betont?/, 'robotoslab'],
  [/^gillsans/, 'lato'],
  [/^recoleta/, 'fraunces'],
  [/^inkwell(sans)?/, 'lato'],
  [/^bimbo/, 'caveat'],
  [/^(snellroundhand|edwardianscript|zapfino)/, 'greatvibes'],
]
// What may follow a family name and still be that family: weights, styles and foundry suffixes, not "slab" or "mono".
const STYLE_REST =
  /^(thin|hairline|extralight|ultralight|light|regular|book|normal|medium|semibold|demibold|bold|extrabold|ultrabold|heavy|black|italic|oblique|it|mt|std|pro|lt|pt|bt|ot)*$/
const named = (key: string, name: string): boolean => key.startsWith(name) && STYLE_REST.test(key.slice(name.length))

// The vendored family for a PDF font key: its own, or the stand-in for a commercial family.
export function familyFor(key: string, library: readonly FontManifest[]): FontManifest | undefined {
  const own = library.find((m) => named(key, m.key))
  if (own) return own
  const alike = LOOKALIKES.find(([re]) => {
    const m = re.exec(key)
    return m !== null && STYLE_REST.test(key.slice(m[0].length))
  })?.[1]
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

// The files a part's words draw in, with the letters each draws (profile.ts `letters`): the part's weight, a styled
// word's own, in each word's italic (the brand sets none). A style built without its letters draws its role's face.
export type ShownFile = { manifest: FontManifest; file: FontFile; letters: number }
export function shownFiles(
  parts: readonly { manifest: FontManifest | undefined; style: Pick<RoleStyle, 'face' | 'words' | 'letters'> }[],
): ShownFile[] {
  const out = new Map<string, ShownFile>()
  for (const { manifest, style } of parts) {
    if (!manifest) continue
    const shown = style.letters ?? [{ weight: null, italic: false, letters: style.words }]
    for (const s of shown) {
      const file = fileFor(manifest, s.weight ?? style.face.weight, s.italic)
      if (!file) continue
      const k = `${manifest.key}/${file.file}`
      out.set(k, { manifest, file, letters: (out.get(k)?.letters ?? 0) + s.letters })
    }
  }
  return [...out.values()]
}

// A part set in an embedded display face with no italic file draws its italic words upright: a script's slant is its
// italic, a synthesised one would lean it twice (Lexington's Brush Script).
export function uprightIn(m: FontManifest | undefined, faces: readonly EmbeddedFace[], sel: string): string[] {
  const drawn = m?.category === 'display' && faces.some((f) => f.manifest.key === m.key)
  return drawn && !m.files.some((f) => f.style === 'italic') ? [`${sel} .fi { font-style: normal; }`] : []
}

// The files to embed, most letters first, within a count and a byte budget; a family's other files only once its
// most-used is in: any file of a family turns the family on for every part set in it (brand.ts family).
export function familyBudget<T extends { bytes: number; letters: number; manifest: { key: string } }>(
  shown: readonly T[],
  maxFiles: number,
  maxBytes: number,
): T[] {
  const out: T[] = []
  const seen = new Set<string>()
  let bytes = 0
  for (const s of [...shown].sort((a, b) => b.letters - a.letters)) {
    const first = !seen.has(s.manifest.key)
    seen.add(s.manifest.key)
    const family = out.some((o) => o.manifest.key === s.manifest.key)
    if ((!first && !family) || out.length >= maxFiles || bytes + s.bytes > maxBytes) continue
    out.push(s)
    bytes += s.bytes
  }
  return out
}
