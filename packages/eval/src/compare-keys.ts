import { norm } from '@make-it-accessible/pipeline/text/normalize'
import { claimIdsInA, invert, pairManual, pairProducts, pairTables } from './compare-keys-match.ts'
import type { ClaimV3, ConditionV3, KeyDocV3, KeyPageV3 } from './key-schema-v3.ts'
import type { KeyPage, KeyPrice, TextPrice } from './key-schema.ts'
import { isMoney, tokens, words } from './score/conditions.ts'
import { loose } from './score/text.ts'

// Two blind keys of one page, compared in the forms the scorer and the validator read, so that a difference
// that could change a score is never normalised away; prose (reasons, notes) is not compared.
export type Diff = { area: string; at: string; a: string; b: string }
// A key as the comparator reads it: the file as written and its pages as the scorer reads them.
export type Side = { raw: KeyDocV3; pages: readonly KeyPage[] }

const show = (v: unknown): string => (v === undefined ? '-' : typeof v === 'string' ? v : JSON.stringify(v))
const set = (xs: Iterable<string>): string[] => [...new Set(xs)].sort()
// Words read from the render carry their confirmation, which the freeze depends on.
const seenForm = (c: ConditionV3, form: (text: string) => string): string =>
  typeof c === 'string' ? form(c) : `${c.confirmed ? 'seen' : 'seen, unconfirmed'}: ${form(c.text)}`
const conditionForm = (c: ConditionV3): string => seenForm(c, (t) => words(t).trim())
const offerForm = (text: string): string =>
  tokens(text)
    .map((t) => (isMoney(t) ? `${String(t.cents)}${t.currency ?? ''}` : t))
    .join(' ')
const cellForm = (c: string | null | undefined): string | null | undefined => (typeof c === 'string' ? norm(c) : c)
const altForm = (alt: string | null): string[] | null => (alt === null ? null : set(alt.split('|').map(loose)))
const viewPrice = (p: KeyPrice): string =>
  show({
    cents: p.cents,
    role: p.role,
    currency: p.currency,
    seen: p.seen ?? false,
    when: set(p.conditions.map(words)),
  })
const viewText = (p: TextPrice): string =>
  show({ cents: p.cents, role: p.role, currency: p.currency, seen: p.seen ?? false, offer: offerForm(p.offer) })

// Writer-chosen ids (products, manual entries, table indices) in one shared namespace.
type Names = { product: (id: string) => string; manual: (id: string) => string; table: (i: number) => string }

function claimForm(c: ClaimV3, names: Names) {
  const corrected = (x: Extract<ClaimV3, { kind: 'price' | 'cell' | 'text' }>) => ({
    value: x.value && { ...x.value, printed: norm(x.value.printed) },
    misread: x.misread,
  })
  switch (c.kind) {
    case 'price':
      return {
        kind: c.kind,
        product: names.product(c.product),
        role: c.role,
        currency: c.currency,
        conditions: set(c.conditions.map(conditionForm)),
        reason: c.reason !== undefined,
        ...corrected(c),
      }
    case 'cell':
      return { kind: c.kind, cell: [names.table(c.table), c.row, c.col], ...corrected(c) }
    case 'text':
      return {
        kind: c.kind,
        role: c.role,
        offer: seenForm(c.offer, offerForm),
        offerWords: [...c.offerWords].sort((x, y) => x - y),
        offerNote: c.offerNote && { confirmed: c.offerNote.confirmed },
        currency: c.currency,
        reason: c.reason !== undefined,
        ...corrected(c),
      }
    case 'notPrice':
      return { kind: c.kind }
    case 'split':
      return { kind: c.kind, into: set(c.into.map(names.manual)) }
    case 'merged':
      return { kind: c.kind, into: c.into }
  }
}

export function compareKeys(a: Side, b: Side): Diff[] {
  const diffs: Diff[] = []
  const add = (area: string, at: string, x: unknown, y: unknown): void => {
    if (show(x) !== show(y)) diffs.push({ area, at, a: show(x), b: show(y) })
  }
  // Field by field, so one disagreement reads as one line.
  const fields = (area: string, at: string, x: Record<string, unknown>, y: Record<string, unknown>): void => {
    if (x.kind !== y.kind) {
      add(area, `${at} kind`, x, y)
      return
    }
    for (const k of set([...Object.keys(x), ...Object.keys(y)])) add(area, `${at} ${k}`, x[k], y[k])
  }

  const ra = a.raw
  const rb = b.raw
  const same = (x: unknown, y: unknown, what: string): void => {
    if (show(x) !== show(y)) throw new Error(`not keys of the same evidence: ${what} differs`)
  }
  same(ra.doc, rb.doc, 'doc')
  same(ra.pdfSha256, rb.pdfSha256, 'pdfSha256')
  same(
    ra.pages.map((p) => [p.pdfPage, p.wordsSha256, p.ledgerSha256]),
    rb.pages.map((p) => [p.pdfPage, p.wordsSha256, p.ledgerSha256]),
    'the pages or their snapshots',
  )

  add('doc', 'currency', ra.currency, rb.currency)
  add('doc', 'language', ra.lang.split('-')[0]?.toLowerCase(), rb.lang.split('-')[0]?.toLowerCase())
  const section = (s: { keyPage: number; label: string | null; anchors: string[] }) => ({
    keyPage: s.keyPage,
    label: s.label === null ? null : norm(s.label),
    anchors: set(s.anchors.map(loose)),
  })
  const sa = ra.sections ?? []
  const sb = rb.sections ?? []
  add('doc', 'sections', sa.length, sb.length)
  sa.forEach((s, i) => {
    const t = sb[i]
    if (t) fields('doc', `section ${String(i + 1)}`, section(s), section(t))
  })
  add(
    'doc',
    'sectionOrders',
    set(ra.sectionOrders.map((o) => show(o.map(section)))),
    set(rb.sectionOrders.map((o) => show(o.map(section)))),
  )

  ra.pages.forEach((pa, i) => {
    const pb = rb.pages[i]
    const va = a.pages[i]
    const vb = b.pages[i]
    if (pb && va && vb) comparePage(pa, pb, va, vb, add, fields)
  })
  return diffs
}

type Add = (area: string, at: string, x: unknown, y: unknown) => void
type Fields = (area: string, at: string, x: Record<string, unknown>, y: Record<string, unknown>) => void

function comparePage(pa: KeyPageV3, pb: KeyPageV3, va: KeyPage, vb: KeyPage, add: Add, fields: Fields): void {
  const at = `p${String(pa.keyPage)}`
  add('page', `${at} keyPage`, pa.keyPage, pb.keyPage)
  add('page', `${at} type`, pa.type, pb.type)
  add('page', `${at} expect`, pa.expect, pb.expect)

  const manual = pairManual(pa, pb)
  // Two hand-drawn boxes never coincide; pairing already required them to overlap.
  const manualForm = (m: KeyPageV3['manual'][string]) => ({
    ...m,
    printed: norm(m.printed),
    words: [...m.words].sort((x, y) => x - y),
    box: m.box !== undefined,
  })
  for (const [id, m] of Object.entries(pa.manual)) {
    const other = manual.get(id)
    const n = other === undefined ? undefined : pb.manual[other]
    if (n) fields('manual', `${at} ${id}/${String(other)}`, manualForm(m), manualForm(n))
    else add('manual', `${at} ${id}`, manualForm(m), undefined)
  }
  const pairedB = new Set(manual.values())
  for (const [id, m] of Object.entries(pb.manual))
    if (!pairedB.has(id)) add('manual', `${at} b:${id}`, undefined, manualForm(m))

  const toA = claimIdsInA(manual)
  const products = pairProducts(pa, pb, toA)
  const back = invert(products)
  const nameA = (id: string): string => (products.has(id) ? id : `a:${id}`)
  const nameB = (id: string): string => back.get(id) ?? `b:${id}`
  const tables = pairTables(pa, pb, toA)
  const tablesBack = new Map([...tables].map(([x, y]) => [y, x]))
  const namesA: Names = {
    product: nameA,
    manual: (m) => m,
    table: (i) => (tables.has(i) ? String(i) : `a:${String(i)}`),
  }
  const namesB: Names = { product: nameB, manual: toA, table: (j) => String(tablesBack.get(j) ?? `b:${String(j)}`) }

  const claimB = new Map(Object.entries(pb.occurrences).map(([id, c]) => [toA(id), c]))
  const ids = set([...Object.keys(pa.occurrences), ...claimB.keys()])
  for (const id of ids) {
    const x = pa.occurrences[id]
    const y = claimB.get(id)
    if (!x || !y) {
      add('occurrence', `${at} ${id}`, x && x.kind, y && y.kind)
      continue
    }
    fields('occurrence', `${at} ${id}`, claimForm(x, namesA), claimForm(y, namesB))
  }

  const productForm = (p: KeyPageV3['products'][number], parent: (id: string) => string) => ({
    anchor: loose(p.anchor),
    parent: p.parent === undefined ? undefined : parent(p.parent),
    articleNo: p.articleNo,
    alt: altForm(p.alt),
    mustContain: set(p.mustContain.map(norm)),
  })
  const viewA = new Map(va.products.map((p) => [p.id ?? '', p]))
  const viewB = new Map(vb.products.map((p) => [p.id ?? '', p]))
  for (const p of pa.products) {
    const q = pb.products.find((x) => x.id === products.get(p.id))
    if (!q) {
      add('product', `${at} ${p.id}`, p.anchor, undefined)
      continue
    }
    fields('product', `${at} ${p.id}/${q.id}`, productForm(p, nameA), productForm(q, nameB))
    // What the scorer reads, as a backstop for anything the claim forms above normalise.
    add(
      'product',
      `${at} ${p.id}/${q.id} scored prices`,
      (viewA.get(p.id)?.prices ?? []).map(viewPrice).sort(),
      (viewB.get(q.id)?.prices ?? []).map(viewPrice).sort(),
    )
  }
  for (const q of pb.products) if (!back.has(q.id)) add('product', `${at} b:${q.id}`, undefined, q.anchor)
  // The scorer gives each product, in array order, the smallest free block naming it: order matters when anchors nest.
  const paired = pa.products.filter((p) => products.has(p.id))
  for (const [i, x] of paired.entries())
    for (const y of paired.slice(i + 1)) {
      const nest = loose(x.anchor).includes(loose(y.anchor)) || loose(y.anchor).includes(loose(x.anchor))
      const ix = pb.products.findIndex((q) => q.id === products.get(x.id))
      const iy = pb.products.findIndex((q) => q.id === products.get(y.id))
      if (nest && ix > iy)
        add('product', `${at} order of nested anchors`, `${x.id} before ${y.id}`, `${y.id} before ${x.id}`)
    }
  add('page', `${at} scored page prices`, va.textPrices.map(viewText).sort(), vb.textPrices.map(viewText).sort())
  add('page', `${at} priced cells`, va.pricedCells, vb.pricedCells)
  const rows = (rendered: KeyPage['renderedRows'], table: (i: number) => string): string[] =>
    set(rendered.map(([t, r]) => `${table(t)}:${String(r)}`))
  add('page', `${at} rendered rows`, rows(va.renderedRows, namesA.table), rows(vb.renderedRows, namesB.table))

  add('table', `${at} count`, va.tables.length, vb.tables.length)
  va.tables.forEach((t, n) => {
    const m = tables.get(n)
    const u = m === undefined ? undefined : vb.tables[m]
    const tat = `${at} table ${String(n)}${m === n || m === undefined ? '' : `/${String(m)}`}`
    if (!u) {
      add('table', tat, t.header.map(norm), undefined)
      return
    }
    const shape = (x: typeof t) => [x.header.length, ...x.rows.map((r) => r.length)]
    add('table', `${tat} header`, t.header.map(norm), u.header.map(norm))
    // A different shape would list every cell after it; the arbiter sees both tables instead.
    if (show(shape(t)) !== show(shape(u))) {
      add('table', `${tat} shape`, shape(t), shape(u))
      return
    }
    t.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const other = u.rows[r]?.[c]
        add('table', `${tat} [${String(r)},${String(c)}]`, cellForm(cell), cellForm(other))
      })
    })
  })

  vb.tables.forEach((u, m) => {
    if (!tablesBack.has(m)) add('table', `${at} b:table ${String(m)}`, undefined, u.header.map(norm))
  })

  // Levels are scored relative to the page's top heading; list order is not scored.
  const headings = (p: KeyPageV3): string[] => {
    const top = Math.min(...p.headings.map((h) => h.level))
    return set(p.headings.map((h) => `h${String(h.level - top + 1)} ${loose(h.anchor)}#${String(h.occurrence ?? 1)}`))
  }
  const ha = headings(pa)
  const hb = headings(pb)
  add(
    'heading',
    at,
    ha.filter((h) => !hb.includes(h)),
    hb.filter((h) => !ha.includes(h)),
  )

  const order = (p: KeyPageV3): string[] =>
    set(
      p.readingOrder.map((alt) =>
        alt
          .map(
            (e) =>
              `${e.kind === 'imageOnlyText' ? 'image: ' : ''}${loose(e.anchor)}${e.occurrence ? `#${String(e.occurrence)}` : ''}`,
          )
          .join(' > '),
      ),
    )
  add('order', at, order(pa), order(pb))
  const pageText = (t: KeyPageV3['mustContain'][number]): string =>
    typeof t === 'string' ? norm(t) : `seen: ${norm(t.text)}`
  add('text', `${at} mustContain`, set(pa.mustContain.map(pageText)), set(pb.mustContain.map(pageText)))
  add('text', `${at} mustNotAppear`, set(pa.mustNotAppear.map(norm)), set(pb.mustNotAppear.map(norm)))
  add('text', `${at} outsideTrim`, set(pa.outsideTrim.map(norm)), set(pb.outsideTrim.map(norm)))
}
