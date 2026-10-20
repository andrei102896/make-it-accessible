// Where each placed one-line text of the printed view starts inside its printed box (fit.ts): pieces of one printed
// row that touch are laid out as ours draws them, the row on the edge its column shares in the print.

// Pieces nearer than this (em) are one row: a word space is ~0.25 em, a tab or a price column far more.
export const GAP = 1
// A printed edge shared with another text's within this (em): the print aligns origins exactly (62 % of left edges
// within 0.01 em on the working set, then a chance tail).
export const EDGE = 0.05

type Box = { x: number; y: number; w: number; h: number }
// Px in the page's container. `drawn`: our letters' extent; `icon`: a drawing kept in the backdrop that the text
// must meet (its first drawing's printed and drawn left edge, its last's right edge); `price`: stays where placed;
// a wrapped text is only a column.
export type RowText = {
  page: number
  printed: Box
  drawn: { x: number; w: number }
  em: number
  nowrap: boolean
  icon: { printed: number; drawn: number; end: { printed: number; drawn: number } } | null
  price: boolean
}
type Edge = 'left' | 'center' | 'right'

// Per text, where our letters should start (px in its page) or null to leave it as placed.
export function rowStarts(texts: readonly RowText[]): (number | null)[] {
  const out: (number | null)[] = texts.map(() => null)
  for (const page of new Set(texts.map((t) => t.page))) {
    const on = texts.flatMap((t, i) => (t.page === page ? [i] : []))
    const chains = chainsOf(
      on.filter((i) => texts[i]?.nowrap === true),
      texts,
    )
    const extent = (c: readonly number[]): [number, number] => {
      const first = at(texts, c[0])
      const last = at(texts, c.at(-1))
      return [first.printed.x, last.printed.x + last.printed.w]
    }
    // Every other text is a column edge: a chain by its printed extent, a wrapped text by its box.
    const columns: { ids: number[]; box: Box; span: [number, number] }[] = [
      ...chains.map((c) => ({ ids: c, box: at(texts, c[0]).printed, span: extent(c) })),
      ...on
        .filter((i) => !at(texts, i).nowrap)
        .map((i) => {
          const b = at(texts, i).printed
          const span: [number, number] = [b.x, b.x + b.w]
          return { ids: [i], box: b, span }
        }),
    ]
    for (const c of chains) {
      const [left, right] = extent(c)
      const em = Math.min(...c.map((i) => at(texts, i).em))
      const own = at(texts, c[0]).printed
      const others = columns.filter(
        (o) => !o.ids.includes(c[0] ?? -1) && !sameRow(o.box, own) && o.span[0] < right && left < o.span[1],
      )
      const edge = edgeOf(
        [left, right],
        others.map((o) => o.span),
        EDGE * em,
      )
      // Our pieces in a row, each after the one before at the printed gap.
      const offsets: number[] = []
      let x = 0
      c.forEach((i, k) => {
        const t = at(texts, i)
        const prev = k ? at(texts, c[k - 1]) : null
        if (prev) x += prev.drawn.w + (t.printed.x - (prev.printed.x + prev.printed.w))
        offsets.push(x)
      })
      const width = (offsets.at(-1) ?? 0) + at(texts, c.at(-1)).drawn.w
      const start = edge === 'left' ? left : edge === 'right' ? right - width : (left + right - width) / 2
      const starts = offsets.map((o) => start + o)
      // A row's fixed points: the column edge it shares (its first piece on a left edge, its last on a right one), a
      // drawing the backdrop keeps (the piece meets it; one ending on a drawing ends where it is printed) and a price
      // (it stays where placed: a price away from its place misinforms). The rest flow from the nearest, before on a tie.
      const fixed = c.flatMap((i, j) => {
        const t = at(texts, i)
        const end = t.drawn.x + t.drawn.w
        if (t.icon) {
          const from = t.icon.printed - (t.icon.drawn - t.drawn.x)
          return [
            { j, start: from, end: Math.abs(t.icon.end.drawn - end) <= 1 ? t.icon.end.printed : from + t.drawn.w },
          ]
        }
        return t.price ? [{ j, start: t.drawn.x, end }] : []
      })
      const last = c.length - 1
      const edgeAt =
        edge === 'left'
          ? { j: 0, start: left }
          : edge === 'right'
            ? { j: last, start: right - at(texts, c[last]).drawn.w }
            : null
      const anchors =
        edgeAt && !fixed.some((a) => a.j === edgeAt.j)
          ? [...fixed, { ...edgeAt, end: edgeAt.start + at(texts, c[edgeAt.j]).drawn.w }]
          : fixed
      c.forEach((_, j) => {
        const from = anchors.reduce<(typeof anchors)[number] | null>(
          (best, a) => (!best || Math.abs(a.j - j) < Math.abs(best.j - j) ? a : best),
          null,
        )
        if (!from || from.j === j) starts[j] = from?.start ?? starts[j] ?? 0
        else {
          const w = at(texts, c[from.j]).drawn.w
          // After the fixed point, from its end; before it, back from its start.
          starts[j] =
            j > from.j
              ? from.end + (offsets[j] ?? 0) - (offsets[from.j] ?? 0) - w
              : from.start + (offsets[j] ?? 0) - (offsets[from.j] ?? 0)
        }
      })
      // Our letters never leave their own printed box: a word's place is printed (the gate weighs it there); a narrower
      // stand-in's slack stays inside it. One wider than its box stays where it is drawn (from the box's left).
      c.forEach((i, j) => {
        const t = at(texts, i)
        const [lo, hi] = [t.printed.x, t.printed.x + t.printed.w - t.drawn.w]
        out[i] = hi < lo ? t.drawn.x : Math.min(hi, Math.max(lo, starts[j] ?? lo))
      })
    }
  }
  return out
}

const at = (texts: readonly RowText[], i: number | undefined): RowText => {
  const t = i === undefined ? undefined : texts[i]
  if (!t) throw new Error(`no placed text ${String(i)}`)
  return t
}
const sameRow = (a: Box, b: Box): boolean =>
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= 0.5 * Math.min(a.h, b.h)

// One-line texts on one printed row, left to right, linked where the gap between them is under GAP em.
function chainsOf(ids: readonly number[], texts: readonly RowText[]): number[][] {
  const sorted = [...ids].sort((a, b) => at(texts, a).printed.x - at(texts, b).printed.x)
  const chains: number[][] = []
  for (const i of sorted) {
    const t = at(texts, i)
    const chain = chains.find((c) => {
      const last = at(texts, c.at(-1))
      const gap = t.printed.x - (last.printed.x + last.printed.w)
      return sameRow(last.printed, t.printed) && gap >= -0.1 * t.em && gap <= GAP * Math.min(t.em, last.em)
    })
    if (chain) chain.push(i)
    else chains.push([i])
  }
  return chains
}

// The edge the most columns share with this extent; a tie or none keeps it centred, as it was placed.
function edgeOf([left, right]: [number, number], others: readonly [number, number][], tol: number): Edge {
  const count = (f: (s: [number, number]) => number): number =>
    others.filter((o) => Math.abs(f(o) - f([left, right])) <= tol).length
  const tally: [Edge, number][] = [
    ['left', count((s) => s[0])],
    ['right', count((s) => s[1])],
    ['center', count((s) => (s[0] + s[1]) / 2)],
  ]
  const best = Math.max(...tally.map(([, n]) => n))
  const winners = tally.filter(([, n]) => n === best).map(([e]) => e)
  return best === 0 || winners.length > 1 ? 'center' : (winners[0] ?? 'center')
}
