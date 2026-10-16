import type { Profile } from '@make-it-accessible/pipeline/html/profile'
import { priceInline, unionOf } from '@make-it-accessible/pipeline/html/profile'
import { shapesOf } from '@make-it-accessible/pipeline/html/shapes'
import { familyFor, type FontManifest } from '@make-it-accessible/pipeline/html/webfonts'
import type { Block, Item, PageStructure } from '@make-it-accessible/pipeline/model/schema'
import type { Box, Extraction, Run } from '@make-it-accessible/pipeline/pdf/types'

// Measured facts about one document, for the layout wiki (docs/wiki): what the PDF prints and how we read it.
export type Page = { structure: PageStructure; extraction: Extraction }

// A list wider than this share of the page is a full-width row; narrower lists side by side form columns.
const FULL_WIDTH = 0.6

const cited = (e: Extraction, src: readonly (readonly [number, number])[]): Run[] =>
  src.flatMap(([from, to]) => e.runs.slice(from, to + 1))

const items = (blocks: readonly Block[]): Item[] => blocks.flatMap((b) => (b.kind === 'products' ? b.items : []))

// How many columns of lists each page prints: narrow lists whose x-ranges do not overlap stand side by side.
export function columnsPerPage(pages: readonly Page[]): number[] {
  return pages.map(({ structure, extraction: e }) => {
    const ranges = structure.blocks.flatMap((b) => {
      if (b.kind !== 'products') return []
      const box = unionOf(b.items.flatMap((it) => cited(e, [...it.name.src, ...it.prices.flatMap((p) => p.src)])))
      return box && box.w / e.width <= FULL_WIDTH ? [[box.x / e.width, (box.x + box.w) / e.width] as const] : []
    })
    const columns: [number, number][] = []
    for (const [x0, x1] of ranges.sort((a, b) => a[0] - b[0])) {
      const last = columns.at(-1)
      if (last && x0 < last[1]) last[1] = Math.max(last[1], x1)
      else columns.push([x0, x1])
    }
    return Math.max(1, columns.length)
  })
}

// Where prices are printed: right after the name, or pushed to the right of the column.
export function pricePlacement(pages: readonly Page[]): { inline: number; right: number } {
  const out = { inline: 0, right: 0 }
  for (const { structure, extraction: e } of pages)
    for (const it of items(structure.blocks)) {
      const name = unionOf(cited(e, it.name.src))
      const price = unionOf(cited(e, it.prices[0]?.src ?? []))
      if (!name || !price) continue
      if (priceInline(name, price)) out.inline++
      else out.right++
    }
  return out
}

// How the menu lists are printed: one dish per line (`wide`), the description running on from the name (`runOn`).
export function listShapes(pages: readonly Page[]): { lists: number; wide: number; runOn: number } {
  const out = { lists: 0, wide: 0, runOn: 0 }
  for (const p of pages)
    for (const s of shapesOf(p).values()) {
      out.lists++
      if (s.wide) out.wide++
      if (s.runOn) out.runOn++
    }
  return out
}

export type FontUse = { family: string; chars: number; roles: string; standIn: string | null }

// The printed families by characters, with the vendored family that stands in for each, if any.
export function fontTally(
  pages: readonly Page[],
  profile: Profile | null,
  library: readonly FontManifest[],
): FontUse[] {
  const chars = new Map<string, number>()
  for (const { extraction } of pages)
    for (const r of extraction.runs) if (r.font) chars.set(r.font.key, (chars.get(r.font.key) ?? 0) + r.str.length)
  const roleKeys = new Map<string, string[]>()
  if (profile) {
    for (const [role, s] of Object.entries(profile.roles))
      roleKeys.set(s.face.key, [...(roleKeys.get(s.face.key) ?? []), role])
    profile.signatures.forEach((s, i) =>
      roleKeys.set(s.face.key, [...(roleKeys.get(s.face.key) ?? []), `hs-${String(i + 1)}`]),
    )
  }
  return [...chars]
    .sort((a, b) => b[1] - a[1])
    .map(([family, n]) => ({
      family,
      chars: n,
      roles: (roleKeys.get(family) ?? []).join(' '),
      standIn: familyFor(family, library)?.family ?? null,
    }))
}

// Dietary legends and codes as printed: "(V) VEGAN" entries and codes in parentheses after names or prices.
export function dietaryCodes(pages: readonly Page[]): { legendEntries: number; codedLines: number } {
  const text = pages.map((p) => p.extraction.runs.map((r) => r.str).join(' ')).join('\n')
  const legendEntries = (text.match(/\((?:V|VO|VG|VE|GF|GFO|DF|N)\)\s+[A-Z][A-Za-z ]{3,}/g) ?? []).length
  const codedLines = (text.match(/\((?:V|VO|VG|VE|GF|GFO|DF|N)(?:,\s*(?:V|VO|VG|VE|GF|GFO|DF|N))*,?\s*\)/g) ?? [])
    .length
  // A legend entry's own code is not a coded line.
  return { legendEntries, codedLines: codedLines - legendEntries }
}

// The largest printed text and the body size: how big the title is, relative.
export function titleScale(
  pages: readonly Page[],
  profile: Profile | null,
): { body: number; largest: number; words: string } {
  const runs = pages.flatMap((p) => p.extraction.runs.filter((r) => r.font))
  const largest = Math.max(0, ...runs.map((r) => r.font?.size ?? 0))
  const words = runs
    .filter((r) => r.font?.size === largest)
    .map((r) => r.str)
    .join(' ')
    .slice(0, 60)
  return { body: profile?.body ?? 0, largest, words }
}

export const boxShare = (box: Box, e: Extraction): number => Math.round((box.w / e.width) * 100)
