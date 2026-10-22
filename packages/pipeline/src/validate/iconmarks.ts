import type { PageStructure } from '../model/schema.ts'
import { joinRuns } from '../pdf/runs.ts'
import type { Box, Extraction } from '../pdf/types.ts'
import type { Finding } from './validate.ts'

// A dietary mark the page would not announce holds it, as a finding of the mark's own place, so a person who checked
// it beside the PDF can record it (eval/approved.ts binds the words beside it).
export const ICON_AT = 'icon@'

export function iconMarks(page: PageStructure, e: Extraction): Finding[] {
  const hidden = new Set(e.hidden)
  const at = (b: Box, problem: string): Finding => {
    const beside = e.runs
      .filter((r) => !r.icon && !hidden.has(r.id) && r.box.x >= b.x + b.w - 1)
      .filter((r) => Math.abs(r.box.y + r.box.h / 2 - (b.y + b.h / 2)) <= b.h / 2)
      .sort((x, y) => x.box.x - y.box.x)
      .slice(0, 3)
    return {
      path: `${ICON_AT}${String(Math.round(b.x))},${String(Math.round(b.y))}`,
      problem: `${problem}, before "${joinRuns(beside)}"`,
    }
  }
  // Legend-sized, alike none of its icons (pdf/icons.ts): the lobster beside "Add half lobster".
  const unnamed = (e.icons ?? [])
    .filter((i) => i.unnamed)
    .map((i) => at(i.box, "a mark the size of the legend's icons matches none of them"))
  // Named by the legend but left out by the answer (Waterloo dinner's chocolate cremeux, its vegan and gluten free).
  const dropped = e.runs
    .filter((r, i) => r.icon && !hidden.has(r.id) && page.dropped.some(([a, b]) => a <= i && i <= b))
    .map((r) => at(r.box, `the legend's "${r.str}" mark is left out`))
  return [...unnamed, ...dropped]
}
