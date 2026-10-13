import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// `line` identifies the text line (flow, block, line) Poppler assigned; words are NFKC-normalised.
export type Word = { str: string; x: number; y: number; w: number; h: number; line: string }

const run = promisify(execFile)

// The eval reads the text layer itself, so key validation never depends on the pipeline's extraction.
export async function pageWords(pdf: string, page: number): Promise<Word[]> {
  const p = String(page)
  const { stdout } = await run('pdftotext', ['-q', '-f', p, '-l', p, '-tsv', pdf, '-'], {
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout
    .split('\n')
    .slice(1)
    .flatMap((row) => {
      const cols = row.split('\t')
      if (cols[0] !== '5' || cols.length < 12) return []
      const [x = 0, y = 0, w = 0, h = 0] = cols.slice(6, 10).map(Number)
      const str = cols.slice(11).join('\t').normalize('NFKC')
      return [{ str, x, y, w, h, line: cols.slice(2, 5).join('.') }]
    })
}
