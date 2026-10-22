import type { PageFidelity } from './fidelity-measure.ts'
import { judgePage, LIMITS, type Kind } from '@make-it-accessible/pipeline/pdf/fidelity-verdict'

// Pages the verdict sends to the text view, and why; cosmetic findings by kind.
export function verdicts(docs: { slug: string; pages: PageFidelity[] }[], sealed: boolean): string[] {
  const out: string[] = []
  const measured = docs.flatMap((d) => d.pages.flatMap((p) => ('lines' in p ? [{ slug: d.slug, p }] : [])))
  const kinds = new Map<Kind, number>()
  let held = 0
  for (const { slug, p } of measured) {
    const v = judgePage(p)
    for (const f of [...v.misinforming, ...v.cosmetic]) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1)
    if (!v.misinforming.length) continue
    held++
    if (!sealed)
      out.push(
        `text view: ${slug} p${String(p.keyPage)}: ${v.misinforming.map((f) => `${f.kind} ${f.lines.map((i) => JSON.stringify(p.lines[i]?.text ?? '')).join(', ')}`).join('; ')}`,
      )
  }
  out.push(`pages to the text view: ${String(held)} of ${String(measured.length)}`)
  for (const [k, n] of kinds) out.push(`  ${k}: ${String(n)} pages`)
  return out
}

export function summary(p: Extract<PageFidelity, { lines: unknown }>): string {
  const ratios = p.lines.filter((l) => l.mass.pdf > 0).map((l) => l.mass.ours / l.mass.pdf)
  const shadowed = p.lines.filter((l) => l.shadowed).length
  return `${String(p.lines.length)} lines${shadowed ? ` (${String(shadowed)} with a printed shadow)` : ''}, mass median ${q(ratios, 0.5).toFixed(2)} max ${q(ratios, 1).toFixed(2)}, outside pdf-only ${String(p.outside.pdfOnly)} ours-only ${String(p.outside.oursOnly)} (busy ${String(p.outside.busy)} of ${String(p.outside.cells + p.outside.busy)}), ground offset ${p.groundOffset.toFixed(3)}`
}

// Percentiles per metric over every measured line, the verdict's limits beside them.
export function report(pages: PageFidelity[]): string[] {
  const measured = pages.flatMap((p) => ('lines' in p ? [p] : []))
  const lines = measured.flatMap((p) => p.lines)
  const mass = lines.filter((l) => l.mass.pdf > 0).map((l) => l.mass.ours / l.mass.pdf)
  const contrast = lines.flatMap((l) => (l.contrast === null ? [] : [l.contrast]))
  const pct = (xs: number[]): string =>
    `p1 ${q(xs, 0.01).toFixed(2)} p50 ${q(xs, 0.5).toFixed(2)} p99 ${q(xs, 0.99).toFixed(2)}`
  return [
    `pages ${String(pages.length)}, measured ${String(measured.length)}, lines ${String(lines.length)}`,
    `mass ratio: ${pct(mass)} (limits ${String(LIMITS.massLo)} on its rows, ${String(LIMITS.massHi)})`,
    `contrast: ${pct(contrast)} (limit ${String(LIMITS.contrast)})`,
    `outside cells pdf-only per page: ${pct(measured.map((p) => p.outside.pdfOnly))}`,
  ]
}

function q(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0
}
