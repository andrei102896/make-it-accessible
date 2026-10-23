import type { PageFidelity } from './fidelity-measure.ts'
import { judgePage, type Kind } from '@make-it-accessible/pipeline/pdf/fidelity-verdict'

type Measured = Extract<PageFidelity, { ink: unknown }>
const measuredOf = (pages: readonly PageFidelity[]): Measured[] => pages.flatMap((p) => ('ink' in p ? [p] : []))

// The whole-page check's findings by kind: reported, never a reason for the text view.
export function verdicts(docs: { slug: string; pages: PageFidelity[] }[], sealed: boolean): string[] {
  const out: string[] = []
  const kinds = new Map<Kind, number>()
  for (const d of docs)
    for (const p of measuredOf(d.pages))
      for (const f of judgePage(p)) {
        kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1)
        // The sealed half is reported in aggregate only.
        if (!sealed) out.push(`${f.kind}: ${d.slug} p${String(p.keyPage)}`)
      }
  for (const [k, n] of kinds) out.push(`  ${k}: ${String(n)} pages`)
  return out
}

const ratio = (b: { pdf: number; ours: number }): number => (b.pdf ? b.ours / b.pdf : 1)
export const summary = (p: Measured): string =>
  `ink ${ratio(p.ink).toFixed(3)} of the PDF's, its lowest band ${Math.min(...p.bands.filter((b) => b.pdf).map(ratio)).toFixed(3)}`

// Per page, our ink over the PDF's, as percentiles.
export function report(pages: PageFidelity[]): string[] {
  const measured = measuredOf(pages)
  const ink = measured.map((p) => ratio(p.ink))
  return [
    `pages ${String(pages.length)}, measured ${String(measured.length)}`,
    `ink ratio per page: p1 ${q(ink, 0.01).toFixed(3)} p50 ${q(ink, 0.5).toFixed(3)} p99 ${q(ink, 0.99).toFixed(3)}`,
  ]
}

function q(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0
}
