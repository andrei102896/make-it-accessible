import type { Validation } from '@make-it-accessible/pipeline/validate/validate'

const UNIT = /^blocks\[\d+\](?:\.items\[\d+\]|\.rows\[\d+\])?/

// One decision per product, list item, table row or block carrying an error or review finding, plus one for the page.
export function decisions(v: Pick<Validation, 'errors' | 'review'>): number {
  const units = new Set<string>()
  let page = false
  for (const { path } of [...v.errors, ...v.review]) {
    const unit = UNIT.exec(path)?.[0]
    if (unit) units.add(unit)
    else page = true
  }
  return units.size + (page ? 1 : 0)
}
