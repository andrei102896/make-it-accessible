import type { ClaimV3, KeyPageV3 } from './key-schema-v3.ts'
import { checkPrinted } from './key-v3-printed.ts'
import { count, pricedCell, sources, valueOf, type Amount, type Source } from './key-v3.ts'
import type { Occurrence } from './ledger.ts'
import { moneyInText, readMoney } from './score/money.ts'
import type { Word } from './words.ts'

const cellKey = (t: number, r: number, c: number): string => `${String(t)}.${String(r)}.${String(c)}`
type Valued = Extract<ClaimV3, { kind: 'price' | 'cell' | 'text' }>

// A value typed from the render must read as itself: "£1" is never 200 cents.
function consistent(v: Amount, what: string): string[] {
  const read = readMoney(v.printed)
  if (!read) return [`${what}: "${v.printed}" does not read as an amount`]
  const problems: string[] = []
  if (read.cents !== v.cents)
    problems.push(`${what}: "${v.printed}" reads as ${String(read.cents)}, not ${String(v.cents)}`)
  if (read.currency !== null && read.currency !== v.currency)
    problems.push(`${what}: "${v.printed}" prints ${read.currency}, valued ${String(v.currency)}`)
  return problems
}

function checkValued(claim: Valued, s: Source, where: string): string[] {
  const problems: string[] = []
  const o = s.occurrence
  if (s.manual && claim.value) problems.push(`${where}: ${s.id} is manual; its value lives in the manual entry`)
  if (o?.unreadable && !claim.value) problems.push(`${where}: ${s.id} is unreadable; give its value from the render`)
  if (o && !o.unreadable && claim.value && claim.misread !== 'confirmed')
    problems.push(`${where}: ${s.id} "${o.text}" overrides a readable value; open misread until Andrei confirms`)
  if (claim.value) problems.push(...consistent(claim.value, `${where}: ${s.id}`))
  if (claim.kind !== 'cell') {
    const printed = valueOf(claim, s)?.currency ?? null
    if (printed !== null && claim.currency !== undefined && claim.currency !== printed)
      problems.push(`${where}: ${s.id} prints ${printed}, claimed ${String(claim.currency)}`)
  }
  if (claim.kind !== 'cell' && claim.role === 'unknown' && !claim.reason)
    problems.push(`${where}: ${s.id} leaves the role open without a reason`)
  return problems
}

// Manual amounts: missed words no occurrence holds, the parts of a split occurrence, or prices only in the image.
function checkManual(
  page: KeyPageV3,
  occurrences: readonly Occurrence[],
  words: readonly Word[],
  where: string,
): string[] {
  const problems: string[] = []
  const inLedger = new Set(occurrences.flatMap((o) => o.words))
  const named = Object.values(page.occurrences).flatMap((c) => (c.kind === 'split' ? c.into : []))
  const cited = new Map<number, number>()
  for (const m of Object.values(page.manual)) for (const w of new Set(m.words)) cited.set(w, (cited.get(w) ?? 0) + 1)
  // One print is one image entry: two boxes of the same amount that overlap are the same print. Different amounts may
  // overlap ("£3" stamped over a struck "£5").
  const images = Object.entries(page.manual).flatMap(([id, m]) =>
    m.source === 'image' && m.box ? [{ id, box: m.box, cents: m.cents }] : [],
  )
  images.forEach((a, i) => {
    images.slice(i + 1).forEach((b) => {
      const w = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x)
      const h = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y)
      if (a.cents === b.cents && w > 0 && h > 0)
        problems.push(`${where}: image amounts ${a.id} and ${b.id} are one print; key it once`)
    })
  })
  for (const [id, m] of Object.entries(page.manual)) {
    problems.push(...consistent(m, `${where}: ${id}`))
    if (!m.confirmed) problems.push(`${where}: manual amount ${id} "${m.printed}" awaits Andrei's confirmation`)
    if (m.words.some((w) => !words[w])) problems.push(`${where}: ${id} cites a word the snapshot does not have`)
    if (m.source === 'image') {
      if (m.words.length) problems.push(`${where}: ${id} is only in the image and cites no words`)
      // The same amount elsewhere on the page is another price; only an occurrence at this place would be this one.
      // An occurrence whose centre sits in the box is this place in the text layer: claim it, or correct it if misread.
      const box = m.box
      const inside = (o: Occurrence): boolean =>
        box !== undefined &&
        o.box.x + o.box.w / 2 >= box.x &&
        o.box.x + o.box.w / 2 <= box.x + box.w &&
        o.box.y + o.box.h / 2 >= box.y &&
        o.box.y + o.box.h / 2 <= box.y + box.h
      if (!box) problems.push(`${where}: ${id} is only in the image; give its box on the page`)
      else
        occurrences
          .filter(inside)
          .forEach((o) =>
            problems.push(`${where}: ${id} sits on occurrence ${o.id} "${o.text}"; claim or correct that occurrence`),
          )
    } else if (!m.words.length) problems.push(`${where}: ${id} cites the words it was read from`)
    if (new Set(m.words).size !== m.words.length) problems.push(`${where}: ${id} cites a word twice`)
    m.words
      .filter((w, i) => m.words.indexOf(w) === i && (cited.get(w) ?? 0) > 1)
      .forEach((w) => problems.push(`${where}: ${id} cites word ${String(w)}, which another manual amount also cites`))
    if (m.source === 'missed' && m.words.some((w) => inLedger.has(w)))
      problems.push(`${where}: ${id} cites words an occurrence already holds; split that occurrence instead`)
    const splits = named.filter((n) => n === id).length
    if (m.source === 'split' && splits !== 1)
      problems.push(`${where}: split part ${id} is named by ${String(splits)} splits`)
    if (m.source !== 'split' && splits) problems.push(`${where}: ${id} is named by a split but is not a split part`)
  }
  return problems
}

// A split names distinct split parts whose words partition the occurrence; merged parts read, joined, as the whole.
function checkSplitMerge(page: KeyPageV3, all: Map<string, Source>, where: string): string[] {
  const problems: string[] = []
  const merges = new Map<string, Source[]>()
  for (const [id, claim] of Object.entries(page.occurrences)) {
    const whole = all.get(id)?.occurrence
    if (claim.kind === 'split' && whole) {
      const parts = claim.into.map((p) => page.manual[p])
      if (new Set(claim.into).size !== claim.into.length || parts.some((p) => p?.source !== 'split'))
        problems.push(`${where}: ${id} splits into ${claim.into.join(', ')}, which are not distinct split parts`)
      const cited = parts.flatMap((p) => p?.words ?? [])
      const covers = cited.length === whole.words.length && whole.words.every((w) => cited.includes(w))
      if (!covers) problems.push(`${where}: the parts of ${id} must cite each of its words exactly once`)
    }
    const part = all.get(id)
    if (claim.kind === 'merged' && part) merges.set(claim.into, [...(merges.get(claim.into) ?? []), part])
  }
  for (const [into, parts] of merges) {
    const target = page.occurrences[into]
    const whole =
      target && (target.kind === 'price' || target.kind === 'cell' || target.kind === 'text') ? target : null
    const source = all.get(into)
    if (!whole?.value || whole.misread !== 'confirmed' || !source?.occurrence) {
      problems.push(
        `${where}: ${parts.map((p) => p.id).join(', ')} merge into ${into}, whose claim must carry the whole, confirmed value`,
      )
      continue
    }
    const texts = [source, ...parts]
      .sort((a, b) => Math.min(...(a.occurrence?.words ?? [0])) - Math.min(...(b.occurrence?.words ?? [0])))
      .map((s) => s.text)
    const cents = whole.value.cents
    if (![texts.join(''), texts.join(' ')].some((t) => readMoney(t)?.cents === cents))
      problems.push(`${where}: ${into} and the parts merged into it do not read, joined, as ${whole.value.printed}`)
  }
  return problems
}

function checkTables(page: KeyPageV3, all: Map<string, Source>, where: string): string[] {
  const problems: string[] = []
  const claims = new Map<string, { s: Source; claim: Valued }[]>()
  for (const [id, claim] of Object.entries(page.occurrences)) {
    const s = all.get(id)
    if (claim.kind !== 'cell' || !s) continue
    const key = cellKey(claim.table, claim.row, claim.col)
    claims.set(key, [...(claims.get(key) ?? []), { s, claim }])
  }
  page.tables.forEach((t, ti) => {
    t.rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const key = cellKey(ti, ri, ci)
        const claimed = claims.get(key) ?? []
        claims.delete(key)
        if (typeof cell !== 'string') {
          if ('same' in cell && (cell.same === 'above' ? ri === 0 : ci === 0))
            problems.push(`${where}: cell ${key} repeats a neighbour it does not have`)
          if (claimed.length) problems.push(`${where}: cell ${key} is not a written cell but is claimed`)
          return
        }
        const amounts = moneyInText(cell).map((m) => m.cents)
        // A price cell claims each printed amount once; a spec value may be claimed as a cell or as not a price.
        if (pricedCell(page, ti, ci, cell) ? claimed.length !== amounts.length : claimed.length > amounts.length)
          problems.push(
            `${where}: cell ${key} "${cell}" has ${String(amounts.length)} amounts, claimed ${String(claimed.length)}`,
          )
        for (const { s, claim } of claimed) {
          const v = valueOf(claim, s)
          const printed = moneyInText(cell).find((m) => m.cents === v?.cents)?.currency ?? null
          if (v && printed !== null && v.currency !== null && printed !== v.currency)
            problems.push(`${where}: ${s.id} is ${v.currency}, cell ${key} prints ${printed}`)
          if (v && !amounts.includes(v.cents))
            problems.push(`${where}: ${s.id} "${v.printed}" does not read as cell ${key} "${cell}"`)
        }
      })
    })
  })
  for (const key of claims.keys()) problems.push(`${where}: a claim names cell ${key}, which the key does not have`)
  return problems
}

function checkClaims(page: KeyPageV3, all: Map<string, Source>, where: string): string[] {
  const problems: string[] = []
  const products = new Set(page.products.map((p) => p.id))
  for (const s of all.values())
    if (!(s.id in page.occurrences)) problems.push(`${where}: ${s.id} "${s.text}" is not claimed`)
  for (const [id, claim] of Object.entries(page.occurrences)) {
    const s = all.get(id)
    if (!s) {
      problems.push(`${where}: ${id} is neither an occurrence of this page's words nor a manual amount`)
      continue
    }
    if (claim.kind === 'price' && !products.has(claim.product))
      problems.push(`${where}: ${id} claims unknown product "${claim.product}"`)
    if (claim.kind === 'price' || claim.kind === 'cell' || claim.kind === 'text')
      problems.push(...checkValued(claim, s, where))
    else if (s.manual) problems.push(`${where}: manual amount ${id} is claimed as ${claim.kind}`)
    if ((claim.kind === 'split' || claim.kind === 'merged') && !s.occurrence)
      problems.push(`${where}: only an occurrence can be ${claim.kind}`)
  }
  return [...problems, ...checkSplitMerge(page, all, where), ...checkTables(page, all, where)]
}

// Table cells whose amount comes from the render (image-only, unreadable or a confirmed misread), so the text layer
// cannot hold them as written.
export function renderedCells(page: KeyPageV3, occurrences: readonly Occurrence[]): Set<string> {
  const unreadable = new Set(occurrences.filter((o) => o.unreadable).map((o) => o.id))
  return new Set(
    Object.entries(page.occurrences).flatMap(([id, c]) => {
      if (c.kind !== 'cell') return []
      const fromRender = page.manual[id]?.source === 'image' || unreadable.has(id) || c.misread === 'confirmed'
      const cell = page.tables[c.table]?.rows[c.row]?.[c.col]
      return fromRender && typeof cell === 'string' ? [cell] : []
    }),
  )
}

// Version-3 rules beyond the ones every key shares: claims, manual amounts, products, words printed with prices.
export function validateV3Page(
  page: KeyPageV3,
  occurrences: readonly Occurrence[],
  words: readonly Word[],
  text: string,
): string[] {
  const where = `p${String(page.keyPage)}`
  if (page.expect === 'unsupported') {
    const content = [
      page.products,
      page.tables,
      page.readingOrder,
      Object.keys(page.occurrences),
      Object.keys(page.manual),
    ]
    return content.some((list) => list.length) ? [`${where}: an unsupported page keys no content`] : []
  }
  const all = sources(page, occurrences)
  const problems = [
    ...checkClaims(page, all, where),
    ...checkManual(page, occurrences, words, where),
    ...checkPrinted(page, all, words, text, where),
  ]
  const printed = (s: string, what: string): void => {
    if (count(text, s) === 0) problems.push(`${where}: ${what} "${s}" not in the text layer`)
  }
  const ids = page.products.map((p) => p.id)
  const priced = new Set(Object.values(page.occurrences).flatMap((c) => (c.kind === 'price' ? [c.product] : [])))
  for (const p of page.products) {
    if (ids.filter((i) => i === p.id).length > 1) problems.push(`${where}: product id "${p.id}" is not unique`)
    if (p.parent !== undefined && !ids.includes(p.parent))
      problems.push(`${where}: ${p.id} names unknown parent "${p.parent}"`)
    const n = count(text, p.anchor)
    if (n === 0 || (n > 1 && p.parent === undefined && !p.articleNo))
      problems.push(`${where}: product anchor "${p.anchor}" occurs ${String(n)} times`)
    if (p.articleNo) printed(p.articleNo, 'article number')
    p.mustContain.forEach((s) => {
      printed(s, `mustContain of ${p.id}`)
    })
    if (!priced.has(p.id)) problems.push(`${where}: product ${p.id} has no price`)
  }
  return problems
}
