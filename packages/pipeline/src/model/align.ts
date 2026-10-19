import type { Box, Run } from '../pdf/types.ts'
import { canon } from '../text/normalize.ts'

// A scan is read twice, by OCR (the page's runs) and by the model, never shown OCR's strings. Each text the model
// wrote is found among OCR's words: where both read the same, it cites them; where they differ, it cites OCR's
// nearest reading with the model's as `text`, which the validator holds; where nothing is near, it stays `seen`.

type Span = { from: number; to: number; box: Box; exact: boolean }
type Tok = { t: string; from: number; to: number }
type Raw = Record<string, unknown>

// Punctuation around a word is not compared ("....12", "$12.95" = "12.95"); inside it, it is ("12.5" ≠ "125").
const token = (s: string): string => canon(s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
const tokens = (s: string): string[] => s.split(/\s+/).map(token).filter(Boolean)
const spells = (s: string): boolean => /[\p{L}\p{N}]/u.test(s)
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.map((x: unknown) => x) : [])
const withoutSeen = (v: Raw): Raw => Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'seen'))
const seenOf = (v: unknown): string | null => (isRaw(v) && typeof v.seen === 'string' ? v.seen : null)

function union(runs: readonly Run[], from: number, to: number): Box {
  const part = runs.slice(from, to + 1)
  const x = Math.min(...part.map((r) => r.box.x))
  const y = Math.min(...part.map((r) => r.box.y))
  const right = Math.max(...part.map((r) => r.box.x + r.box.w))
  const bottom = Math.max(...part.map((r) => r.box.y + r.box.h))
  return { x, y, w: right - x, h: bottom - y }
}
// Lines weigh twice as much as columns: a price shares its dish's line far more than its column.
const distance = (a: Box, b: Box): number =>
  Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), 2 * (a.y + a.h / 2 - (b.y + b.h / 2)))

// OCR's words as tokens per block in its reading order; a word broken by a line-end hyphen is joined.
function blocksOf(runs: readonly Run[]): Tok[][] {
  const blocks = new Map<number, Tok[]>()
  runs.forEach((r, i) => {
    const t = token(r.str)
    if (!t) return
    const list = blocks.get(r.flow) ?? []
    const prev = list.at(-1)
    const last = prev ? runs[prev.to] : undefined
    if (prev && last && last.str.endsWith('-') && last.line !== r.line) {
      prev.t += t
      prev.to = i
    } else list.push({ t, from: i, to: i })
    blocks.set(r.flow, list)
  })
  return [...blocks.values()]
}

// Characters in common, in order, over the longer reading (0..1).
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  let prev = new Array<number>(b.length + 1).fill(0)
  for (const ca of a) {
    const row = [0]
    for (let j = 1; j <= b.length; j++)
      row.push(ca === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, row[j - 1] ?? 0))
    prev = row
  }
  return (prev[b.length] ?? 0) / Math.max(a.length, b.length)
}
// A differing reading is OCR's at the same place only when it shares most of its letters (else nothing is near).
const SAME_PLACE = 0.5

export function alignScan(raw: unknown, runs: readonly Run[]): Raw {
  const blocks = blocksOf(runs)
  const used = new Set<number>()
  let anchor: Box | null = null

  const place = (seen: string, near: Box | null): Span | null => {
    const want = tokens(seen)
    if (!want.length) return null
    const found: Span[] = []
    const close: (Span & { score: number })[] = []
    for (const list of blocks)
      for (let s = 0; s + want.length <= list.length; s++) {
        const part = list.slice(s, s + want.length)
        const from = part[0]?.from ?? 0
        const to = part.at(-1)?.to ?? 0
        const exact = part.every((p, k) => p.t === want[k])
        const score = exact ? 1 : similarity(part.map((p) => p.t).join(' '), want.join(' '))
        const span = { from, to, box: union(runs, from, to), exact }
        if (exact) found.push(span)
        else if (score >= SAME_PLACE) close.push({ ...span, score })
      }
    const free = (sp: Span): boolean => ![...Array(sp.to - sp.from + 1).keys()].some((k) => used.has(sp.from + k))
    const pick = (list: Span[]): Span | undefined => {
      const pool = list.some(free) ? list.filter(free) : list
      const ref = near ?? anchor
      return ref ? [...pool].sort((a, b) => distance(a.box, ref) - distance(b.box, ref))[0] : pool[0]
    }
    const best = pick(found) ?? pick(close)
    if (!best) return null
    // Marks that spell nothing beside it on its line ("$", leader dots) belong to it.
    let { from, to } = best
    const mark = (i: number): boolean => {
      const r = runs[i]
      return r !== undefined && !spells(r.str) && !used.has(i) && r.line === runs[best.from]?.line
    }
    while (mark(from - 1)) from--
    while (mark(to + 1)) to++
    for (let i = from; i <= to; i++) used.add(i)
    anchor = best.box
    return { ...best, from, to }
  }

  const text = (v: unknown, near: Box | null = null): unknown => {
    const seen = seenOf(v)
    if (seen === null) return v
    const sp = place(seen, near)
    return sp ? { src: [[sp.from, sp.to]], ...(sp.exact ? {} : { text: seen }) } : v
  }

  const item = (v: Raw): Raw => {
    const name = seenOf(v.name) ?? ''
    const prices = Array.isArray(v.prices) ? v.prices : []
    const at = place(name, null)
    // A dish whose name OCR does not read anywhere is kept as read from the image (held), never dropped.
    if (!at) {
      const read = [name, ...prices.map(seenOf)].filter(Boolean).join(' ')
      return { kind: 'paragraph', text: { seen: read }, uncertain: 'the name is not in the OCR reading' }
    }
    const doubts: string[] = []
    const out: Raw = { ...v, name: { src: [[at.from, at.to]], ...(at.exact ? {} : { text: name }) } }
    out.prices = prices.flatMap((p: unknown) => {
      const seen = seenOf(p)
      if (!isRaw(p) || seen === null) return [p]
      const sp = place(seen, at.box)
      if (!sp) {
        doubts.push(`price "${seen}" is not in the OCR reading`)
        return []
      }
      const rest = withoutSeen(p)
      const qualifier = rest.qualifier === undefined ? {} : { qualifier: text(rest.qualifier, at.box) }
      return [{ ...rest, ...qualifier, src: [[sp.from, sp.to]], ...(sp.exact ? {} : { text: seen }) }]
    })
    if (v.unit !== undefined) out.unit = text(v.unit, at.box)
    if (Array.isArray(v.details)) out.details = v.details.flatMap((d) => block(d, at.box))
    if (doubts.length) out.uncertain = [v.uncertain, ...doubts].filter(Boolean).join('; ')
    return out
  }

  const cell = (c: unknown): unknown => {
    if (!isRaw(c)) return c
    const out: Raw = { ...c }
    if (c.text !== undefined) out.text = text(c.text)
    if (Array.isArray(c.prices))
      out.prices = c.prices.map((p: unknown) => {
        const seen = seenOf(p)
        const sp = seen === null ? null : place(seen, anchor)
        if (!isRaw(p) || !sp || seen === null) return p
        return { ...withoutSeen(p), src: [[sp.from, sp.to]], ...(sp.exact ? {} : { text: seen }) }
      })
    return out
  }

  function block(b: unknown, near: Box | null = null): unknown[] {
    if (!isRaw(b)) return [b]
    if (near) anchor = near
    switch (b.kind) {
      case 'heading':
      case 'paragraph':
        return [{ ...b, text: text(b.text) }]
      case 'list':
        return [{ ...b, items: list(b.items).map((t) => text(t)) }]
      case 'table':
        return [
          {
            ...b,
            ...(b.caption === undefined ? {} : { caption: text(b.caption) }),
            rows: list(b.rows).map((r) => list(r).map(cell)),
          },
        ]
      case 'products': {
        // A dish kept as read from the image is a paragraph after its list: a list holds dishes only.
        const all = list(b.items).map((i) => (isRaw(i) ? item(i) : i))
        const dishes = all.filter((i) => !isRaw(i) || i.kind !== 'paragraph')
        const read = all.filter((i) => isRaw(i) && i.kind === 'paragraph')
        return [...(dishes.length ? [{ ...b, items: dishes }] : []), ...read]
      }
      default:
        return [b]
    }
  }

  const page = isRaw(raw) ? raw : {}
  const out = Array.isArray(page.blocks) ? page.blocks.flatMap((b) => block(b)) : []
  const dropped: [number, number][] = []
  for (const d of Array.isArray(page.dropped) ? page.dropped : []) {
    const sp = place(typeof d === 'string' ? d : (seenOf(d) ?? ''), null)
    if (sp) dropped.push([sp.from, sp.to])
  }
  // OCR's marks that spell nothing and belong to no text are not content.
  runs.forEach((r, i) => {
    if (!used.has(i) && !spells(r.str)) dropped.push([i, i])
  })
  return { lang: page.lang, blocks: out, dropped }
}
