import type { Extraction, Run } from '../pdf/types.ts'
import type { TextValue } from '../model/schema.ts'
import type { Face } from './profile.ts'

// A printed weight and style, what a word's span may change (never its family).
export type Style = Pick<Face, 'weight' | 'italic'>
// A shown text's characters grouped by colour, style (only words their line prints in more than one style have one)
// and the icon they name (its printed left and width, hundredths of the page width).
export type Segment = { text: string; color: string | null; style: Style | null; icon: { x: number; w: number } | null }

// Words printed farther apart than this (em) are two pieces of a line: a word space is ~0.25 em, a tab or a price
// column far more.
const GAP = 1

const sameIcon = (a: Segment['icon'], b: Segment['icon']): boolean => a?.x === b?.x && a?.w === b?.w
const sameStyle = (a: Style | null, b: Style | null): boolean => a?.weight === b?.weight && a?.italic === b?.italic

// Each shown character's run, matched to the cited runs' characters (whitespace and case aside): null for
// whitespace, and null for the whole text when the letters differ (the model's text stands in for a broken layer).
export function shownRuns(t: TextValue, e: Extraction, shown: string): (Run | null)[] | null {
  if ('seen' in t) return null
  const hidden = new Set(e.hidden)
  const runs = t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
  const chars = runs.flatMap((r) => Array.from(r.str.replace(/\s+/g, '')).map((ch) => ({ ch: ch.toLowerCase(), r })))
  let at = 0
  const out: (Run | null)[] = []
  for (const ch of Array.from(shown)) {
    if (/\s/.test(ch)) {
      out.push(null)
      continue
    }
    const c = chars[at++]
    if (c?.ch !== ch.toLowerCase()) return null
    out.push(c.r)
  }
  return out
}

// The shown text's characters each with its run's colour (whitespace takes the one before). When the letters differ,
// one segment, coloured only when every run agrees.
export function inkSegments(t: TextValue, e: Extraction, shown: string): Segment[] {
  if ('seen' in t) return [{ text: shown, color: null, style: null, icon: null }]
  const letters = Array.from(shown)
  const owners = shownRuns(t, e, shown)
  if (!owners) {
    const hidden = new Set(e.hidden)
    const runs = t.src.flatMap(([from, to]) => e.runs.slice(from, to + 1)).filter((r) => !hidden.has(r.id))
    const all = new Set(runs.map((r) => r.color ?? null))
    return [{ text: shown, color: all.size === 1 ? ([...all][0] ?? null) : null, style: null, icon: null }]
  }
  return segmentsOf(letters, owners, e.width)
}

function segmentsOf(letters: readonly string[], owners: readonly (Run | null)[], pageWidth: number): Segment[] {
  const out: Segment[] = []
  let color: string | null = null
  let style: Style | null = null
  let icon: Segment['icon'] = null
  const u = (v: number): number => Math.round((v / pageWidth) * 100_000) / 1000
  letters.forEach((ch, i) => {
    const owner = owners[i]
    if (owner) {
      color = owner.color ?? null
      style = owner.font && owner.styled ? { weight: owner.font.weight, italic: owner.font.italic } : null
      icon = owner.icon ? { x: u(owner.box.x), w: u(owner.box.w) } : null
    } else if (i === 0) color = null
    // A space after an icon's words is not the tag's: the tag ends with its last word.
    else if (!owners.slice(i + 1).find((o) => o)?.icon) icon = null
    const last = out.at(-1)
    if (last && last.color === color && sameStyle(last.style, style) && sameIcon(last.icon, icon)) last.text += ch
    else out.push({ text: ch, color, style, icon })
  })
  return out
}

// The shown text cut at its printed line breaks, and on a line where its words are not printed side by side (`apart`):
// each piece's characters with their runs, and the whitespace between them as shown, so the pieces make up `shown`
// exactly. Null when the text does not follow its runs or prints as one piece.
export type LinePart = { text: string; runs: Run[]; segments: Segment[] } | { gap: string }
// Words printed apart: back to the left, past a row's gap ("+ … supplement" round its "5.95"), or before a kept icon
// with the bracket opening on it ("oaties | ( [NGCI] …"): each piece is its own box.
const apart = (a: Run, b: Run, lead: (r: Run) => boolean): boolean => {
  const em = a.font?.size ?? b.font?.size ?? a.box.h
  const gap = b.box.x - (a.box.x + a.box.w)
  return gap < -em / 2 || gap > GAP * em || (a.icon !== true && !lead(a) && (b.icon === true || lead(b)))
}
const OPENS = /^[([{]+$/
export function lineParts(t: TextValue, e: Extraction, shown: string): LinePart[] | null {
  const owners = shownRuns(t, e, shown)
  if (!owners) return null
  const letters = Array.from(shown)
  const key = (r: Run): string => `${String(r.flow)}:${String(r.line)}`
  const order = [...new Set(owners.filter((r): r is Run => r !== null))]
  // A bracket opens on the icon only when the icon starts within an em of it ("( [NGCI] available)").
  const lead = (r: Run): boolean => {
    const next = order[order.indexOf(r) + 1]
    const em = r.font?.size ?? r.box.h
    return OPENS.test(r.str) && next?.icon === true && next.box.x - (r.box.x + r.box.w) <= em
  }
  const parts: LinePart[] = []
  let line: { start: number; end: number; key: string } | null = null
  const close = (): void => {
    if (!line) return
    const own = owners.slice(line.start, line.end)
    const runs = [...new Set(own.filter((r): r is Run => r !== null))]
    parts.push({
      text: letters.slice(line.start, line.end).join(''),
      runs,
      segments: segmentsOf(letters.slice(line.start, line.end), own, e.width),
    })
  }
  let gap = ''
  let last: Run | null = null
  letters.forEach((ch, i) => {
    const owner = owners[i]
    if (!owner) {
      gap += ch
      return
    }
    const before = last
    last = owner
    if (line && line.key === key(owner) && (before === owner || !before || !apart(before, owner, lead))) {
      line.end = i + 1
      gap = ''
      return
    }
    close()
    if (gap || line) parts.push({ gap })
    gap = ''
    line = { start: i, end: i + 1, key: key(owner) }
  })
  close()
  if (gap) parts.push({ gap })
  return parts.filter((p) => 'runs' in p).length > 1 ? parts : null
}

// A span's classes for words (a price's) sharing one style their line sets apart; none when they differ.
export function runsClasses(runs: readonly Run[]): string[] {
  const styles = new Set(
    runs.map((r) => (r.font && r.styled ? `${String(r.font.weight)}:${String(r.font.italic)}` : '')),
  )
  const font = runs[0]?.styled ? runs[0].font : undefined
  return styles.size === 1 && font ? styleClasses(font) : []
}

// A word's printed weight and style as classes (style.ts), whatever its element's face: no copy of the brand's CSS.
const styleClasses = (style: Style | null): string[] =>
  style ? [`fw-${String(style.weight)}`, style.italic ? 'fi' : 'fn'] : []

export type Each = (s: string) => string
// The segments as HTML: brand inks in their class, styled words in a silent span (`fw-N` and `fi`/`fn`, never <em>), an
// icon's words in the legend tag (`--iw`, `--ix`), the rest joined so `each` sees whole words.
export function inkedHtml(segments: readonly Segment[], inks: ReadonlySet<string>, each: Each): string {
  const groups: Segment[] = []
  for (const s of segments) {
    const color = s.color !== null && inks.has(s.color) ? s.color : null
    const last = groups.at(-1)
    if (last && last.color === color && sameStyle(last.style, s.style) && sameIcon(last.icon, s.icon))
      last.text += s.text
    else groups.push({ ...s, color })
  }
  return groups
    .map((g) => {
      const classes = [...(g.color ? [`ink-${g.color.slice(1)}`] : []), ...styleClasses(g.style)]
      const inked = classes.length ? `<span class="${classes.join(' ')}">${each(g.text)}</span>` : each(g.text)
      return g.icon === null
        ? inked
        : `<span class="diet icon" style="--iw:${String(g.icon.w)};--ix:${String(g.icon.x)}"><span>${inked}</span></span>`
    })
    .join('')
}
