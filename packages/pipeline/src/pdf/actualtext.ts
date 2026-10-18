// The text a PDF's maker gives one drawn glyph: Apple Pages wraps each ligature its font does not name in
// `/Span << /ActualText (tt) >> BDC q … cm BT … Tm /F 1 Tf (3) Tj ET Q EMC`; pdf.js drops it, Poppler misplaces it.
// `copyX`: where Poppler puts its copy of the text (Tm alone, at the page's edge).
export type ActualText = { text: string; x: number; y: number; size: number; copyX: number }

const NUM = String.raw`-?\d*\.?\d+`
const SIX = Array.from({ length: 6 }, () => `(${NUM})`).join(String.raw`\s+`)
const STRING = String.raw`\((?:[^()\\]|\\[\s\S])*\)|<[0-9A-Fa-f\s]*>`
// Only a span that sets its own place (a colour before it at most): one inside a running text block has no position
// of its own and is left out.
const SPAN = new RegExp(
  String.raw`/ActualText\s*(${STRING})\s*>>\s*BDC\s*(?:(?:${NUM}\s+)+(?:sc|scn|rg|g|k)\s+)?q\s+${SIX}\s+cm\s+BT\s+${SIX}\s+Tm\s+/\S+\s+(${NUM})\s+Tf\s+(?:${STRING})\s*Tj\s+ET\s+Q\s+EMC`,
  'g',
)

// Each such span of a decompressed content stream (its bytes as latin1): its text and the origin of the glyph it
// stands for in the page's user space (cm · Tm), and the glyph's size; texts of whitespace only (tabs) left out.
export function actualTextsOf(content: string): ActualText[] {
  return [...content.matchAll(SPAN)].flatMap((m) => {
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0, ta = 1, , , , tx = 0, ty = 0, tf = 1] = m.slice(2, 15).map(Number)
    const text = decoded(m[1] ?? '')
    if (!text.trim()) return []
    return [{ text, x: a * tx + c * ty + e, y: b * tx + d * ty + f, size: Math.abs(ta * a * tf), copyX: tx }]
  })
}

// A PDF text string, literal (with its escapes) or hex: UTF-16BE behind its byte-order mark, else a byte a letter.
function decoded(s: string): string {
  const bytes = s.startsWith('<')
    ? (s.slice(1, -1).replace(/\s/g, '').match(/../g) ?? []).map((h) => parseInt(h, 16))
    : latin1(s.slice(1, -1).replace(/\\([0-7]{1,3}|[\s\S])/g, (_, e: string) => unescaped(e)))
  if (bytes[0] !== 0xfe || bytes[1] !== 0xff) return String.fromCharCode(...bytes)
  const units: number[] = []
  for (let i = 2; i + 1 < bytes.length; i += 2) units.push(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0))
  return String.fromCharCode(...units)
}
const latin1 = (s: string): number[] => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))
const ESCAPED = new Map([
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['b', '\b'],
  ['f', '\f'],
])
// An octal code, a named escape, a line continuation (nothing), else the character itself ("\(" is "(").
const unescaped = (e: string): string =>
  /^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : /^[\r\n]$/.test(e) ? '' : (ESCAPED.get(e) ?? e)
