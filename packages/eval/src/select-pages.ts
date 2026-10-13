import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { loadLayoutLabels, loadSplit } from './manifest.ts'
import { DOCS_DIR, ROOT } from './paths.ts'
import { pageFacts, select, type Slot } from './selection.ts'
import { pageWords } from './words.ts'

// Pages to key per document (docs/HARDENING.md A4). "fixed" pages carry a trait recorded in validation/SOURCES.md.
const PLAN: Record<string, Slot[]> = {
  '06_lidl_gb': [{ rule: 'priced', count: 3 }],
  '07_bm': [{ rule: 'priced', count: 3 }],
  '08_keystore': [{ rule: 'priced', count: 3 }],
  '09_kaufland': [{ rule: 'priced', count: 3 }],
  '10_lidl_de': [
    { rule: 'priced', count: 2 },
    { rule: 'empty', count: 1 },
  ],
  '11_lidl_ch': [{ rule: 'priced', count: 3 }],
  '12_landi': [{ rule: 'priced', count: 3 }],
  '13_swift': [{ fixed: [17] }, { rule: 'text', count: 2 }],
  '14_swift_spec': [{ fixed: [1] }, { rule: 'spread', count: 2 }],
  '15_elddis': [
    { rule: 'spread', count: 1 },
    { rule: 'text', count: 2 },
  ],
  '16_coachman': [{ fixed: [1, 2] }],
  '17_elddis_prices': [{ fixed: [1, 2] }],
  '18_akash': [{ fixed: [1, 2] }],
  '19_sondergeld': [{ rule: 'priced', count: 2 }],
  '20_schumanns': [{ rule: 'empty', count: 1 }],
  '21_cafe_friedrich': [{ rule: 'priced', count: 2 }],
  '22_lamh': [{ fixed: [1, 2] }],
  '23_schnizz': [{ fixed: [1] }],
  '24_savoyen': [{ rule: 'priced', count: 2 }],
  '25_gasthof_deutsch': [{ rule: 'empty', count: 1 }],
  '26_sanford': [{ rule: 'priced', count: 2 }, { fixed: [15] }],
  '27_lidl_nl': [{ fixed: [5, 21] }, { rule: 'priced', count: 1 }],
}
// Spares replace a page without prices or top up the test minimums, in order; the reserve is held back per sealed
// document for a retest on unseen pages and never rendered or keyed until then.
const SPARE = 3
const RESERVE = 3

const { values } = parseArgs({ options: { seed: { type: 'string' } } })
if (!values.seed) throw new Error('usage: pnpm select-pages --seed <SHA of the commit that froze the rules>')
const seed = values.seed
const [labels, split] = await Promise.all([loadLayoutLabels(), loadSplit()])
const selection: Record<string, unknown> = {}
for (const [doc, slots] of Object.entries(PLAN)) {
  const pdf = Object.keys(labels).find((f) => f.startsWith(doc.slice(0, 3)))
  const layouts = pdf ? labels[pdf] : undefined
  const set = split[doc]
  if (!pdf || !layouts || !set) throw new Error(`${doc} is missing from the layout labels or the split`)
  const facts = []
  for (const [i, layout] of layouts.entries())
    facts.push(pageFacts(i + 1, layout, await pageWords(join(DOCS_DIR, pdf), i + 1)))
  const { picked, spare, reserve } = select(seed, doc, facts, slots, {
    spare: SPARE,
    reserve: set === 'test' ? RESERVE : 0,
  })
  selection[doc] = { pdf, set, pages: picked, spare, reserve }
  console.info(`${doc} [${set}]: ${picked.map((p) => `${String(p.pdfPage)} (${p.rule})`).join(', ')}`)
}
await writeFile(join(ROOT, 'validation', 'selection.json'), `${JSON.stringify({ seed, selection }, null, 2)}\n`)
