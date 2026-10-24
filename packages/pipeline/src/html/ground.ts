import type { Run } from '../pdf/types.ts'
import type { Drawn, Painted } from './brand.ts'
import { contrast, fromHex, hex, readableOn, sameGround, type Rgb } from './color.ts'
import { FOCUS } from './style.ts'

// The page's colours on a ground of their own: a box's fill (boxes.ts) or a page's ground (backdrop.json `ground`),
// each colour kept and moved by lightness where it does not read, never swapped for another.

const AA = 4.5
const PAGE_TEXT: Rgb = [26, 26, 26]
const NON_TEXT = 3
// A dark document's palette (brand.ts), and a dark page's.
export const DARK = { fg: '#f2f2f2', muted: '#c4c4c4', line: '#4a4a4a', panel: '#1e1e1e', focus: '#93b4ff' }
// One darkness test for boxes and pages: a ground the page's dark text does not read on.
export const darkGround = (c: Rgb): boolean => contrast(c, PAGE_TEXT) < AA

// On a dark ground (Osteria's red, Sarge's black and red) the words take their commonest printed colour at 4.5:1, the
// ground darkening when it cannot move (white); null: neither reads. A light ground has no ink (lightMoves).
export type Paint = { fill: string; ink: string | null }
export function paintOf(ground: string, runs: readonly Run[]): Paint | null {
  const fill = fromHex(ground)
  if (!darkGround(fill)) return { fill: ground, ink: null }
  const tally = new Map<string, number>()
  for (const r of runs) if (r.color) tally.set(r.color, (tally.get(r.color) ?? 0) + r.str.length)
  const printed = fromHex([...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff')
  const ink = readableOn(printed, fill, AA)
  if (ink) return { fill: ground, ink: hex(ink) }
  const moved = readableOn(fill, printed, AA)
  return moved ? { fill: hex(moved), ink: hex(printed) } : null
}

// A painted colour on a light ground: its printed colour where that reads, else moved by lightness, else the colour
// the page shows (Ruth's gold returns to its print on green; Howies' gold darkens a little on cream).
function onLight(p: Painted, fill: Rgb): string {
  const printed = fromHex(p.printed)
  if (contrast(printed, fill) >= AA) return p.printed
  const moved = readableOn(printed, fill, AA) ?? readableOn(fromHex(p.shown), fill, AA)
  return moved ? hex(moved) : 'var(--fg)'
}
// The page's own text, grey and accent on a light ground, always restated so a box never inherits a dark page's (the
// grey falls back to the text colour: Kenny & Ziggy's salmon, #555 at 4.17:1); `:root`'s `var(--fg)` resolves here.
export function onFill(drawn: Drawn, fill: Rgb): string {
  const text = fromHex(drawn.text)
  const fg = hex(contrast(text, fill) >= AA ? text : (readableOn(text, fill, AA) ?? text))
  const muted = readableOn(fromHex(drawn.muted), fill, AA)
  const accent = drawn.accent ? onLight(drawn.accent, fill) : 'var(--fg)'
  return ` --fg: ${fg}; color: ${fg}; --muted: ${muted ? hex(muted) : 'var(--fg)'}; --accent: ${accent};`
}
// Every painted colour again inside `scope`, in the page's order: `:where()` keeps each rule's specificity, so ties
// fall as on the page and a box's rules (later) win inside a coloured page.
function movedOn(drawn: Drawn, scope: string, colourOf: (p: Painted) => string): string[] {
  return drawn.painted.map((p) => {
    const within = topLevel(p.selector).map((s) => `${s}:where(${scope} *)`)
    return `${within.join(', ')} { color: ${colourOf(p)}; }`
  })
}
export const lightMoves = (drawn: Drawn, fill: Rgb, scope: string): string[] =>
  movedOn(drawn, scope, (p) => onLight(p, fill))

// A focus ring at 3:1 on its ground: the light or the dark palette's, else white or black (Stonehouse's #a55b42
// fails both palettes).
export function focusOn(fill: Rgb): string {
  const ok = [FOCUS, DARK.focus].find((c) => contrast(fromHex(c), fill) >= NON_TEXT)
  return ok ?? (contrast([255, 255, 255], fill) >= contrast([0, 0, 0], fill) ? '#ffffff' : '#000000')
}

// `measured`: the page has a backdrop (its ground was read); `fills`: its large panels and filled frames, whose colour
// a ground may be (Gigi's grey panels hold most of its words; its paper is white).
export type PageGround = {
  keyPage: number
  ground: string | null
  measured: boolean
  runs: readonly Run[]
  fills: readonly string[]
}
// The text view's pages printed on a ground of their own (Ruth's green cover, Stonehouse's terracotta page), on
// screen only. A ground every page shares is the document's (Carew), never painted page by page.
export function pagesCss(pages: readonly PageGround[], background: string, drawn: Drawn): string {
  const bg = fromHex(background)
  // Read on the raw grounds, before any page is left out (Carew p2's navy is two half-page panels).
  const measured = pages.filter((p) => p.measured)
  const first = measured[0]?.ground
  if (first && measured.every((p) => p.ground && sameGround(fromHex(p.ground), fromHex(first)))) return ''
  const own = pages.flatMap((p) => {
    const g = p.ground && fromHex(p.ground)
    if (!g || sameGround(g, bg) || p.fills.some((f) => sameGround(fromHex(f), g))) return []
    return [{ ...p, ground: hex(g) }]
  })
  const rules = own.flatMap((p) => {
    const scope = `section[data-page="${String(p.keyPage)}"]`
    const paint = paintOf(p.ground, p.runs)
    if (!paint) return []
    const fill = fromHex(paint.fill)
    const ground = `background: ${paint.fill}; --bg: ${paint.fill}; --focus: ${focusOn(fill)};`
    const look = [
      `${scope} { padding: 1rem clamp(.75rem, 3vw, 1.5rem); border-radius: .5rem; }`,
      `${scope} > h2 { border-top: 0; }`,
      `@media (max-width: 40rem) { ${scope} { margin-inline: -1rem; border-radius: 0; } }`,
    ]
    const { ink } = paint
    if (ink === null)
      return [`${scope} { ${ground}${onFill(drawn, fill)} }`, ...look, ...lightMoves(drawn, fill, scope)]
    const dark = `--fg: ${ink}; color: ${ink}; --muted: ${ink}; --accent: ${ink}; --line: ${DARK.line}; --panel: ${DARK.panel}; color-scheme: dark;`
    // A colour printed light enough keeps its print; the rest take the page's ink.
    const onDark = (c: Painted): string => (contrast(fromHex(c.printed), fill) >= AA ? c.printed : ink)
    return [`${scope} { ${ground} ${dark} }`, ...look, ...movedOn(drawn, scope, onDark)]
  })
  return rules.length ? `@media screen {\n${rules.join('\n')}\n}` : ''
}

// A selector list split at its own commas, not those inside :not() or :is().
export function topLevel(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(list.slice(from).trim())
  return out
}
