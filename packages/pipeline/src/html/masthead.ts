import type { Brand } from './brand.ts'

// The page's text size (brand.ts) and the masthead's bounds.
const BASE_REM = 1.0625
const rem = (n: number): string => `${String(Math.round(n * 1000) / 1000)}rem`

// The masthead as printed: the name at its printed ratio to the body text (at least 1.5rem, at most 4.5rem and
// 11vw, so a newspaper title still fits a phone), the logo at its printed share of the width, small print smaller.
const MASTHEAD_MIN = 1.5
const MASTHEAD_MAX = 4.5
export const SEEN_TITLE_RATIO = 3
export function mastheadCss(b: Brand, ratio: number | null): string[] {
  if (!b.masthead) return []
  const title =
    ratio === null
      ? ''
      : `:is(h1, h2, h3, h4, h5, h6).masthead-title { font-size: clamp(${rem(MASTHEAD_MIN)}, min(${rem(ratio * BASE_REM)}, 11vw), ${rem(MASTHEAD_MAX)}); line-height: 1.05; margin-top: 0; }`
  const logo = b.masthead.logoShare
    ? `.masthead img.logo { width: clamp(8rem, ${String(Math.round(b.masthead.logoShare * 100))}%, 60%); height: auto; }`
    : ''
  return [
    // The header stands apart from the columns: always centred, with room above and below (Andrei, 2026-10-16).
    '.masthead { margin: 2.5rem 0; text-align: center; } .masthead .logo { margin: 0 auto .75rem; }',
    // A band left visible (the name printed nowhere as text) belongs to the header: centred with it.
    '.band { text-align: center; } .band h1 { margin-inline: auto; }',
    title,
    logo,
    '.small-print { font-size: .9375rem; color: var(--muted); margin-top: 2rem; }',
  ]
}
