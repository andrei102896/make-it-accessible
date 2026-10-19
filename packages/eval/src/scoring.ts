import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { keyWords, type KeyDoc } from './keys.ts'
import type { KeySet } from './manifest.ts'
import { buildHtml, type PageResult } from './process.ts'
import type { DocScore } from './score/types.ts'
import { decisions } from './score/decisions.ts'
import { scoreDocument } from './score/score.ts'

export async function buildAndScore(key: KeyDoc, docDir: string, results: PageResult[]): Promise<DocScore> {
  // Scoring reads missing pages as missing; only publication holds a document.
  const htmlPath = await buildHtml(
    key.pdfPath,
    docDir,
    results,
    results.map((r) => r.pdfPage),
    key.doc,
  )
  const scored = await scoreDocument(
    htmlPath,
    key,
    results.map((r) => r.keyPage),
    await keyWords(key),
  )
  const validation = new Map(results.map((r) => [r.keyPage, r.validation]))
  const score = {
    ...scored,
    pages: scored.pages.map((p) => {
      const v = validation.get(p.keyPage)
      return { ...p, decisions: v ? decisions(v) : null }
    }),
  }
  await writeFile(join(docDir, 'score.json'), JSON.stringify(score, null, 2))
  return score
}

const coverageNote = (p: DocScore['pages'][number]): string =>
  p.c3.coverage ? ` (words ${(p.c3.coverage.coverage * 100).toFixed(0)}%)` : ''

export function printScore(doc: string, score: DocScore, set: KeySet | undefined): void {
  for (const p of score.pages) {
    const c3 = p.c3.missing.length + p.c3.altered.length + p.c3.invented.length
    const mark = (ok: boolean | null): string => (ok === null ? 'n/a' : ok ? 'ok' : 'FAIL')
    console.info(
      `${doc} p${String(p.keyPage)} [${set ?? 'not in split'}]: ` +
        `C1 ${(p.c1.textOnly * 100).toFixed(0)}% (${String(p.c1.outOfOrder)} out of order, ${String(p.c1.flaggedOutOfOrder)} flagged) ${mark(p.pass.c1)} | ` +
        `C2 ${String(p.c2.errorProducts)}/${String(p.c2.products)} (silent ${String(p.c2.silent)}, role unverified ${String(p.c2.unverified)}) ${mark(p.pass.c2)} | ` +
        `C3 ${String(c3)} ${mark(p.pass.c3)}${coverageNote(p)} | C4 alt names product ${String(p.c4.ok)}/${String(p.c4.total)} ${mark(p.pass.c4)} | ` +
        `C5 headings ${String(p.c5.headingsOk)}/${String(p.c5.headings)} | ` +
        `rows ${String(p.c5.rowsOk)}/${String(p.c5.rows)} (silent ${String(p.c5.silentRows)}, unchecked cells ${String(p.c5.unchecked)})` +
        `${p.c5.headerErrors.length ? ` headers wrong ${String(p.c5.headerErrors.length)}` : ''} ${mark(p.pass.c5)} | ` +
        `decisions ${String(p.decisions ?? '-')}` +
        (p.pass.layout === null ? '' : ` | printed pages ${mark(p.pass.layout)}`) +
        (p.pass.unsupported === null ? '' : ` | unsupported ${mark(p.pass.unsupported)}`),
    )
  }
  console.info(
    `${doc} axe: critical ${String(score.axe.critical)}, serious ${String(score.axe.serious)} ${score.axe.rules.join(' ')}`,
  )
}
