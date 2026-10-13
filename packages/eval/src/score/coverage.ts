import { norm } from '@make-it-accessible/pipeline/text/normalize'
import { ledger } from '../ledger.ts'
import type { Word } from '../words.ts'
import type { Coverage } from './types.ts'

// Single letters set with tracking ("E S M A R A") join into one word; so do words split at a line-end hyphen.
const TRACKED = 0.35
const MIN_LENGTH = 3
const SAMPLE = 10
const BREAK = '\u0000'

const tokensOf = (text: string): string[] =>
  norm(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= MIN_LENGTH && /\p{L}/u.test(t))

// Words of the text layer a reader should get, prices and unmapped glyphs left out (C2 scores prices).
export function pageTokens(words: readonly Word[], excluded: readonly string[]): string[] {
  const money = new Set(ledger(words).flatMap((o) => o.words))
  const parts: string[] = []
  words.forEach((w, i) => {
    const prev = words[i - 1]
    if (money.has(i) || w.str.includes('\ufffd')) {
      parts.push(BREAK)
      return
    }
    const tracked =
      prev?.line === w.line && prev.str.length === 1 && w.str.length === 1 && w.x - (prev.x + prev.w) <= TRACKED * w.h
    const hyphenated = prev !== undefined && prev.line !== w.line && /[-\u00ad]$/.test(prev.str)
    const last = parts.at(-1)
    if (last !== undefined && last !== BREAK && (tracked || hyphenated))
      parts[parts.length - 1] = last.replace(/[-\u00ad]$/, '') + w.str
    else parts.push(w.str)
  })
  // Both sides split at the same characters, so "Bio-Erbsen" is two words on the page and in the output.
  const tokens = parts.filter((p) => p !== BREAK).flatMap(tokensOf)
  for (const t of excluded.flatMap(tokensOf)) {
    const at = tokens.indexOf(t)
    if (at >= 0) tokens.splice(at, 1)
  }
  return tokens
}

// Share of the page's words found in the output, one to one (order is C1's job: the text stream is not reading order).
export function coverage(tokens: readonly string[], published: string): Coverage {
  const out = tokensOf(published)
  const free = new Map<string, number>()
  for (const t of out) free.set(t, (free.get(t) ?? 0) + 1)
  const missing = tokens.filter((t) => {
    const n = free.get(t) ?? 0
    if (n > 0) free.set(t, n - 1)
    return n === 0
  })
  const total = tokens.length || 1
  return {
    tokens: tokens.length,
    missing: missing.length,
    coverage: (tokens.length - missing.length) / total,
    sample: missing.slice(0, SAMPLE),
  }
}
