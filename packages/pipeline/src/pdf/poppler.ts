import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { mergeOverlapping } from './geometry.ts'
import { parsePpm, type Pixels } from './pixels.ts'
import { findDuplicates } from './runs.ts'
import { lineAt, textLines, type Line } from './face.ts'
import type { Extraction, PageImage, Run } from './types.ts'
import { hiddenRuns } from './visibility.ts'

export const poppler = promisify(execFile)
export const MAX_BUFFER = 64 * 1024 * 1024
const MIN_IMAGE_AREA = 0.01
const MAX_IMAGE_AREA = 0.9
// Enough to see the ink of a light 6 pt word, cheap enough to render every page once more; a poster-sized page
// is rendered smaller so its pixels stay well under MAX_BUFFER (A0 at 150 dpi is ~104 MB).
const VISIBILITY_DPI = 150
const MAX_VISIBILITY_EDGE = 5000

export async function extractPage(pdf: string, pdfPage: number): Promise<Extraction> {
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
  const dpi = Math.min(VISIBILITY_DPI, (MAX_VISIBILITY_EDGE * 72) / Math.max(width, height))
  const hidden = hiddenRuns(runs, await renderPixels(pdf, pdfPage, dpi), dpi / 72)
  return { pdfPage, width, height, runs, images, duplicates, hidden }
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

export async function renderPixels(pdf: string, pdfPage: number, dpi: number): Promise<Pixels> {
  const page = String(pdfPage)
  const { stdout } = await poppler('pdftoppm', ['-q', '-f', page, '-l', page, '-r', String(dpi), pdf], {
    encoding: 'buffer',
    maxBuffer: MAX_BUFFER,
  })
  return parsePpm(stdout)
}

export async function popplerVersion(): Promise<string> {
  const { stderr } = await poppler('pdftotext', ['-v'])
  return stderr.split('\n')[0] ?? 'unknown'
}

export async function pageCount(pdf: string): Promise<number> {
  const { stdout } = await poppler('pdfinfo', [pdf])
  const pages = /^Pages:\s+(\d+)/m.exec(stdout)?.[1]
  if (!pages) throw new Error(`pdfinfo returned no page count for ${pdf}`)
  return Number(pages)
}
