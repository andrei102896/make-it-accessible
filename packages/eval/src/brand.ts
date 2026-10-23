import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { brandPlan, type Brand } from '@make-it-accessible/pipeline/html/brand'
import { fromHex } from '@make-it-accessible/pipeline/html/color'
import type { HtmlPage } from '@make-it-accessible/pipeline/html/document'
import { profileOf, type Face, type Profile } from '@make-it-accessible/pipeline/html/profile'
import { faceKey } from '@make-it-accessible/pipeline/pdf/face'
import {
  groupOrnaments,
  ornamentBelow,
  ornamentMask,
  type Found as Drawn,
} from '@make-it-accessible/pipeline/html/ornament'
import { divided, lineBetween, ruleBelow, signatureRules, type Found } from '@make-it-accessible/pipeline/html/rules'
import {
  fileFor,
  FontManifestSchema,
  withinBudget,
  alongside,
  type EmbeddedFace,
  type FontManifest,
} from '@make-it-accessible/pipeline/html/webfonts'
import { intersection } from '@make-it-accessible/pipeline/pdf/geometry'
import { renderPixels } from '@make-it-accessible/pipeline/pdf/poppler'
import { z } from 'zod'
import { FONTS_DIR } from './paths.ts'

// Per document: the font files embedded in the page; beyond, a role keeps the closest class stack.
const MAX_FILES = 4
const MAX_FONT_BYTES = 150_000
// Enough pixels to see a 0.5 pt rule.
const LINES_DPI = 100
// An ornament's mask: 3 pixels per point stays sharp on a 2x phone screen at the printed size.
const ORNAMENT_DPI = 216
// Bumped when lines.json gains a measurement or its signatures may regroup (4: faces per line piece), so older files
// are measured again.
const LINES_VERSION = 4
// Dishes are stacked in one column when the next starts below and within this share of the page width.
const SAME_COLUMN = 0.1

const LinesSchema = z
  .object({
    rules: z.array(
      z.object({ width: z.number(), full: z.boolean(), centered: z.boolean(), color: z.string() }).strict().nullable(),
    ),
    dividers: z.boolean().nullable(),
    // How many heading signatures the rules were measured for: a different grouping measures again.
    signatures: z.number().int().nonnegative(),
    version: z.literal(LINES_VERSION),
    ornaments: z.array(
      z
        .object({
          mask: z.string().regex(/^[A-Za-z0-9+/]+=*$/),
          em: z.number().positive(),
          aspect: z.number().positive(),
          centered: z.boolean(),
          color: z.string().regex(/^#[0-9a-f]{6}$/),
          headings: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict()
type Lines = z.infer<typeof LinesSchema>

export async function fontLibrary(): Promise<FontManifest[]> {
  const dirs = await readdir(FONTS_DIR).catch(() => [])
  const out: FontManifest[] = []
  for (const d of dirs) {
    const raw = await readFile(join(FONTS_DIR, d, 'manifest.json'), 'utf8').catch(() => null)
    if (raw !== null) out.push(FontManifestSchema.parse(JSON.parse(raw)))
  }
  return out
}

// The lines and ornaments the document draws, read once from a render of each page and kept with the run
// (lines.json); an older file is measured again from the PDF.
async function documentLines(
  pdfPath: string,
  docDir: string,
  pages: readonly HtmlPage[],
  profile: Profile,
  background: string,
): Promise<Lines> {
  const file = join(docDir, 'lines.json')
  const saved = await readFile(file, 'utf8').catch(() => null)
  const kept = saved === null ? null : LinesSchema.safeParse(JSON.parse(saved))
  // Ornaments name their headings by structure path: a path the current structure lacks measures again.
  const current = kept?.success && kept.data.ornaments.every((o) => o.headings.every((h) => profile.headings.has(h)))
  if (current && kept.data.signatures === profile.signatures.length) return kept.data
  const bg = fromHex(background)
  const k = LINES_DPI / 72
  const found: Found[] = []
  const drawn: Drawn[] = []
  let gaps = 0
  let lines = 0
  for (const [index, page] of pages.entries()) {
    const heads = profile.headingBoxes.filter((h) => h.page === index)
    const lists = profile.itemBoxes.filter((l) => l.page === index)
    if (!heads.length && !lists.length) continue
    const e = page.extraction
    const img = await renderPixels(pdfPath, e.pdfPage, LINES_DPI)
    const hidden = new Set(e.hidden)
    const words = e.runs.filter((r) => !hidden.has(r.id) && r.str.trim())
    for (const h of heads) {
      const others = words.filter((r) => intersection(r.box, h.box) < (r.box.w * r.box.h) / 2).map((r) => r.box)
      const ornament = ornamentBelow(img, k, h.box, e.width, others, bg)
      // A heading over an ornament has no plain rule of its own to count.
      if (ornament) drawn.push({ ...ornament, key: h.key, page: index })
      else
        found.push({
          sig: h.sig,
          rule: ruleBelow(img, k, h.box, e.width, bg),
          center: (h.box.x + h.box.w / 2) / e.width,
          width: h.box.w / e.width,
        })
    }
    for (const { boxes } of lists)
      boxes.forEach((upper, i) => {
        const lower = boxes[i + 1]
        if (!lower || lower.y <= upper.y + upper.h || Math.abs(lower.x - upper.x) > e.width * SAME_COLUMN) return
        gaps++
        if (lineBetween(img, k, upper, lower, bg)) lines++
      })
  }
  const ornaments: Lines['ornaments'] = []
  for (const g of groupOrnaments(drawn)) {
    const page = pages[g.page]
    const size = profile.signatures[profile.headings.get(g.key) ?? -1]?.size
    if (!page || !size) continue
    const img = await renderPixels(pdfPath, page.extraction.pdfPage, ORNAMENT_DPI, g.box)
    const mask = Buffer.from(ornamentMask(img, bg, g.color)).toString('base64')
    const { centered, color, headings } = g
    ornaments.push({ mask, em: g.box.w / size, aspect: g.box.w / g.box.h, centered, color, headings })
  }
  const signatures = profile.signatures.length
  const rules = signatureRules(found, signatures)
  const out: Lines = { rules, dividers: divided(gaps, lines), signatures, version: LINES_VERSION, ornaments }
  await writeFile(file, JSON.stringify(out, null, 2))
  return out
}

// The document's measured look, with the vendored files it needs read in; null when its runs carry no fonts
// (runs extracted before fonts were read), so the page keeps the base template.
export async function documentBrand(
  pdfPath: string,
  docDir: string,
  pages: readonly HtmlPage[],
  background: string,
  alternate: string | null,
): Promise<Brand | null> {
  const profile = profileOf(pages)
  if (!profile) return null
  const library = await fontLibrary()
  const plan = brandPlan(profile, library)
  type Wanted = { manifest: FontManifest; file: EmbeddedFace['file']; words: number; bytes: number }
  const want = async (into: Map<string, Wanted>, manifest: FontManifest, face: Face, words: number): Promise<void> => {
    const file = fileFor(manifest, face.weight, face.italic)
    if (!file) return
    const k = `${manifest.key}/${file.file}`
    const seen = into.get(k)
    const bytes = seen?.bytes ?? (await stat(join(FONTS_DIR, manifest.key, file.file))).size
    into.set(k, { manifest, file, words: (seen?.words ?? 0) + words, bytes })
  }
  const wanted = new Map<string, Wanted>()
  const parts = [...plan.roles.values(), ...plan.headings]
  for (const { manifest, style } of parts) if (manifest) await want(wanted, manifest, style.face, style.words)
  const chosen = withinBudget([...wanted.values()], MAX_FILES, MAX_FONT_BYTES)
  // The other weights and styles a part's family prints (words spanned, segments.ts), only in the budget left over.
  const printed = new Map<string, Map<string, { face: Face; words: number }>>()
  for (const r of pages.flatMap((p) => p.extraction.runs)) {
    if (!r.font || !r.styled) continue
    const byFace = printed.get(r.font.key) ?? new Map<string, { face: Face; words: number }>()
    const seen = byFace.get(faceKey(r.font)) ?? { face: r.font, words: 0 }
    seen.words++
    printed.set(r.font.key, byFace.set(faceKey(r.font), seen))
  }
  const others = new Map<string, Wanted>()
  for (const { manifest, style } of parts)
    for (const { face, words } of printed.get(style.face.key)?.values() ?? [])
      if (manifest) await want(others, manifest, face, words)
  const faces: EmbeddedFace[] = []
  for (const w of [...chosen, ...alongside(chosen, [...others.values()], MAX_FILES, MAX_FONT_BYTES)])
    faces.push({
      manifest: w.manifest,
      file: w.file,
      data: new Uint8Array(await readFile(join(FONTS_DIR, w.manifest.key, w.file.file))),
    })
  const lines = await documentLines(pdfPath, docDir, pages, profile, background)
  const { rules, dividers, ornaments } = lines
  return { profile, library, faces, background, alternate, rules, dividers, ornaments }
}
