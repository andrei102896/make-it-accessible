import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_BUFFER, poppler, popplerBytes } from './exec.ts'
import { mergeOverlapping } from './geometry.ts'
import { preflight } from './preflight.ts'
import { Refused } from './refused.ts'
import { parsePpm, type Pixels } from './pixels.ts'
import { findDuplicates } from './runs.ts'
import { lineAt, textLines, type Line } from './face.ts'
import type { Box, Extraction, PageImage, Run } from './types.ts'
import { piecesOf, picturesOf } from './art.ts'
import { iconsOn } from './icons.ts'
import { lettersDrawnBeside } from './drawnletters.ts'
import { parseVectors } from './vectors.ts'
import { hiddenRuns } from './visibility.ts'

export { MAX_BUFFER, poppler, popplerBytes }
export { copyForbidden } from './preflight.ts'
const MIN_IMAGE_AREA = 0.01
const MAX_IMAGE_AREA = 0.9
// Enough to see the ink of a light 6 pt word, cheap enough to render every page once more; a poster-sized page
// is rendered smaller so its pixels stay well under MAX_BUFFER (A0 at 150 dpi is ~104 MB).
const VISIBILITY_DPI = 150
const MAX_VISIBILITY_EDGE = 5000

export async function extractPage(pdf: string, pdfPage: number): Promise<Extraction> {
  // Every run path reads a page here: a PDF we may not read, or past the limits, is refused by name.
  await preflight(pdf)
  const page = String(pdfPage)
  const { stdout } = await poppler('pdftotext', ['-q', '-f', page, '-l', page, '-tsv', pdf, '-'], {
    maxBuffer: MAX_BUFFER,
  })
  let width = 0
  let height = 0
  let line = -1
  const runs: Run[] = []
  for (const row of stdout.split('\n').slice(1)) {
    const cols = row.split('\t')
    if (cols.length < 12) continue
    const [level, , flow, , , , x, y, w, h] = cols.map(Number)
    if (level === 1) {
      width = w ?? 0
      height = h ?? 0
    } else if (level === 4) {
      line++
    } else if (level === 5) {
      runs.push({
        id: `${pdfPage}:${runs.length}`,
        str: cols.slice(11).join('\t'),
        box: { x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 },
        flow: flow ?? 0,
        line,
      })
    }
  }
  if (!width || !height) throw new Error(`pdftotext returned no page size for ${pdf} p${pdfPage}`)
  const duplicates = findDuplicates(runs)
  const { images, lines } = await extractLayout(pdf, pdfPage, width * height)
  // Each word takes the colour and face of the smallest pdftohtml text line its centre falls in (lines overlap).
  for (const r of runs) {
    const line = lineAt(lines, r.box)
    if (line?.color) r.color = line.color
    if (line?.font) r.font = line.font
  }
  // RGB pixels within MAX_BUFFER whatever the page's shape (a square A0 page at the edge cap would exceed it).
  const fits = Math.sqrt(MAX_BUFFER / 3 / (width * height)) * 72
  const dpi = Math.min(VISIBILITY_DPI, (MAX_VISIBILITY_EDGE * 72) / Math.max(width, height), fits)
  const hidden = hiddenRuns(runs, await renderPixels(pdf, pdfPage, dpi), dpi / 72)
  const { boxes, rules, art, placed, glyphs } = parseVectors(await pageSvg(pdf, pdfPage))
  const shown = new Set(hidden)
  const words = runs.filter((r) => !shown.has(r.id) && r.str.trim())
  const pictures = picturesOf(art, placed, words, width, height)
  const icons = iconsOn(piecesOf(art, placed, words, width, height), words)
  const lost = lettersDrawnBeside(art, glyphs, words)
  const read = { pdfPage, width, height, runs, images, duplicates, hidden, vectors: boxes, rules, pictures, icons }
  return lost.length ? { ...read, lost } : read
}

// The page as pdftocairo draws it in SVG (0.1–0.8 s a page): the vector layer and the printed view's backdrop.
// A page's SVG: the largest measured is 18.5 MB (Akash's trifold, 2026-10-19), embedded rasters in base64.
const MAX_SVG_BYTES = 64 * 1024 * 1024

export async function pageSvg(pdf: string, pdfPage: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mia-vectors-'))
  try {
    const page = String(pdfPage)
    const file = join(dir, 'page.svg')
    await poppler('pdftocairo', ['-q', '-svg', '-f', page, '-l', page, pdf, file], { maxBuffer: MAX_BUFFER })
    if ((await stat(file)).size > MAX_SVG_BYTES) throw new Refused(`page ${page} draws more than any menu measured`)
    return await readFile(file, 'utf8')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function extractLayout(
  pdf: string,
  pdfPage: number,
  pageArea: number,
): Promise<{ images: PageImage[]; lines: Line[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'mia-images-'))
  try {
    const page = String(pdfPage)
    await poppler('pdftohtml', ['-q', '-xml', '-zoom', '1', '-f', page, '-l', page, pdf, join(dir, 'page')], {
      maxBuffer: MAX_BUFFER,
    })
    const xml = await readFile(join(dir, 'page.xml'), 'utf8')
    const boxes = [...xml.matchAll(/<image top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)"/g)]
      .map(([, top, left, w, h]) => ({ x: Number(left), y: Number(top), w: Number(w), h: Number(h) }))
      .filter((b) => {
        const share = (b.w * b.h) / pageArea
        return share >= MIN_IMAGE_AREA && share <= MAX_IMAGE_AREA
      })
    const lines = textLines(xml)
    return { images: mergeOverlapping(boxes).map((box, i) => ({ id: `img${pdfPage}:${i}`, box })), lines }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// The page, or only `area` of it (PDF points), at `dpi`.
export async function renderPixels(pdf: string, pdfPage: number, dpi: number, area?: Box): Promise<Pixels> {
  const page = String(pdfPage)
  const px = (v: number): string => String(Math.max(0, Math.round((v * dpi) / 72)))
  const crop = area ? ['-x', px(area.x), '-y', px(area.y), '-W', px(area.w), '-H', px(area.h)] : []
  const { stdout } = await popplerBytes('pdftoppm', ['-q', '-f', page, '-l', page, '-r', String(dpi), ...crop, pdf], {
    maxBuffer: MAX_BUFFER,
  })
  return parsePpm(stdout)
}

export async function popplerVersion(): Promise<string> {
  const { stderr } = await poppler('pdftotext', ['-v'])
  return stderr.split('\n')[0] ?? 'unknown'
}

export async function pageCount(pdf: string): Promise<number> {
  return preflight(pdf)
}
