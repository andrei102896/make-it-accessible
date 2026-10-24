import { classOf } from '../pdf/face.ts'
import { contrast, distanceOk, fromHex, hex, readableOn, type Rgb } from './color.ts'
import { INK_DISTINCT, inkLike, ROLES, type Profile, type Role, type RoleStyle } from './profile.ts'
import { mastheadCss, SEEN_TITLE_RATIO } from './masthead.ts'
import { DARK } from './ground.ts'
import { MUTED, STACKS } from './style.ts'
import { familyFor, fontFaces, uprightIn, type EmbeddedFace, type FontManifest } from './webfonts.ts'

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
  ornaments: readonly BrandOrnament[]
  // The header's name heading (profile key) and logo width (share of the page), set by the renderer (layout.ts).
  masthead?: { key: string | null; logoShare: number | null }
  // The most columns any page prints side by side (layout.ts), set by the renderer.
  columns?: number
  // The pages' key numbers in order (section[data-page]), set by the renderer: per-page role overrides target them.
  pages?: number[]
}
export type HeadingRule = { width: number; full: boolean; centered: boolean; color: string }
// A drawing printed under headings (ornament.ts): an alpha mask (base64 PNG) painted in its printed colour, sized in
// ems of its heading so it keeps the printed proportion on a phone; `headings` are profile keys.
export type BrandOrnament = {
  mask: string
  em: number
  aspect: number
  centered: boolean
  color: string
  headings: readonly string[]
}

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
// Running text in a small-eyed embedded face (Josefin, Cormorant: x-height below this) is scaled up to it, so it
// reads near 16px; a tall-eyed face, names and prices keep their size.
const EX_HEIGHT = 0.46
const RUNNING: ReadonlySet<Role> = new Set(['desc', 'text', 'th'])
const MIN_RULE = '2.5rem'
const SYSTEM_TEXT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const WHITE: Rgb = [255, 255, 255]
const LINKS = 'section a, .back a'
const BLACK: Rgb = [0, 0, 0]
// The base stylesheet's own selectors, so a role wins by order, not by specificity. Card prices keep their size.
const ROLE_SELECTORS: Record<Role, string> = {
  name: '.products.menu .name, .products.cards .name',
  price: '.products.menu .prices, .products.menu .price[data-role="current"], td.num',
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
  // A heading's smallest size on a phone: still above the dish names.
  floor?: number
  manifest: FontManifest | undefined
}
// `apart` is a signature that keeps its own scale (the masthead) and so never sets the top of the compression.
const usableFor = (s: RoleStyle, library: readonly FontManifest[]): FontManifest | undefined => {
  const m = familyFor(s.face.key, library)
  return m?.category === 'text' ? m : undefined
}

export function brandPlan(
  p: Profile,
  library: readonly FontManifest[],
  apart?: number,
): { roles: Map<Role, Part>; headings: Part[] } {
  // A display face (script, hand-print, stencil) only where it is large and short, or on dish names set in it.
  const usable = (s: RoleStyle, heading: boolean, size: number, role?: Role): FontManifest | undefined => {
    const m = familyFor(s.face.key, library)
    const display = (heading && size >= DISPLAY_MIN_REM && s.words <= DISPLAY_MAX_WORDS) || role === 'name'
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
    roles.set(role, {
      style: s,
      size,
      heading: false,
      running: RUNNING.has(role),
      manifest: usable(s, false, size, role),
    })
  }
  const floor = Math.max(MIN_HEADING, (roles.get('name')?.size ?? 0) * OVER_NAME)
  const headings: Part[] = []
  // Printed sizes are compressed into [floor, MAX_HEADING], not clipped, so distinct levels stay distinct.
  const printed = p.signatures.map((s, i) => (i === apart ? floor : Math.max(floor, BASE_REM * (s.size / p.body))))
  const top = Math.max(floor, ...printed)
  const squeeze = top > MAX_HEADING ? (MAX_HEADING - floor) / (top - floor) : 1
  for (const [i, s] of p.signatures.entries()) {
    const previous = headings.at(-1)?.size ?? MAX_HEADING
    const size = Math.min(previous, floor + ((printed[i] ?? floor) - floor) * squeeze)
    headings.push({ style: s, size, heading: true, floor, manifest: usable(s, true, size) })
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
  // On a light page a dark ink with a tinge of colour prints black: it takes the text colour, not a tint.
  if (inkLike(fromHex(c)) && contrast(bg, BLACK) > contrast(bg, WHITE)) return null
  const alt = alternate && contrast(fromHex(alternate), bg) >= AA ? alternate : null
  if (alt && contrast(fromHex(c), bg) < FAR) return alt
  const ok = readableOn(fromHex(c), bg, AA)
  return ok ? hex(ok) : null
}

// No italic: each word carries its own (segments.ts `fi`), save text with no runs of its own (`italic`: the band title).
function declarations(b: Brand, part: Part, c: string | null, italic: boolean | null = null): string {
  const { style: s, size, heading } = part
  const face = family(b, part)
  return [
    `font-family: ${face}`,
    `font-weight: ${String(s.face.weight)}`,
    italic === null ? '' : `font-style: ${italic ? 'italic' : 'normal'}`,
    // Headings shrink on a phone: a measured 40px headline would break words at 320px; a display face never below
    // the size it was admitted at.
    heading
      ? `font-size: clamp(${rem(Math.min(size, Math.max(part.floor ?? MIN_HEADING, part.manifest?.category === 'display' ? DISPLAY_MIN_REM : 0, size * 0.75)))}, ${rem(size * 0.55)} + 2vw, ${rem(size)})`
      : `font-size: ${rem(size)}`,
    c ? `color: ${c}` : '',
    // Names and prices are paragraphs too: they reset what the running-text rule would otherwise give them.
    part.running && face.startsWith('"') && (part.manifest?.xHeight ?? EX_HEIGHT) < EX_HEIGHT
      ? `font-size-adjust: ex-height ${String(EX_HEIGHT)}`
      : heading
        ? ''
        : 'font-size-adjust: none',
    // Capitals set in a condensed face are printed tracked; other capitals keep the face's own spacing.
    heading && s.caps && classOf(s.face.key) === 'condensed' ? 'letter-spacing: .08em' : '',
    // The page sets font-synthesis: none; a small-caps face needs the synthesis back (Google files carry no smcp).
    s.smallCaps ? 'font-variant-caps: small-caps; font-synthesis: small-caps' : '',
    // Lines break between words; a word wider than the screen is the only one split, and never hyphenated.
    heading ? 'overflow-wrap: break-word; hyphens: manual' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

// The masthead keeps the printed ratio to the body (bounded), outside the section headings' compression when no
// section heading shares its signature.
function planOf(b: Brand): { plan: ReturnType<typeof brandPlan>; mastSig: number | undefined } {
  const mastSig = b.masthead?.key ? b.profile.headings.get(b.masthead.key) : undefined
  const solo = mastSig !== undefined && [...b.profile.headings.values()].filter((v) => v === mastSig).length === 1
  return { plan: brandPlan(b.profile, b.library, solo ? mastSig : undefined), mastSig }
}

const CARD_PRICE = '.products.cards .price[data-role="current"]'
const headingSelector = (i: number): string => `:is(h3, h4, h5, h6).hs-${String(i + 1)}`
const inkSelector = (c: string): string => `.ink-${c.slice(1)}, .products.menu .price.ink-${c.slice(1)}`
export type Painted = { selector: string; printed: string; shown: string }
export type Drawn = { text: string; muted: string; accent: Painted | null; painted: Painted[] }
// Every printed colour the text view paints, by the selector painting it, as shown on the page (made readable there);
// `text` and `muted` are the page's own as shown. A box moves them again on its fill (boxes.ts).
export function paintedOf(b: Brand): Drawn {
  const bg = fromHex(b.background)
  const dark = contrast(bg, WHITE) > contrast(bg, BLACK)
  const { plan } = planOf(b)
  const painted: Painted[] = []
  const add = (selector: string, printed: string, shown: string | null): void => {
    if (shown) painted.push({ selector, printed, shown })
  }
  for (const role of ROLES) {
    const part = plan.roles.get(role)
    if (part) add(ROLE_SELECTORS[role], part.style.color, colour(part.style.color, bg, b.alternate))
  }
  const price = plan.roles.get('price')
  if (price) add(CARD_PRICE, price.style.color, colour(price.style.color, bg, b.alternate))
  plan.headings.forEach((h, i) => {
    add(headingSelector(i), h.style.color, colour(h.style.color, bg, b.alternate))
  })
  const body = plan.roles.get('desc') ?? plan.roles.get('text')
  const text = (body ? colour(body.style.color, bg, b.alternate) : null) ?? (dark ? DARK.fg : '#1a1a1a')
  // Inline brand colours made readable on the page, never swapped for another colour; one that lands on the text
  // colour is left to it. On a menu price the class outranks the role rules.
  for (const c of b.profile.inks) {
    const ok = readableOn(fromHex(c), bg, AA)
    if (ok && distanceOk(ok, fromHex(text)) >= INK_DISTINCT) add(inkSelector(c), c, hex(ok))
  }
  if (b.profile.accent) add(LINKS, b.profile.accent, colour(b.profile.accent, bg, b.alternate))
  return { text, muted: dark ? DARK.muted : MUTED, accent: painted.find((x) => x.selector === LINKS) ?? null, painted }
}

export function brandCss(b: Brand, drawn: Drawn = paintedOf(b)): string {
  const bg = fromHex(b.background)
  const dark = contrast(bg, WHITE) > contrast(bg, BLACK)
  const p = b.profile
  const { plan, mastSig } = planOf(b)
  const { painted } = drawn
  const shown = (selector: string): string | null => painted.find((x) => x.selector === selector)?.shown ?? null
  const roles = ROLES.flatMap((role) => {
    const part = plan.roles.get(role)
    return part
      ? [
          `${ROLE_SELECTORS[role]} { ${declarations(b, part, shown(ROLE_SELECTORS[role]))}; }`,
          ...uprightIn(part.manifest, b.faces, `:is(${ROLE_SELECTORS[role]})`),
        ]
      : []
  })
  const price = plan.roles.get('price')
  const priceColour = shown(CARD_PRICE)
  const cardPrice = price
    ? `${CARD_PRICE} { font-family: ${family(b, price)}; font-size-adjust: none;${priceColour ? ` color: ${priceColour};` : ''} }`
    : ''
  // A page that prints a role in another weight or face than the document keeps its own (Bernini); its words their style.
  const perPage = (b.pages ?? []).flatMap((keyPage, i) =>
    ROLES.flatMap((role) => {
      const own = p.pageRoles?.[i]?.[role]
      const doc = p.roles[role]
      if (!own || !doc) return []
      if (own.face.key === doc.face.key && own.face.weight === doc.face.weight) return []
      const part = {
        style: own,
        size: plan.roles.get(role)?.size ?? BASE_REM,
        heading: false,
        manifest: usableFor(own, b.library),
      }
      const face = family(b, part)
      return [
        `section[data-page="${String(keyPage)}"] :is(${ROLE_SELECTORS[role]}) { font-family: ${face}; font-weight: ${String(own.face.weight)}; }`,
      ]
    }),
  )
  const body = plan.roles.get('desc') ?? plan.roles.get('text')
  const headings = plan.headings.flatMap((part, i) => {
    const sel = headingSelector(i)
    const rule = b.rules[i]
    const align = rule?.centered ? '; text-align: center' : ''
    // Drawn, not written: an empty box with a border (kept in forced colours), read by nobody.
    const width = rule?.full ? '100%' : `max(${MIN_RULE}, ${String(Math.round((rule?.width ?? 0) * 100))}%)`
    const line = rule
      ? [
          `${sel}::after { content: ""; display: block; width: ${width}; border-top: 1px solid ${rule.color}; margin: .35em ${rule.centered ? 'auto' : '0'} 0; }`,
        ]
      : []
    return [
      `${sel} { ${declarations(b, part, shown(sel))}${align}; }`,
      ...line,
      ...uprightIn(part.manifest, b.faces, sel),
    ]
  })
  const ornaments = b.ornaments.flatMap((o, i) => {
    const sel = `:is(h1, h2, h3, h4, h5, h6).orn-${String(i + 1)}`
    const paint = `var(--ornament) center / 100% 100% no-repeat`
    return [
      `${sel} { --ornament: url(data:image/png;base64,${o.mask})${o.centered ? '; text-align: center' : ''}; }`,
      `${sel}::after { content: ""; display: block; width: ${String(Math.round(o.em * 100) / 100)}em; max-width: 100%; aspect-ratio: ${String(Math.round(o.aspect * 100) / 100)}; border: 0; margin: .35em ${o.centered ? 'auto' : '0'} 0; background: ${o.color}; -webkit-mask: ${paint}; mask: ${paint}; }`,
    ]
  })
  // Backgrounds are not printed and forced colours repaint them: the ornament falls back to a plain rule.
  const plain = b.ornaments.length
    ? '@media print, (forced-colors: active) { :is(h1, h2, h3, h4, h5, h6)[class*="orn-"]::after { background: none; -webkit-mask: none; mask: none; aspect-ratio: auto; border-top: 1px solid; } }'
    : ''
  // The title takes the style of the document's first heading; its colour stays the band's own.
  const first = [...p.headings]
    .filter(([id]) => id.startsWith('0:'))
    .sort((x, y) => x[0].localeCompare(y[0], 'en', { numeric: true }))[0]
  const top = first ? plan.headings[first[1]] : undefined
  // Its words have no runs: the italic its masthead prints in (its signature's), else that heading's.
  const italic = (mastSig === undefined ? top?.style : p.signatures[mastSig])?.face.italic ?? false
  const title = top ? `.band h1 { ${declarations(b, { ...top, size: Math.max(1.5, top.size) }, null, italic)}; }` : ''
  // A name read from the image (a wordmark with no text layer) has no measured size: it takes a wordmark's.
  const titleRatio =
    mastSig === undefined ? (b.masthead?.key ? SEEN_TITLE_RATIO : null) : (p.signatures[mastSig]?.size ?? 0) / p.body
  const masthead = mastheadCss(b, titleRatio)
  const palette = dark
    ? `--fg: ${DARK.fg}; --muted: ${DARK.muted}; --line: ${DARK.line}; --panel: ${DARK.panel}; --focus: ${DARK.focus}; color-scheme: dark;`
    : ''
  const inks = p.inks.flatMap((c) => {
    const sel = inkSelector(c)
    const ok = shown(sel)
    return ok ? [`${sel} { color: ${ok}; }`] : []
  })
  return [
    fontFaces(b.faces),
    `:root { --bg: ${b.background}; ${palette} --accent: ${shown(LINKS) ?? 'var(--fg)'}; font-synthesis: none; }`,
    body ? `body { font-family: ${family(b, body)}; }` : '',
    '.products.menu > li > :not(.name, .prices) { line-height: 1.45; }',
    `${LINKS} { color: var(--accent); }`,
    ...roles,
    cardPrice,
    ...headings,
    ...ornaments,
    plain,
    ...inks,
    ...perPage,
    title,
    ...masthead,
    // Three or more printed columns need the room; a dish's price printed after its name stays there.
    (b.columns ?? 0) >= 3 ? 'main, .doc-menu main { max-width: 80rem; }' : '',
    p.pricesInline
      ? '.products.menu > li, .products.menu.run-on > li { display: block; } .products.menu .name, .products.menu .prices, .products.menu.run-on > li > .lead { display: inline; } .products.menu .prices, .products.menu.run-on > li > .prices, .products.menu.run-on > li > .lead { margin: 0 0 0 .5em; text-align: left; white-space: normal; }'
      : '',
    b.dividers === false ? '.products.menu > li { border-bottom: 0; padding: .45rem 0; }' : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// Per heading (profile key), its classes: the printed signature and the ornament under it.
export function headingClasses(b: Brand): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, sig] of b.profile.headings) out.set(key, `hs-${String(sig + 1)}`)
  b.ornaments.forEach((o, i) => {
    for (const key of o.headings) out.set(key, `${out.get(key) ?? ''} orn-${String(i + 1)}`.trim())
  })
  return out
}
