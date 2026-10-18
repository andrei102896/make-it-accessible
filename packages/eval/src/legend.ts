import { legendOf, type LegendEntry } from '@make-it-accessible/pipeline/pdf/icons'
import { extractPage, pageCount } from '@make-it-accessible/pipeline/pdf/poppler'

// A document's icon legend (pdf/icons.ts), read once from every page: the legend prints on one page (Howies' last)
// and names the icons of all of them.
export async function documentLegend(pdf: string): Promise<LegendEntry[]> {
  const pages = []
  for (let n = 1, total = await pageCount(pdf); n <= total; n++) pages.push(await extractPage(pdf, n))
  return legendOf(pages)
}
