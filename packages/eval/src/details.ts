import type { Brief } from '@make-it-accessible/pipeline/model/brief'
import { norm } from '@make-it-accessible/pipeline/text/normalize'

type Detail = NonNullable<Brief['details']>[number]

// The brief's design details the page does not draw: an ornament counts as drawn when a heading carrying one names
// its words; boxes, icons and panels are not drawn yet.
export function missingDetails(html: string, details: readonly Detail[]): Detail[] {
  const drawn = [...html.matchAll(/<h[1-6][^>]*\born-\d+[^>]*>(.*?)<\/h[1-6]>/gs)].map((m) =>
    norm((m[1] ?? '').replace(/<[^>]+>/g, ' ')),
  )
  const near = (d: Detail): boolean =>
    drawn.some((t) => t.length > 0 && (t.includes(norm(d.near)) || norm(d.near).includes(t)))
  return details.filter((d) => d.kind !== 'ornament' || !near(d))
}
