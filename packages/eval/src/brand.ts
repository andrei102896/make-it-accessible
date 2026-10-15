import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { brandPlan, type Brand, type HeadingRule } from '@make-it-accessible/pipeline/html/brand'
import { fromHex } from '@make-it-accessible/pipeline/html/color'
import type { HtmlPage } from '@make-it-accessible/pipeline/html/document'
import { profileOf, type Profile } from '@make-it-accessible/pipeline/html/profile'
import { divided, lineBetween, ruleBelow, signatureRules, type Found } from '@make-it-accessible/pipeline/html/rules'
import {
  fileFor,
  FontManifestSchema,
  withinBudget,
  type EmbeddedFace,
  type FontManifest,
} from '@make-it-accessible/pipeline/html/webfonts'
import { renderPixels } from '@make-it-accessible/pipeline/pdf/poppler'
import { z } from 'zod'
import { FONTS_DIR } from './paths.ts'

// Per document: the font files embedded in the page; beyond, a role keeps the closest class stack.
const MAX_FILES = 4
const MAX_FONT_BYTES = 150_000
// Enough pixels to see a 0.5 pt rule.
const LINES_DPI = 100
// Dishes are stacked in one column when the next starts below and within this share of the page width.
const SAME_COLUMN = 0.1

const LinesSchema = z
  .object({
    rules: z.array(
      z.object({ width: z.number(), full: z.boolean(), centered: z.boolean(), color: z.string() }).strict().nullable(),
    ),
    dividers: z.boolean().nullable(),
  })
  .strict()
type Lines = { rules: (HeadingRule | null)[]; dividers: boolean | null }

export async function fontLibrary(): Promise<FontManifest[]> {
  const dirs = await readdir(FONTS_DIR).catch(() => [])
  const out: FontManifest[] = []
  for (const d of dirs) {
    const raw = await readFile(join(FONTS_DIR, d, 'manifest.json'), 'utf8').catch(() => null)
    if (raw !== null) out.push(FontManifestSchema.parse(JSON.parse(raw)))
  }
  return out
}

// The lines the document draws, read once from a render of each page and kept with the run (lines.json), so a
// rescore needs neither the PDF nor Poppler.
async function documentLines(
  pdfPath: string,
  docDir: string,
  pages: readonly HtmlPage[],
  profile: Profile,
  background: string,
): Promise<Lines> {
  const file = join(docDir, 'lines.json')
  const saved = await readFile(file, 'utf8').catch(() => null)
  if (saved !== null) return LinesSchema.parse(JSON.parse(saved))
  const bg = fromHex(background)
  const k = LINES_DPI / 72
  const found: Found[] = []
  let gaps = 0
  let lines = 0
  for (const [index, page] of pages.entries()) {
    const heads = profile.headingBoxes.filter((h) => h.page === index)
    const lists = profile.itemBoxes.filter((l) => l.page === index)
    if (!heads.length && !lists.length) continue
    const e = page.extraction
    const img = await renderPixels(pdfPath, e.pdfPage, LINES_DPI)
    for (const h of heads)
      found.push({
        sig: h.sig,
        rule: ruleBelow(img, k, h.box, e.width, bg),
        center: (h.box.x + h.box.w / 2) / e.width,
        width: h.box.w / e.width,
      })
    for (const { boxes } of lists)
      boxes.forEach((upper, i) => {
        const lower = boxes[i + 1]
        if (!lower || lower.y <= upper.y + upper.h || Math.abs(lower.x - upper.x) > e.width * SAME_COLUMN) return
        gaps++
        if (lineBetween(img, k, upper, lower, bg)) lines++
      })
  }
  const out = { rules: signatureRules(found, profile.signatures.length), dividers: divided(gaps, lines) }
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
  const wanted = new Map<string, { manifest: FontManifest; file: EmbeddedFace['file']; words: number; bytes: number }>()
  for (const part of [...plan.roles.values(), ...plan.headings]) {
    const manifest = part.manifest
    const file = manifest && fileFor(manifest, part.style.face.weight, part.style.face.italic)
    if (!manifest || !file) continue
    const k = `${manifest.key}/${file.file}`
    const seen = wanted.get(k)
    const bytes = seen?.bytes ?? (await stat(join(FONTS_DIR, manifest.key, file.file))).size
    wanted.set(k, { manifest, file, words: (seen?.words ?? 0) + part.style.words, bytes })
  }
  const faces: EmbeddedFace[] = []
  for (const w of withinBudget([...wanted.values()], MAX_FILES, MAX_FONT_BYTES))
    faces.push({
      manifest: w.manifest,
      file: w.file,
      data: new Uint8Array(await readFile(join(FONTS_DIR, w.manifest.key, w.file.file))),
    })
  const lines = await documentLines(pdfPath, docDir, pages, profile, background)
  return { profile, library, faces, background, alternate, ...lines }
}
