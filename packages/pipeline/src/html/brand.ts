import { classOf } from '../pdf/face.ts'
import { contrast, fromHex, hex, readableOn, type Rgb } from './color.ts'
import type { Profile, Role, RoleStyle } from './profile.ts'
import { STACKS } from './style.ts'
import { familyFor, fontFaces, type EmbeddedFace, type FontManifest } from './webfonts.ts'

// The document's own look: its faces when open-licensed (embedded), its colours made readable on its background,
// its sizes relative to its text. Accessibility corrects (4.5:1 for every text, 1rem minimum), never replaces.
export type Brand = {
  profile: Profile
  library: readonly FontManifest[]
  faces: readonly EmbeddedFace[]
  background: string
  // Per heading signature, the rule printed under it (rules.ts) and whether it is centred.
  rules: readonly (HeadingRule | null)[]
  // Whether the document draws a hairline between dishes; null when it could not be told.
  dividers: boolean | null
  // The document's other brand colour (its band), used when the heading colour must move far to be readable.
  alternate: string | null
}
export type HeadingRule = { width: number; full: boolean; centered: boolean; color: string }

const AA = 4.5
// A colour that only reaches 4.5:1 after a move from below this contrast has stopped being the brand's colour.
const FAR = 3
// The page's text size; the document's sizes scale from it, within limits per role.
const BASE_REM = 1.0625
const ROLE_RANGE: Record<Role, [number, number]> = {
  name: [1, 1.5],
  price: [1, 1.5],
  desc: [1, 1.25],
  text: [1, 1.25],
  th: [1, 1.25],
}
const MAX_HEADING = 2.4
const MIN_HEADING = 1.125
// A heading is at least this much larger than the dish names, so sections still read as sections.
const OVER_NAME = 1.1
// A display face (stencil, script, ornamental) only where it is large and short: never for running text.
const DISPLAY_MIN_REM = 1.5
const DISPLAY_MAX_WORDS = 6
// Running text in an embedded face is scaled to this x-height, so a small-eyed face (Josefin, Cormorant) reads near
// 16px; names and prices keep their printed proportion (a tall-eyed Oswald would shrink).
const EX_HEIGHT = 0.46
const RUNNING: ReadonlySet<Role> = new Set(['desc', 'text', 'th'])
const MIN_RULE = '2.5rem'
const SYSTEM_TEXT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]
const ROLES: readonly Role[] = ['name', 'price', 'desc', 'text', 'th']
// The base stylesheet's own selectors, so a role wins by order, not by specificity. Card prices keep their size.
const ROLE_SELECTORS: Record<Role, string> = {
  name: '.products.menu .name, .products.cards .name',
  price: '.products.menu .prices, td.num',
  desc: '.products.menu > li > :not(.name, .prices), .products.cards .more > p',
  text: 'section p, section li',
  th: 'th',
}

const rem = (n: number): string => `${String(Math.round(n * 1000) / 1000)}rem`
const within = (v: number, [lo, hi]: [number, number]): number => Math.min(hi, Math.max(lo, v))

// Every styled part of the page with its size (rem) and the vendored family it may be set in (a display face only
// where large and short). One plan for the CSS and for the choice of fonts to embed.
export type Part = {
  style: RoleStyle
  size: number
  heading: boolean
  running?: boolean
  manifest: FontManifest | undefined
}
export function brandPlan(p: Profile, library: readonly FontManifest[]): { roles: Map<Role, Part>; headings: Part[] } {
  const usable = (s: RoleStyle, heading: boolean, size: number): FontManifest | undefined => {
    const m = familyFor(s.face.key, library)
    const display = heading && size >= DISPLAY_MIN_REM && s.words <= DISPLAY_MAX_WORDS
    return m && (m.category === 'text' || display) ? m : undefined
  }
  const roles = new Map<Role, Part>()
  for (const role of ROLES) {
    const s = p.roles[role]
    if (!s) continue
    let size = BASE_REM * within(s.size / p.body, ROLE_RANGE[role])
    // Details never outgrow the product's name (a leaflet prints them large, the name larger still).
    const name = roles.get('name')
    if (role === 'desc' && name) size = Math.min(size, name.size)
    roles.set(role, { style: s, size, heading: false, running: RUNNING.has(role), manifest: usable(s, false, size) })
  }
  const floor = Math.max(MIN_HEADING, (roles.get('name')?.size ?? 0) * OVER_NAME)
  const headings: Part[] = []
  for (const s of p.signatures) {
    const previous = headings.at(-1)?.size ?? MAX_HEADING
    const size = Math.min(previous, Math.max(floor, Math.min(MAX_HEADING, BASE_REM * (s.size / p.body))))
    headings.push({ style: s, size, heading: true, manifest: usable(s, true, size) })
  }
  return { roles, headings }
}

function family(b: Brand, part: Part): string {
  const c = classOf(part.style.face.key)
  const stack = part.heading && c && c !== 'script' ? STACKS[c] : SYSTEM_TEXT
  const m = part.manifest
  if (m && b.faces.some((f) => f.manifest.key === m.key)) return `"${m.family}", ${stack}`
  return part.heading && !c ? 'var(--heading-font, inherit)' : stack
}

// A printed colour made readable on the page; one that reads only after a large move gives way to the document's
// other brand colour when that already reads (BILLA's yellow headline: its green, not an invented mustard).
function colour(c: string, bg: Rgb, alternate: string | null = null): string | null {
  const alt = alternate && contrast(fromHex(alternate), bg) >= AA ? alternate : null
  if (alt && contrast(fromHex(c), bg) < FAR) return alt
  const ok = readableOn(fromHex(c), bg, AA)
  return ok ? hex(ok) : null
}

function declarations(b: Brand, part: Part, bg: Rgb, withColour = true): string {
  const { style: s, size, heading } = part
  const c = withColour ? colour(s.color, bg, b.alternate) : null
  const face = family(b, part)
  return [
    `font-family: ${face}`,
    `font-weight: ${String(s.face.weight)}`,
    `font-style: ${s.face.italic ? 'italic' : 'normal'}`,
    // Headings shrink on a phone: a measured 40px headline would break words at 320px.
    heading
      ? `font-size: clamp(${rem(Math.max(MIN_HEADING, size * 0.75))}, ${rem(size * 0.55)} + 2vw, ${rem(size)})`
      : `font-size: ${rem(size)}`,
    c ? `color: ${c}` : '',
    // Names and prices are paragraphs too: they reset what the running-text rule would otherwise give them.
    part.running && face.startsWith('"')
      ? `font-size-adjust: ex-height ${String(EX_HEIGHT)}`
      : heading
        ? ''
        : 'font-size-adjust: none',
    // Capitals set in a condensed face are printed tracked; other capitals keep the face's own spacing.
    heading && s.caps && classOf(s.face.key) === 'condensed' ? 'letter-spacing: .08em' : '',
    heading ? 'overflow-wrap: normal; hyphens: auto' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

// The accent: the headings' brand colour made readable on the page (see colour), else the text colour.
const accentOf = (b: Brand, bg: Rgb): string =>
  (b.profile.accent ? colour(b.profile.accent, bg, b.alternate) : null) ?? 'var(--fg)'

export function brandCss(b: Brand): string {
  const bg = fromHex(b.background)
  const dark = contrast(bg, WHITE) > contrast(bg, BLACK)
  const p = b.profile
  const plan = brandPlan(p, b.library)
  const roles = ROLES.flatMap((role) => {
    const part = plan.roles.get(role)
    return part ? [`${ROLE_SELECTORS[role]} { ${declarations(b, part, bg)}; }`] : []
  })
  const price = plan.roles.get('price')
  const priceColour = price ? colour(price.style.color, bg, b.alternate) : null
  const cardPrice = price
    ? `.products.cards .price[data-role="current"] { font-family: ${family(b, price)};${priceColour ? ` color: ${priceColour};` : ''} }`
    : ''
  const body = plan.roles.get('desc') ?? plan.roles.get('text')
  const headings = plan.headings.flatMap((part, i) => {
    const sel = `:is(h3, h4, h5, h6).hs-${String(i + 1)}`
    const rule = b.rules[i]
    const align = rule?.centered ? '; text-align: center' : ''
    // Drawn, not written: an empty box with a border (kept in forced colours), read by nobody.
    const width = rule?.full ? '100%' : `max(${MIN_RULE}, ${String(Math.round((rule?.width ?? 0) * 100))}%)`
    const line = rule
      ? [
          `${sel}::after { content: ""; display: block; width: ${width}; border-top: 1px solid ${rule.color}; margin: .35em ${rule.centered ? 'auto' : '0'} 0; }`,
        ]
      : []
    return [`${sel} { ${declarations(b, part, bg)}${align}; }`, ...line]
  })
  // The title takes the style of the document's first heading; its colour stays the band's own.
  const first = [...p.headings]
    .filter(([id]) => id.startsWith('0:'))
    .sort((x, y) => x[0].localeCompare(y[0], 'en', { numeric: true }))[0]
  const top = first ? plan.headings[first[1]] : undefined
  const title = top ? `.band h1 { ${declarations(b, { ...top, size: Math.max(1.5, top.size) }, bg, false)}; }` : ''
  const palette = dark
    ? '--fg: #f2f2f2; --muted: #c4c4c4; --line: #4a4a4a; --panel: #1e1e1e; --focus: #93b4ff; color-scheme: dark;'
    : ''
  return [
    fontFaces(b.faces),
    `:root { --bg: ${b.background}; ${palette} --accent: ${accentOf(b, bg)}; font-synthesis: none; }`,
    body ? `body { font-family: ${family(b, body)}; }` : '',
    '.products.menu > li > :not(.name, .prices) { line-height: 1.45; }',
    'section a, .back a { color: var(--accent); }',
    ...roles,
    cardPrice,
    ...headings,
    title,
    b.dividers === false ? '.products.menu > li { border-bottom: 0; padding: .45rem 0; }' : '',
  ]
    .filter(Boolean)
    .join('\n')
}
