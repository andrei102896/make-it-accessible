// An OpenType/TrueType font program read and rewritten byte by byte: its tables, names, embedding permission and
// character map. Only what the printed view needs to serve a font embedded in the PDF (pdf/ownfont.ts).

type Table = { tag: string; offset: number; length: number }
const view = (d: Uint8Array): DataView => new DataView(d.buffer, d.byteOffset, d.byteLength)
const tagAt = (d: Uint8Array, at: number): string => String.fromCharCode(...d.subarray(at, at + 4))

// An sfnt starts with one of these: TrueType outlines (two spellings) or CFF outlines.
export const isSfnt = (d: Uint8Array): boolean =>
  d.length >= 12 && ['\0\u0001\0\0', 'true', 'OTTO'].includes(tagAt(d, 0))

export function tablesOf(d: Uint8Array): Table[] {
  const v = view(d)
  const n = v.getUint16(4)
  return Array.from({ length: n }, (_, i) => {
    const at = 12 + i * 16
    return { tag: tagAt(d, at), offset: v.getUint32(at + 8), length: v.getUint32(at + 12) }
  }).filter((t) => t.offset + t.length <= d.length)
}
const table = (d: Uint8Array, tag: string): Table | undefined => tablesOf(d).find((t) => t.tag === tag)

// A name record (1 family, 6 PostScript name, 0 copyright, 13 licence, 14 licence URL): Windows (UTF-16) first.
export function nameOf(d: Uint8Array, id: number): string | null {
  const t = table(d, 'name')
  if (!t) return null
  const v = view(d)
  const count = v.getUint16(t.offset + 2)
  const strings = t.offset + v.getUint16(t.offset + 4)
  let mac: string | null = null
  for (let r = 0; r < count; r++) {
    const at = t.offset + 6 + r * 12
    if (v.getUint16(at + 6) !== id) continue
    const [platform, length, offset] = [v.getUint16(at), v.getUint16(at + 8), v.getUint16(at + 10)]
    const bytes = d.subarray(strings + offset, strings + offset + length)
    if (platform === 3 || platform === 0) {
      const units = Array.from(
        { length: bytes.length >> 1 },
        (_, i) => ((bytes[2 * i] ?? 0) << 8) | (bytes[2 * i + 1] ?? 0),
      )
      return String.fromCharCode(...units)
    }
    mac ??= String.fromCharCode(...bytes)
  }
  return mac
}

// OS/2 fsType: the embedding the font's maker permits; null without an OS/2 table.
export function fsTypeOf(d: Uint8Array): number | null {
  const t = table(d, 'OS/2')
  return t && t.length >= 10 ? view(d).getUint16(t.offset + 8) : null
}
// Installable (0) or editable (0x0008) embedding, nothing more restrictive set: not restricted (0x0002), preview &
// print (0x0004) or bitmap only (0x0200). Stricter than the spec (the least restrictive bit applies) on purpose.
export const permitsEmbedding = (fs: number | null): boolean => fs !== null && (fs & 0x0206) === 0

// maxp's glyph count: a cmap may not name a glyph past it (Chrome rejects the font).
export function glyphCount(d: Uint8Array): number {
  const t = table(d, 'maxp')
  return t && t.length >= 6 ? view(d).getUint16(t.offset + 4) : 0
}

// The format 4 subtables' code point → glyph id (Unicode BMP).
export function cmapOf(d: Uint8Array): Map<number, number> {
  const out = new Map<number, number>()
  const t = table(d, 'cmap')
  if (!t) return out
  const v = view(d)
  const subtables = v.getUint16(t.offset + 2)
  for (let s = 0; s < subtables; s++) {
    const at = t.offset + v.getUint32(t.offset + 4 + s * 8 + 4)
    if (at + 14 > d.length || v.getUint16(at) !== 4) continue
    const segs = v.getUint16(at + 6) / 2
    const ends = at + 14
    const starts = ends + segs * 2 + 2
    const deltas = starts + segs * 2
    const ranges = deltas + segs * 2
    for (let i = 0; i < segs; i++) {
      const [lo, hi] = [v.getUint16(starts + i * 2), v.getUint16(ends + i * 2)]
      const [delta, range] = [v.getInt16(deltas + i * 2), v.getUint16(ranges + i * 2)]
      for (let c = lo; c <= hi && c !== 0xffff; c++) {
        const g = range === 0 ? (c + delta) & 0xffff : v.getUint16(ranges + i * 2 + range + (c - lo) * 2)
        const glyph = range !== 0 && g !== 0 ? (g + delta) & 0xffff : g
        if (glyph !== 0 && !out.has(c)) out.set(c, glyph)
      }
    }
  }
  return out
}

// The font with its character map replaced by one (3,1) format 4 subtable of `map` (code point → glyph id),
// one segment per code point, its tables re-laid and every checksum computed again; null past format 4's size.
export function withCmap(d: Uint8Array, map: ReadonlyMap<number, number>): Uint8Array<ArrayBuffer> | null {
  const codes = [...map.keys()].filter((c) => c < 0xffff).sort((a, b) => a - b)
  const segs = codes.length + 1
  if (16 + segs * 8 > 0xffff) return null
  const sub = new DataView(new ArrayBuffer(16 + segs * 8))
  const log = Math.floor(Math.log2(segs))
  sub.setUint16(0, 4)
  sub.setUint16(2, sub.byteLength)
  sub.setUint16(6, segs * 2)
  sub.setUint16(8, 2 * 2 ** log)
  sub.setUint16(10, log)
  sub.setUint16(12, segs * 2 - 2 * 2 ** log)
  const [ends, starts, deltas] = [14, 16 + segs * 2, 16 + segs * 4]
  ;[...codes, 0xffff].forEach((c, i) => {
    sub.setUint16(ends + i * 2, c)
    sub.setUint16(starts + i * 2, c)
    sub.setUint16(deltas + i * 2, c === 0xffff ? 1 : ((map.get(c) ?? 0) - c) & 0xffff)
  })
  const cmap = new Uint8Array(12 + sub.byteLength)
  const head = view(cmap)
  head.setUint16(2, 1)
  head.setUint16(4, 3)
  head.setUint16(6, 1)
  head.setUint32(8, 12)
  cmap.set(new Uint8Array(sub.buffer), 12)
  const tables = tablesOf(d).map((t) => ({
    tag: t.tag,
    data: t.tag === 'cmap' ? cmap : d.slice(t.offset, t.offset + t.length),
  }))
  if (!tables.some((t) => t.tag === 'cmap')) tables.push({ tag: 'cmap', data: cmap })
  return assemble(d.subarray(0, 4), tables)
}

const pad4 = (n: number): number => (n + 3) & ~3
// The sum of the table as big-endian 32-bit words, its tail padded with zeros.
const checksum = (d: Uint8Array): number => {
  let sum = 0
  for (let i = 0; i < d.length; i += 4) {
    const word = (((d[i] ?? 0) << 24) | ((d[i + 1] ?? 0) << 16) | ((d[i + 2] ?? 0) << 8) | (d[i + 3] ?? 0)) >>> 0
    sum = (sum + word) >>> 0
  }
  return sum
}

// The sfnt header, its directory sorted by tag, each table 4-byte aligned, head.checkSumAdjustment last.
function assemble(version: Uint8Array, tables: { tag: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : 1))
  const n = sorted.length
  const log = Math.floor(Math.log2(n))
  let offset = 12 + n * 16
  const placed = sorted.map((t) => {
    const at = offset
    offset += pad4(t.data.length)
    return { ...t, at }
  })
  const out = new Uint8Array(offset)
  const v = view(out)
  out.set(version, 0)
  v.setUint16(4, n)
  v.setUint16(6, 16 * 2 ** log)
  v.setUint16(8, log)
  v.setUint16(10, n * 16 - 16 * 2 ** log)
  for (const [i, t] of placed.entries()) {
    const data = t.tag === 'head' ? zeroAdjustment(t.data) : t.data
    out.set(data, t.at)
    const rec = 12 + i * 16
    out.set(
      Array.from(t.tag, (c) => c.charCodeAt(0)),
      rec,
    )
    v.setUint32(rec + 4, checksum(data))
    v.setUint32(rec + 8, t.at)
    v.setUint32(rec + 12, t.data.length)
  }
  const head = placed.find((t) => t.tag === 'head')
  if (head) v.setUint32(head.at + 8, (0xb1b0afba - checksum(out)) >>> 0)
  return out
}
const zeroAdjustment = (head: Uint8Array): Uint8Array => {
  const copy = head.slice()
  if (copy.length >= 12) view(copy).setUint32(8, 0)
  return copy
}
