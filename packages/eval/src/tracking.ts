import { readFile } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PdfFont, PdfItem, trackingOf } from '@make-it-accessible/pipeline/pdf/tracking'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'

// Poppler's words and pdf.js' items agree on the page's frame only where the crop box is the media box: within this.
const SAME_FRAME = 0.5

type Tracking = { of: (e: Extraction) => Promise<Record<string, number>>; close: () => Promise<void> }

// The PDF read by pdf.js for its fonts' advance widths: each page's printed letter spacing per run (pdf/tracking.ts).
// Tracking only refines the printed view: a PDF or page pdf.js cannot read is measured as untracked, and logged.
export async function pdfTracking(pdf: string): Promise<Tracking> {
  const data = new Uint8Array(await readFile(pdf))
  const doc = await getDocument({ data, fontExtraProperties: true, disableFontFace: true, verbosity: 0 }).promise.catch(
    (err: unknown) => {
      console.error(`${pdf}: pdf.js could not read it, no tracking: ${String(err)}`)
      return null
    },
  )
  return {
    of: async (e) => {
      if (!doc) return {}
      let page: Awaited<ReturnType<typeof doc.getPage>> | null = null
      try {
        page = await doc.getPage(e.pdfPage)
        const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view
        if (Math.abs(x1 - x0 - e.width) > SAME_FRAME || Math.abs(y1 - y0 - e.height) > SAME_FRAME) return {}
        // The operator list loads the page's fonts into commonObjs.
        await page.getOperatorList()
        const items = (await page.getTextContent()).items.flatMap((i) => {
          const p = PdfItem.safeParse(i)
          return p.success ? [p.data] : []
        })
        const objects: unknown[] = [...page.commonObjs]
        const fonts = objects.flatMap((entry) => {
          const p = PdfFont.safeParse(Array.isArray(entry) ? entry[1] : entry)
          return p.success ? [p.data] : []
        })
        return trackingOf(e.runs, items, fonts, [x0, y0, x1, y1])
      } catch (err) {
        console.error(`${pdf} p${String(e.pdfPage)}: no tracking: ${String(err)}`)
        return {}
      } finally {
        page?.cleanup()
      }
    },
    close: async () => {
      await doc?.destroy()
    },
  }
}
