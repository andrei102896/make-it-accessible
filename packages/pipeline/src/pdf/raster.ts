import { poppler } from './poppler.ts'
import type { PixelSize } from './types.ts'

// Model image budget: ~1 token per 28x28 px patch, at most ~4784 tokens and 2576 px on the long edge.
const PATCH = 28
const MAX_PATCHES = 4784
const MAX_EDGE = 2576
const MAX_DPI = 300

export function fitScale(widthPt: number, heightPt: number): PixelSize {
  for (let dpi = MAX_DPI; dpi > 0; dpi--) {
    const width = Math.floor((widthPt * dpi) / 72)
    const height = Math.floor((heightPt * dpi) / 72)
    const patches = Math.ceil(width / PATCH) * Math.ceil(height / PATCH)
    if (patches <= MAX_PATCHES && Math.max(width, height) <= MAX_EDGE) return { width, height }
  }
  throw new Error(`no image size fits the model budget for ${widthPt}x${heightPt} pt`)
}

export async function renderPage(pdf: string, pdfPage: number, size: PixelSize, outPrefix: string): Promise<string> {
  const page = String(pdfPage)
  await poppler('pdftoppm', [
    '-q',
    '-f',
    page,
    '-l',
    page,
    '-scale-to-x',
    String(size.width),
    '-scale-to-y',
    String(size.height),
    '-jpeg',
    '-jpegopt',
    'quality=90',
    '-singlefile',
    pdf,
    outPrefix,
  ])
  return `${outPrefix}.jpg`
}

export async function renderCrop(
  pdf: string,
  pdfPage: number,
  size: PixelSize,
  box: readonly number[],
  outPrefix: string,
): Promise<string> {
  const [x = 0, y = 0, w = 0, h = 0] = box.map((v) => Math.max(0, Math.round(v)))
  const page = String(pdfPage)
  await poppler('pdftoppm', [
    '-q',
    '-f',
    page,
    '-l',
    page,
    '-scale-to-x',
    String(size.width),
    '-scale-to-y',
    String(size.height),
    '-x',
    String(x),
    '-y',
    String(y),
    '-W',
    String(Math.min(w, size.width - x)),
    '-H',
    String(Math.min(h, size.height - y)),
    '-jpeg',
    '-jpegopt',
    'quality=85',
    '-singlefile',
    pdf,
    outPrefix,
  ])
  return `${outPrefix}.jpg`
}
