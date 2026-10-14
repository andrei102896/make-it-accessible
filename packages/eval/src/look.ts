import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { contrast, fromHex, type Rgb } from '@make-it-accessible/pipeline/html/color'
import {
  pagePixels,
  pageTheme,
  sample,
  swatches as swatchesOf,
  themeFrom,
  ThemeSchema,
  type Swatch,
  type Theme,
} from '@make-it-accessible/pipeline/html/theme'
import { briefDocument, BriefSchema, type Brief, type HeadingClass } from '@make-it-accessible/pipeline/model/brief'
import { fontClass } from '@make-it-accessible/pipeline/pdf/fonts'
import type { ModelOptions } from '@make-it-accessible/pipeline/model/client'
import { joinRuns } from '@make-it-accessible/pipeline/pdf/runs'
import { canon } from '@make-it-accessible/pipeline/text/normalize'
import { renderPage } from '@make-it-accessible/pipeline/pdf/raster'
import type { Run } from '@make-it-accessible/pipeline/pdf/types'
import { z } from 'zod'
import { costUsd } from './cost.ts'
import type { PageResult } from './process.ts'

// The brief sees at most this many pages, each rendered this long on its long edge (pixels).
const BRIEF_PAGES = 4
const THUMB_EDGE = 768
const AA = 4.5
const NEUTRAL = 1.6
const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

const SwatchSchema = z.object({
  hex: z.string().regex(/^#[0-9a-f]{6}$/),
  role: z.enum(['background', 'text']),
  share: z.number(),
})
const BriefFile = z.object({ brief: BriefSchema, swatches: z.array(SwatchSchema), usd: z.number() }).strict()
export type Look = {
  title: string | undefined
  theme: Theme | null
  brief: Brief | null
  headings: HeadingClass | null
}

// The document's name is its largest printed line (a folded menu's cover may be its last page).
function largestLine(results: readonly PageResult[]): string | undefined {
  const tallest = results
    .flatMap((r) => r.extraction.runs.map((run) => ({ run, runs: r.extraction.runs })))
    // Rotated text (a photo credit up the margin) is taller than it is wide; it is no title.
    .filter(({ run }) => run.box.w >= run.box.h)
    .reduce<{ run: Run; runs: Run[] } | undefined>((a, b) => (a && a.run.box.h >= b.run.box.h ? a : b), undefined)
  if (!tallest) return undefined
  return joinRuns(tallest.runs.filter((r) => r.line === tallest.run.line)).trim() || undefined
}

// The brief reads the title from the pages, logo included, and can misspell it ("Eldis" for "Elddis"): only the
// words printed in the text layer are kept, and at least two of them, else the title is the largest printed line.
const MIN_TITLE_WORDS = 2
function printedTitle(title: string, results: readonly PageResult[]): string | undefined {
  const letters = (t: string): string => canon(t).replace(/[^\p{L}\p{N}]/gu, '')
  const printed = letters(results.map((r) => joinRuns(r.extraction.runs)).join(' '))
  const parts = title
    .split(' · ')
    .map((part) => part.split(/\s+/).filter((w) => !/\p{L}|\p{N}/u.test(w) || printed.includes(letters(w))))
    .map((words) => words.join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
  const kept = parts.join(' · ')
  return kept.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length >= MIN_TITLE_WORDS ? kept : undefined
}

// Colours from the brief's choice of measured swatches; the band's text is the document's own ink when it reads.
function briefTheme(brief: Brief, swatches: readonly Swatch[]): Theme {
  const pick = (i: number | null): Swatch | undefined => (i === null ? undefined : swatches[i])
  const band = pick(brief.band)
  const bandRgb = band ? fromHex(band.hex) : null
  const ink = swatches.find((s) => s.role === 'text' && bandRgb && contrast(fromHex(s.hex), bandRgb) >= AA)
  const accent = pick(brief.accent)
  // A near-white or near-black pick is the text colour, not the brand: the band's colour stands in.
  const neutral =
    accent && Math.min(contrast(fromHex(accent.hex), WHITE), contrast(fromHex(accent.hex), BLACK)) < NEUTRAL
  return themeFrom(bandRgb, ink ? fromHex(ink.hex) : null, accent && !neutral ? fromHex(accent.hex) : bandRgb)
}

async function runBrief(pdfPath: string, docDir: string, pages: readonly PageResult[], options: ModelOptions) {
  const images: string[] = []
  let ring: Rgb[] = []
  let inside: Rgb[] = []
  for (const r of pages) {
    const k = THUMB_EDGE / Math.max(r.extraction.width, r.extraction.height)
    const size = { width: Math.round(r.extraction.width * k), height: Math.round(r.extraction.height * k) }
    images.push(await renderPage(pdfPath, r.pdfPage, size, join(docDir, `brief-p${String(r.pdfPage)}`)))
    const { img, boxes } = await pagePixels(pdfPath, r.pdfPage, r.extraction.runs)
    const s = sample(img, boxes)
    ring = ring.concat(s.ring)
    inside = inside.concat(s.inside)
  }
  const swatches = swatchesOf({ ring, inside })
  const text = pages.map((r) => joinRuns(r.extraction.runs)).join(' ')
  return { swatches, ...(await briefDocument(images, swatches, text, options)) }
}

// Title, colours and template for a document. The brief is called only with a model (a fresh run) and kept in
// the run dir, so a rescore reuses it; without one, colours come from the most frequent text background.
export async function documentLook(
  pdfPath: string,
  docDir: string,
  results: readonly PageResult[],
  briefModel?: ModelOptions,
): Promise<Look> {
  const file = join(docDir, 'brief.json')
  const saved = await readFile(file, 'utf8').catch(() => null)
  let briefed = saved === null ? null : BriefFile.parse(JSON.parse(saved))
  if (!briefed && briefModel) {
    const pages = [...results].sort((a, b) => a.keyPage - b.keyPage).slice(0, BRIEF_PAGES)
    const { brief, swatches, call } = await runBrief(pdfPath, docDir, pages, briefModel)
    briefed = { brief, swatches, usd: costUsd(briefModel.model, call.usage) }
    await writeFile(file, JSON.stringify(briefed, null, 2))
  }
  // The document's own font names decide the heading class; the brief's look at the pages only when none is known.
  const fonts = await fontClass(pdfPath, Math.max(...results.map((r) => r.pdfPage)))
  if (briefed) {
    const { brief, swatches } = briefed
    const title = printedTitle(brief.title, results) ?? largestLine(results)
    return { title, theme: briefTheme(brief, swatches), brief, headings: fonts ?? brief.headings }
  }
  const theme = await fallbackTheme(pdfPath, docDir, results)
  return { title: largestLine(results), theme, brief: null, headings: fonts }
}

// Sampled once from the page with the most text and kept with the run, so a rescore does not depend on Poppler.
async function fallbackTheme(pdfPath: string, docDir: string, results: readonly PageResult[]): Promise<Theme | null> {
  const file = join(docDir, 'theme.json')
  const saved = await readFile(file, 'utf8').catch(() => null)
  if (saved !== null) return ThemeSchema.nullable().parse(JSON.parse(saved))
  const page = [...results].sort((a, b) => b.extraction.runs.length - a.extraction.runs.length)[0]
  const theme = page ? await pageTheme(pdfPath, page.pdfPage, page.extraction.runs) : null
  await writeFile(file, JSON.stringify(theme))
  return theme
}
