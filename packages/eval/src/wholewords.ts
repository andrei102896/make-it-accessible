import { readFile } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { actualTextsOf } from '@make-it-accessible/pipeline/pdf/actualtext'
import { isCopy, restoreLigatures } from '@make-it-accessible/pipeline/pdf/ligatures'
import { PdfItem } from '@make-it-accessible/pipeline/pdf/pdfjs'
import { extractPage } from '@make-it-accessible/pipeline/pdf/poppler'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { SAME_FRAME } from './pdfjs.ts'
import { flateStreams } from './streams.ts'

// The page's words whole where Poppler dropped a ligature and kept its replacement text at the page's edge
// (pipeline/pdf/ligatures.ts); a page with no such copy is returned as read, without opening the PDF again.
export async function withWholeWords(pdfPath: string, e: Extraction): Promise<Extraction> {
  if (!e.runs.some((r) => isCopy(r, e.height))) return e
  const data = new Uint8Array(await readFile(pdfPath))
  const texts = flateStreams(data).flatMap((s) => actualTextsOf(Buffer.from(s).toString('latin1')))
  // pdf.js may take over the buffer it is given.
  const doc = await getDocument({ data: data.slice(), verbosity: 0 }).promise
  try {
    const page = await doc.getPage(e.pdfPage)
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view
    if (Math.abs(x1 - x0 - e.width) > SAME_FRAME || Math.abs(y1 - y0 - e.height) > SAME_FRAME) {
      console.error(`${pdfPath} p${String(e.pdfPage)}: pdf.js reads another page frame; ligatures left as dropped`)
      return e
    }
    const items = (await page.getTextContent()).items.flatMap((i) => {
      const p = PdfItem.safeParse(i)
      return p.success ? [p.data] : []
    })
    const whole = restoreLigatures(e.runs, items, texts, [x0, y0, x1, y1])
    return {
      ...e,
      runs: whole.runs,
      hidden: [...new Set([...e.hidden, ...whole.hidden])],
      lost: [...new Set([...(e.lost ?? []), ...whole.lost])],
    }
  } finally {
    await doc.destroy()
  }
}

// A page read by Poppler with its words whole: what the model sees and what a rebuild reads again.
export const extractWhole = async (pdfPath: string, pdfPage: number): Promise<Extraction> =>
  withWholeWords(pdfPath, await extractPage(pdfPath, pdfPage))
