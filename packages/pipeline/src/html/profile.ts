import type { Block, Item, PageStructure, TextValue } from '../model/schema.ts'
import type { Box, Extraction, Run } from '../pdf/types.ts'

// The printed style measured from the words each element cites: a role takes its words' dominant face, size and
// colour; a heading takes its own, grouped with headings printed alike, whatever level the model gave it.
export type Face = { key: string; weight: number; italic: boolean }
export type RoleStyle = { face: Face; size: number; color: string; caps: boolean; words: number }
export type Role = 'name' | 'price' | 'desc' | 'text' | 'th'
export type Profile = {
  body: number
  roles: Partial<Record<Role, RoleStyle>>
  // Heading styles, largest first; `headings` maps `${pageIndex}:${path}` to an index here.
  signatures: RoleStyle[]
  headings: Map<string, number>
  accent: string | null
  // Where headings and the items of menu-style lists are printed, for the lines the document draws (rules.ts).
  headingBoxes: { page: number; sig: number; box: Box; key: string }[]
  itemBoxes: { page: number; boxes: Box[] }[]
  // Whether the document prints a dish's price right after its name (Moosewood) rather than at the column's edge.
  pricesInline: boolean
}

// A price starting within this many price heights of the name's end, on the name's line, is printed inline.
const INLINE_GAP = 1.5
export const priceInline = (name: Box, price: Box): boolean =>
  price.x - (name.x + name.w) <= INLINE_GAP * price.h && price.y < name.y + name.h
type Page = { structure: PageStructure; extraction: Extraction }

// Headings printed alike share a style when their sizes differ by at most this (pdftohtml rounds to whole points).
const SAME_SIZE = 1
const MAX_SIGNATURES = 4
const CAPS = 0.9
// A colour this close to grey (spread of its channels) is ink, not a brand colour.
const NEUTRAL_SPREAD = 40

const cites = (t: TextValue | undefined, e: Extraction, hidden: Set<string>): Run[] =>
  t && 'src' in t
    ? t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id) && r.font)
    : []

// The dominant face and colour by characters, the median size, capitals when nearly every letter is one.
export function styleOf(runs: readonly Run[]): RoleStyle | null {
  const tally = new Map<string, { face: Face; color: string; chars: number }>()
  const sizes: number[] = []
  let letters = 0
  let upper = 0
  for (const r of runs) {
    if (!r.font) continue
    const { key, weight, italic } = r.font
    const color = r.color ?? '#000000'
    const k = `${key}|${String(weight)}|${String(italic)}|${color}`
    const seen = tally.get(k) ?? { face: { key, weight, italic }, color, chars: 0 }
    seen.chars += r.str.length
    tally.set(k, seen)
    for (let i = 0; i < r.str.length; i++) sizes.push(r.font.size)
    letters += (r.str.match(/\p{L}/gu) ?? []).length
    upper += (r.str.match(/\p{Lu}/gu) ?? []).length
  }
  const top = [...tally.values()].sort((a, b) => b.chars - a.chars)[0]
  if (!top) return null
  sizes.sort((a, b) => a - b)
  return {
    face: top.face,
    size: sizes[Math.floor(sizes.length / 2)] ?? 0,
    color: top.color,
    caps: letters > 0 && upper / letters >= CAPS,
    words: runs.length,
  }
}

export const unionOf = (runs: readonly Run[]): Box | null =>
  runs.length
    ? runs.reduce<Box>(
        (a, { box: b }) => {
          const x = Math.min(a.x, b.x)
          const y = Math.min(a.y, b.y)
          return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
        },
        runs[0]?.box ?? { x: 0, y: 0, w: 0, h: 0 },
      )
    : null

const neutral = (c: string): boolean => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  return Math.max(r ?? 0, g ?? 0, b ?? 0) - Math.min(r ?? 0, g ?? 0, b ?? 0) < NEUTRAL_SPREAD
}

export function profileOf(pages: readonly Page[]): Profile | null {
  const byRole = new Map<Role, Run[]>()
  const headings: { id: string; style: RoleStyle; runs: Run[]; page: number }[] = []
  const itemBoxes: Profile['itemBoxes'] = []
  const placement = { inline: 0, right: 0 }
  pages.forEach(({ structure, extraction: e }, index) => {
    const hidden = new Set(e.hidden)
    const add = (role: Role, t: TextValue | undefined): void => {
      byRole.set(role, [...(byRole.get(role) ?? []), ...cites(t, e, hidden)])
    }
    const block = (path: string, b: Block, inItem: boolean): void => {
      if (b.kind === 'heading') {
        const runs = cites(b.text, e, hidden)
        const style = styleOf(runs)
        if (style) headings.push({ id: `${String(index)}:${path}`, style, runs, page: index })
      } else if (b.kind === 'paragraph') add(inItem ? 'desc' : 'text', b.text)
      else if (b.kind === 'list')
        b.items.forEach((t) => {
          add('text', t)
        })
      else if (b.kind === 'table')
        b.rows.flat().forEach((cell) => {
          add(cell.header ? 'th' : 'text', cell.text)
          cell.prices?.forEach((p) => {
            add('price', { src: p.src })
          })
        })
      else if (b.kind === 'products') {
        b.items.forEach((item, i) => {
          product(`${path}.items[${String(i)}]`, item)
        })
        if (!b.items.some((it) => it.image)) {
          const boxes = b.items.flatMap((it) => {
            const own = [
              it.name,
              ...it.prices.map((p) => ({ src: p.src })),
              ...it.details.flatMap((d) => (d.kind === 'paragraph' ? [d.text] : [])),
            ]
            const box = unionOf(own.flatMap((t) => cites(t, e, hidden)))
            return box ? [box] : []
          })
          itemBoxes.push({ page: index, boxes })
        }
      }
    }
    const product = (path: string, item: Item): void => {
      add('name', item.name)
      const nameBox = unionOf(cites(item.name, e, hidden))
      const priceBox = item.prices[0] ? unionOf(cites({ src: item.prices[0].src }, e, hidden)) : null
      if (nameBox && priceBox) placement[priceInline(nameBox, priceBox) ? 'inline' : 'right']++
      item.prices.forEach((p) => {
        add('price', { src: p.src })
      })
      item.details.forEach((d, i) => {
        block(`${path}.details[${String(i)}]`, d, true)
      })
    }
    structure.blocks.forEach((b, i) => {
      block(`blocks[${String(i)}]`, b, false)
    })
  })
  const roles: Profile['roles'] = {}
  for (const [role, runs] of byRole) {
    const s = styleOf(runs)
    if (s) roles[role] = s
  }
  const bodyRuns = [...(byRole.get('desc') ?? []), ...(byRole.get('text') ?? [])]
  const body = styleOf(bodyRuns.length ? bodyRuns : pages.flatMap((p) => p.extraction.runs))?.size
  if (!body) return null

  // Signatures: headings with the same face and colour and a size within SAME_SIZE, largest first; beyond
  // MAX_SIGNATURES a heading joins the signature nearest in size.
  const signatures: RoleStyle[] = []
  const ids = new Map<string, number>()
  const sameAs = (a: RoleStyle, b: RoleStyle): boolean =>
    a.face.key === b.face.key &&
    a.face.weight === b.face.weight &&
    a.color === b.color &&
    Math.abs(a.size - b.size) <= SAME_SIZE
  for (const h of [...headings].sort((a, b) => b.style.size - a.style.size)) {
    let at = signatures.findIndex((s) => sameAs(s, h.style))
    if (at === -1 && signatures.length < MAX_SIGNATURES) at = signatures.push(h.style) - 1
    if (at === -1)
      at = signatures.reduce(
        (best, s, i) =>
          Math.abs(s.size - h.style.size) < Math.abs((signatures[best]?.size ?? 0) - h.style.size) ? i : best,
        0,
      )
    const sig = signatures[at]
    if (sig) sig.words = Math.max(sig.words, h.runs.length)
    ids.set(h.id, at)
  }
  const tally = new Map<string, number>()
  for (const h of headings)
    for (const r of h.runs)
      if (r.color && !neutral(r.color)) tally.set(r.color, (tally.get(r.color) ?? 0) + r.str.length)
  const accent = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const headingBoxes = headings.flatMap((h) => {
    const box = unionOf(h.runs)
    const sig = ids.get(h.id)
    return box && sig !== undefined ? [{ page: h.page, sig, box, key: h.id }] : []
  })
  const pricesInline = placement.inline > placement.right
  return { body, roles, signatures, headings: ids, accent, headingBoxes, itemBoxes, pricesInline }
}
