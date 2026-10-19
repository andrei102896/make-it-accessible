import { readFile } from 'node:fs/promises'
import { PDFJS_TIMEOUT_MS, withDeadline } from './deadline.ts'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { z } from 'zod'
import { ownFonts, type Drawn, type OwnFonts } from '@make-it-accessible/pipeline/pdf/ownfont'
import { printedFaces, type PrintedFace } from '@make-it-accessible/pipeline/pdf/printedfaces'
import { PdfFont, PdfItem } from '@make-it-accessible/pipeline/pdf/pdfjs'
import { trackingOf } from '@make-it-accessible/pipeline/pdf/tracking'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { permittedFonts } from './rawfonts.ts'

// Poppler's words and pdf.js' items agree on the page's frame only where the crop box is the media box: within this.
export const SAME_FRAME = 0.5

// Per page: each run's printed letter spacing (pdf/tracking.ts), the PDF's own face it is printed in, where its
// maker permits embedding (pdf/ownfont.ts), and each printed face's program for measuring (pdf/printedfaces.ts).
export type PageFacts = { tracking: Record<string, number>; own: OwnFonts; printed: Map<string, PrintedFace> }
type Facts = { of: (e: Extraction) => Promise<PageFacts>; close: () => Promise<void> }
const NONE = (): PageFacts => ({ tracking: {}, own: { faces: {}, fonts: {}, files: new Map() }, printed: new Map() })

// The PDF read by pdf.js for its fonts. Both facts only refine the printed view: a PDF or page pdf.js cannot read
// is untracked and in stand-in faces, and logged.
export async function pdfFacts(pdf: string): Promise<Facts> {
  const data = new Uint8Array(await readFile(pdf))
  // Before pdf.js: it may take over the buffer it is given.
  const permitted = permittedFonts(data)
  const task = getDocument({ data, fontExtraProperties: true, disableFontFace: true, verbosity: 0 })
  const doc = await withDeadline(task.promise, PDFJS_TIMEOUT_MS, 'pdf.js did not open it in time').catch(
    async (err: unknown) => {
      console.error(`${pdf}: pdf.js could not read it, no tracking or own faces: ${String(err)}`)
      await task.destroy()
      return null
    },
  )
  return {
    of: async (e) => {
      if (!doc) return NONE()
      let page: Awaited<ReturnType<typeof doc.getPage>> | null = null
      try {
        page = await withDeadline(doc.getPage(e.pdfPage), PDFJS_TIMEOUT_MS, 'pdf.js did not open the page in time')
        const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view
        if (Math.abs(x1 - x0 - e.width) > SAME_FRAME || Math.abs(y1 - y0 - e.height) > SAME_FRAME) return NONE()
        // The operator list loads the page's fonts into commonObjs, and says which code draws each letter.
        const ops = await withDeadline(page.getOperatorList(), PDFJS_TIMEOUT_MS, 'pdf.js did not draw the page in time')
        const content = await withDeadline(
          page.getTextContent(),
          PDFJS_TIMEOUT_MS,
          'pdf.js did not read the text in time',
        )
        const items = content.items.flatMap((i) => {
          const p = PdfItem.safeParse(i)
          return p.success ? [p.data] : []
        })
        const objects: unknown[] = [...page.commonObjs]
        const fonts = objects.flatMap((entry) => {
          const p = PdfFont.safeParse(Array.isArray(entry) ? entry[1] : entry)
          return p.success ? [p.data] : []
        })
        const box = [x0, y0, x1, y1] as const
        const drawn = drawnWith(ops)
        return {
          tracking: trackingOf(e.runs, items, fonts, box),
          own: ownFonts(e.runs, items, fonts, box, permitted, drawn),
          printed: printedFaces(e.runs, items, fonts, box, drawn),
        }
      } catch (err) {
        console.error(`${pdf} p${String(e.pdfPage)}: no tracking or own faces: ${String(err)}`)
        return NONE()
      } finally {
        page?.cleanup()
      }
    },
    close: async () => {
      await doc?.destroy()
    },
  }
}

// A shown glyph as pdf.js' operator list carries it: the code in its program and the letter it stands for.
const Glyph = z.object({ fontChar: z.string(), unicode: z.string() })

// Per font, each letter's code the page draws it with most.
function drawnWith(ops: { fnArray: number[]; argsArray: unknown[] }): Drawn {
  const counts = new Map<string, Map<string, Map<number, number>>>()
  let font = ''
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i]
    if (fn === OPS.setFont && Array.isArray(args) && typeof args[0] === 'string') font = args[0]
    if (fn !== OPS.showText || !Array.isArray(args) || !Array.isArray(args[0])) return
    const letters = counts.get(font) ?? new Map<string, Map<number, number>>()
    counts.set(font, letters)
    for (const g of args[0]) {
      const p = Glyph.safeParse(g)
      const code = p.success ? p.data.fontChar.codePointAt(0) : undefined
      if (!p.success || code === undefined) continue
      const used = letters.get(p.data.unicode) ?? new Map<number, number>()
      used.set(code, (used.get(code) ?? 0) + 1)
      letters.set(p.data.unicode, used)
    }
  })
  return new Map(
    [...counts].map(([name, letters]) => [
      name,
      new Map([...letters].map(([u, used]) => [u, [...used].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0])),
    ]),
  )
}
