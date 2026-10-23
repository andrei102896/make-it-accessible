import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { reconciled } from '@make-it-accessible/pipeline/model/reconcile'
import { parsePage, type PageStructure } from '@make-it-accessible/pipeline/model/schema'
import { readPrinted, type OcrWord } from '@make-it-accessible/pipeline/pdf/ocr'
import { withIcons, type LegendEntry } from '@make-it-accessible/pipeline/pdf/icons'
import { parseExtraction, type Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { moveIconCites } from './iconcites.ts'
import { folderStore } from './readings.ts'
import { extractWhole } from './wholewords.ts'
import { degraded } from '@make-it-accessible/pipeline/degraded'

// A saved page as the build sees it today: fonts, colours, hidden words, drawn shapes and icon words read afresh
// from the PDF, the structure's icon citations moved onto them and squared with the layer (reconcile.ts), with
// Tesseract's reading (none when it fails: what it would confirm stays held). Null when the page has no structure.
export async function refreshedPage(
  pdf: string,
  dir: string,
  legend: readonly LegendEntry[],
): Promise<{ extraction: Extraction; structure: PageStructure; ocr: OcrWord[] } | null> {
  const extraction = parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8'))
  const structureJson = await readFile(join(dir, 'structure.json'), 'utf8').catch(() => null)
  if (structureJson === null) return null
  const fresh = withIcons(await extractWhole(pdf, extraction.pdfPage), legend)
  // A scan's words are OCR's, saved with the page: the reading stays as the structure cited it.
  if (extraction.runs.some((r) => r.ocr)) {
    Object.assign(extraction, {
      vectors: fresh.vectors,
      rules: fresh.rules,
      pictures: fresh.pictures,
      icons: fresh.icons,
    })
    return { extraction, structure: parsePage(structureJson), ocr: [] }
  }
  // The structure cites the text layer's runs by index; icon words come after them and are read afresh.
  const base = extraction.runs.filter((r) => !r.icon)
  const freshBase = fresh.runs.filter((r) => !r.icon)
  if (freshBase.length !== base.length)
    throw new Error(`${dir}: the PDF gives ${String(freshBase.length)} runs, the saved run has ${String(base.length)}`)
  extraction.hidden = fresh.hidden
  extraction.lost = fresh.lost
  extraction.unmatched = fresh.unmatched
  extraction.vectors = fresh.vectors
  extraction.rules = fresh.rules
  extraction.pictures = fresh.pictures
  extraction.icons = fresh.icons
  base.forEach((r, i) => {
    const f = freshBase[i]
    if (f?.color) r.color = f.color
    if (f?.font) r.font = f.font
    if (f) Object.assign(r, { str: f.str, box: f.box, restored: f.restored, styled: f.styled })
  })
  const saved = extraction.runs
  extraction.runs = [...base, ...fresh.runs.filter((r) => r.icon)]
  const structure = parsePage(structureJson)
  if (!moveIconCites(structure, saved, extraction.runs, base.length))
    throw new Error(`${dir}: a cited icon word has no fresh icon at its place; run adhoc again`)
  const ocr = await readPrinted(pdf, extraction.pdfPage, extraction, folderStore()).catch((error: unknown) => {
    degraded(`${dir}: OCR failed: ${error instanceof Error ? error.message : ''}`)
    return null
  })
  return { extraction, structure: reconciled(structure, extraction), ocr: ocr ?? [] }
}

// The PDF page a saved page folder holds (its extraction is written before the model call, so a failed page has it).
export const savedPdfPage = async (dir: string): Promise<number> =>
  parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8')).pdfPage
