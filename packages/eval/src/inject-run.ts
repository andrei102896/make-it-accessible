import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PageStructure } from '@make-it-accessible/pipeline/model/schema'
import type { OcrWord } from '@make-it-accessible/pipeline/pdf/ocr'
import type { Extraction } from '@make-it-accessible/pipeline/pdf/types'
import { Refused } from '@make-it-accessible/pipeline/pdf/refused'
import { unverified, validatePage } from '@make-it-accessible/pipeline/validate/validate'
import { DEFECTS, mutants, type Defect } from './inject.ts'
import { documentLegend } from './legend.ts'
import { OUT_DIR } from './paths.ts'
import { refreshedPage } from './refresh.ts'
import { loadSources, sourcePdf, VERIFY_FILE } from './sources.ts'

// pnpm inject [--per 3] [--verify [--sealed]]: every saved page of the set, refreshed as the build sees it, takes injected content defects
// (inject.ts); on pages the gates leave clean, a defect is caught when the page becomes held. Prints the catch rate
// per defect and writes out/inject.json (no timestamps: a run repeats).
const at = process.argv.indexOf('--per')
const PER = at >= 0 ? Number(process.argv[at + 1]) : 3
// `--verify`: the verification set instead of the working set (sources.ts).
const SET = process.argv.includes('--verify') ? VERIFY_FILE : undefined
// `--sealed`: only the verification menus never looked at (group verify-sealed), the judge of a rule learned elsewhere.
const SEALED = process.argv.includes('--sealed')

type Page = { structure: PageStructure; extraction: Extraction; ocr: OcrWord[] }
// A gate: whether it holds the page. More gates (geometry, icon shape, OCR, pixels) join this list.
const GATES: { name: string; holds: (p: Page) => boolean }[] = [
  { name: 'validator', holds: (p) => unverified(validatePage(p.structure, p.extraction, p.ocr)).length > 0 },
]

// mulberry32 over a string's hash: the same page draws the same defects every run.
function seeded(key: string): <T>(xs: T[], n: number) => T[] {
  let h = 1779033703
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 3432918353)
  let t = h >>> 0
  const next = (): number => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
  return (xs, n) => {
    const pool = [...xs]
    const out = []
    while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(next() * pool.length), 1))
    return out
  }
}

const tally = new Map<Defect, { injected: number; caught: number; missed: string[] }>(
  DEFECTS.map((d) => [d, { injected: 0, caught: 0, missed: [] }]),
)
let clean = 0
let held = 0
for (const s of (await loadSources(SET)).filter((x) => !SEALED || x.group === 'verify-sealed')) {
  const pdf = sourcePdf(s)
  const legend = await documentLegend(pdf).catch((e: unknown) => {
    if (e instanceof Refused) return null
    throw e
  })
  if (!legend) continue
  for (const d of (await readdir(s.run)).filter((x) => /^p\d+$/.test(x)).sort()) {
    const page = await refreshedPage(pdf, join(s.run, d), legend).catch(() => null)
    if (!page) continue
    if (GATES.some((g) => g.holds(page))) {
      held++
      continue
    }
    clean++
    for (const m of mutants(page.structure, page.extraction, PER, seeded(`${s.slug}/${d}`))) {
      const t = tally.get(m.type)
      if (!t) continue
      t.injected++
      if (GATES.some((g) => g.holds({ structure: m.structure, extraction: page.extraction, ocr: page.ocr }))) t.caught++
      else if (t.missed.length < 5) t.missed.push(`${s.slug} ${d} ${m.paths.join(' + ')}`)
    }
  }
}
const rows = DEFECTS.map((d) => {
  const t = tally.get(d) ?? { injected: 0, caught: 0, missed: [] }
  return { defect: d, ...t, rate: t.injected ? Math.round((100 * t.caught) / t.injected) : null }
})
console.info(`pages: ${String(clean)} clean, ${String(held)} held before any defect`)
for (const r of rows)
  console.info(
    `${r.defect.padEnd(16)} ${String(r.caught).padStart(4)} / ${String(r.injected).padEnd(4)} ${r.rate === null ? '-' : `${String(r.rate)} %`}`,
  )
await writeFile(
  join(OUT_DIR, 'inject.json'),
  JSON.stringify({ per: PER, clean, held, gates: GATES.map((g) => g.name), rows }, null, 2),
)
