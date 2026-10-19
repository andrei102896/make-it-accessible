import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_BUFFER, poppler, popplerBytes } from './exec.ts'
import type { Box, Extraction, Run } from './types.ts'

// An independent reading of the printed page: Tesseract on the rendered pixels, never on the PDF's text layer.
const OCR_DPI = 300
const PSM = '3'
// Slowest page on all sets (2026-10-19): 8.7 s and 158 MB, Kenny & Ziggy's p1; a page that hangs is killed here.
const OCR_TIMEOUT_MS = 120_000

// `line` numbers the printed lines in Tesseract's reading order; `block` is the column or zone it found them in.
export type OcrWord = { str: string; box: Box; block: number; line: number }
// Tesseract's raw TSV, computed once per page content and engine; only completed readings are stored.
export type ReadingStore = {
  get: (key: string) => Promise<string | null>
  put: (key: string, tsv: string) => Promise<void>
}

let engine: Promise<string | null> | undefined
// Tesseract's version, its English data and mode; null when it is not installed (logged once: scans stay held).
const engineVersion = (): Promise<string | null> =>
  (engine ??= (async () => {
    const version = (await poppler('tesseract', ['--version'])).stdout.split('\n')[0] ?? ''
    const data = /"([^"]+)"/.exec((await poppler('tesseract', ['--list-langs'])).stdout)?.[1] ?? ''
    const eng = createHash('sha256')
      .update(await readFile(join(data, 'eng.traineddata')))
      .digest('hex')
    return `${version} eng ${eng} psm ${PSM}`
  })().catch((error: unknown) => {
    console.error(`OCR unavailable, scanned pages stay held: ${error instanceof Error ? error.message : ''}`)
    return null
  }))

// The page's words as Tesseract reads them, in PDF points; null when no reading can be made.
export async function readPrinted(
  pdf: string,
  pdfPage: number,
  size: { width: number; height: number },
  store: ReadingStore,
): Promise<OcrWord[] | null> {
  const version = await engineVersion()
  if (version === null) return null
  // One byte a pixel within MAX_BUFFER whatever the page's shape.
  const dpi = Math.floor(Math.min(OCR_DPI, Math.sqrt(MAX_BUFFER / (size.width * size.height)) * 72))
  const page = String(pdfPage)
  const { stdout: pixels } = await popplerBytes(
    'pdftoppm',
    ['-q', '-gray', '-r', String(dpi), '-f', page, '-l', page, pdf],
    {
      maxBuffer: MAX_BUFFER,
    },
  )
  const key = createHash('sha256')
    .update(`${version} ${String(dpi)}\n`)
    .update(pixels)
    .digest('hex')
  let tsv = await store.get(key)
  if (tsv === null) {
    tsv = await tesseract(pixels)
    await store.put(key, tsv)
  }
  return parseTsv(tsv, 72 / dpi)
}

function tesseract(pixels: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // One thread a page: pages run side by side, and OpenMP would oversubscribe the cores.
    const child = spawn('tesseract', ['stdin', 'stdout', '--psm', PSM, 'tsv'], {
      env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      timeout: OCR_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    })
    const out: Buffer[] = []
    let bytes = 0
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BUFFER) child.kill('SIGKILL')
      else out.push(chunk)
    })
    child.stdin.on('error', () => undefined)
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'))
      else reject(new Error(`tesseract ended with ${signal ?? `code ${String(code)}`}`))
    })
    child.stdin.end(pixels)
  })
}

// Tesseract's TSV: level 5 rows are words; `scale` turns pixels into PDF points.
export function parseTsv(tsv: string, scale: number): OcrWord[] {
  const lines = new Map<string, number>()
  const words: OcrWord[] = []
  for (const row of tsv.split('\n').slice(1)) {
    const c = row.split('\t')
    const str = c.slice(11).join('\t').trim()
    if (c[0] !== '5' || !str) continue
    const [block, par, line, , x, y, w, h] = c.slice(2, 10).map(Number)
    const id = `${String(block)}.${String(par)}.${String(line)}`
    if (!lines.has(id)) lines.set(id, lines.size)
    const at = (v: number | undefined): number => Math.round((v ?? 0) * scale * 100) / 100
    words.push({ str, box: { x: at(x), y: at(y), w: at(w), h: at(h) }, block: block ?? 0, line: lines.get(id) ?? 0 })
  }
  return words
}

// A page whose text layer shows no letter or digit is a scan: OCR's words stand in for its text layer.
export const isScan = (e: Extraction): boolean => {
  const hidden = new Set(e.hidden)
  return !e.runs.some((r) => !r.icon && !hidden.has(r.id) && /[\p{L}\p{N}]/u.test(r.str))
}

export const ocrRuns = (words: readonly OcrWord[], pdfPage: number): Run[] =>
  words.map((w, i) => ({
    id: `${String(pdfPage)}:${String(i)}`,
    str: w.str,
    box: w.box,
    flow: w.block,
    line: w.line,
    ocr: true,
  }))
