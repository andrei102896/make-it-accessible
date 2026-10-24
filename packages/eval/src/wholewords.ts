import { readFile } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { actualTextsOf } from '@make-it-accessible/pipeline/pdf/actualtext'
import { isCopy, restoreLigatures } from '@make-it-accessible/pipeline/pdf/ligatures'
import { splitFused, withSplit } from '@make-it-accessible/pipeline/pdf/fused'
import { PdfItem, slanted } from '@make-it-accessible/pipeline/pdf/pdfjs'
import { degraded } from '@make-it-accessible/pipeline/degraded'
import { extractPage } from '@make-it-accessible/pipeline/pdf/poppler'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { Late, PDFJS_TIMEOUT_MS, withDeadline } from './deadline.ts'
import { SAME_FRAME } from './pdfjs.ts'
import { flateStreams } from '@make-it-accessible/pipeline/pdf/streams'

// What pdf.js reads of a page beside Poppler: words Poppler fused split (pdf/fused.ts), ligatures Poppler dropped
// restored from their replacement text (pdf/ligatures.ts), and the words its text matrix slants.
export async function withWholeWords(pdfPath: string, e: Extraction): Promise<Extraction> {
  const copies = e.runs.some((r) => isCopy(r, e.height))
  const data = new Uint8Array(await readFile(pdfPath))
  // A page pdf.js cannot parse keeps its words whole and upright, the same on every read. Past a deadline it fails
  // (degraded: less load may meet it), as its ligatures do: a late read would leave fused words a timely one splits.
  const at = `${pdfPath} p${String(e.pdfPage)}`
  const read = await pageItems(pdfPath, data, e).catch((error: unknown) => {
    if (error instanceof Late) degraded(`${at}: pdf.js did not read it in time; the page fails`)
    if (copies || error instanceof Late) throw error
    console.error(`${at}: pdf.js did not read it (${String(error)}); no word split or slanted`)
    return null
  })
  if (!read) return e
  if (read === 'frame') {
    console.error(`${at}: pdf.js reads another page frame; ${copies ? 'ligatures left as dropped' : 'no word split'}`)
    return e
  }
  const parted = withSplit(e, splitFused(e.runs, read.items, read.view, e.pdfPage))
  const lean = slanted(parted.runs, read.items, read.view)
  const runs = parted.runs.map((r) => (lean.has(r.id) ? { ...r, slanted: true as const } : r))
  if (!copies) return { ...parted, runs }
  const texts = flateStreams(data).flatMap((s) => actualTextsOf(Buffer.from(s).toString('latin1')))
  const whole = restoreLigatures(runs, read.items, texts, read.view)
  return {
    ...parted,
    runs: whole.runs,
    hidden: [...new Set([...parted.hidden, ...whole.hidden])],
    lost: [...new Set([...(parted.lost ?? []), ...whole.lost])],
  }
}

// The page's text items and box, or 'frame' when pdf.js reads another page frame than Poppler.
async function pageItems(
  pdfPath: string,
  data: Uint8Array,
  e: Extraction,
): Promise<{ items: PdfItem[]; view: [number, number, number, number] } | 'frame'> {
  // pdf.js may take over the buffer it is given.
  const task = getDocument({ data: data.slice(), verbosity: 0 })
  const doc = await withDeadline(task.promise, PDFJS_TIMEOUT_MS, `${pdfPath}: pdf.js did not open it in time`).catch(
    async (err: unknown) => {
      await task.destroy()
      throw err
    },
  )
  try {
    const page = await withDeadline(doc.getPage(e.pdfPage), PDFJS_TIMEOUT_MS, 'pdf.js did not open the page in time')
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view
    if (Math.abs(x1 - x0 - e.width) > SAME_FRAME || Math.abs(y1 - y0 - e.height) > SAME_FRAME) return 'frame'
    const content = await withDeadline(page.getTextContent(), PDFJS_TIMEOUT_MS, 'pdf.js did not read the text in time')
    const items = content.items.flatMap((i) => {
      const p = PdfItem.safeParse(i)
      return p.success ? [p.data] : []
    })
    return { items, view: [x0, y0, x1, y1] }
  } finally {
    await doc.destroy()
  }
}

// A page read by Poppler with its words whole: what the model sees and what a rebuild reads again.
export const extractWhole = async (pdfPath: string, pdfPage: number): Promise<Extraction> =>
  withWholeWords(pdfPath, await extractPage(pdfPath, pdfPage))
