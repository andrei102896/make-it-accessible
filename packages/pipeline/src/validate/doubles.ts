import { joinRuns } from '../pdf/runs.ts'
import type { Run } from '../pdf/types.ts'
import type { Finding } from './validate.ts'

// A word printed once and shown twice: one cited by two fields of the page (validate.ts records each citation, the
// dropped words left out). Only a printed label or amount shared by design passes; the rest is an error.
export type Citation = { run: number; path: string }
type Field = { path: string; block: number; item: string | null; kind: Kind }
type Kind = 'name' | 'price' | 'qualifier' | 'unit' | 'detail' | 'text'

function fieldOf(path: string): Field {
  const block = Number(/^blocks\[(\d+)\]/.exec(path)?.[1] ?? -1)
  const item = /^blocks\[\d+\]\.items\[\d+\](?=\.(?:name|prices|unit|details))/.exec(path)?.[0] ?? null
  const kind: Kind = /\.qualifier$/.test(path)
    ? 'qualifier'
    : /\.prices\[\d+\]$/.test(path)
      ? 'price'
      : /\.name$/.test(path)
        ? 'name'
        : /\.unit$/.test(path)
          ? 'unit'
          : /\.details\[/.test(path)
            ? 'detail'
            : 'text'
  return { path, block, item, kind }
}

const sameValue = (xs: readonly unknown[]): boolean => xs.every((x) => x === xs[0])

// Whether the fields sharing run `at` share it by design: column heads as size labels (Howies' "125ml/Bottle"), with
// at most the heading above them or the item's own text (Gigi's SM/MED/LG, Five Bells' "10oz"); one amount of
// several dishes of a block printed on all their lines or on none (Howies' "each 2.95", Claudio's "16" by its
// heading); a group name opening its variants' names (Sarge's knish, Eusebi's San Pellegrino); one item's name or
// unit fused with its price ("Egg…12").
function shared(fields: readonly Field[], at: number, runs: readonly Run[], cited: ReadonlyMap<string, number[]>) {
  const kinds = new Set(fields.map((f) => f.kind))
  const items = fields.map((f) => f.item)
  const labels = fields.filter((f) => f.kind === 'qualifier')
  const rest = fields.filter((f) => f.kind !== 'qualifier')
  if (labels.length && rest.length <= 1) {
    const other = rest[0]
    const label = labels[0]
    if (!other || !label) return true
    if (other.kind === 'price' || other.kind === 'unit') return false
    const own = other.item !== null && labels.every((l) => l.item === other.item)
    const above = other.kind === 'text' && labels.every((l) => l.block === other.block + 1)
    return own || above
  }
  if (labels.length) return false
  const line = runs[at]?.line
  const lines = (f: Field): number[] =>
    (cited.get(`${f.item ?? ''}.name`) ?? []).map((i) => runs[i]?.line ?? -1).filter((l) => l >= 0)
  if (
    kinds.size === 1 &&
    kinds.has('price') &&
    new Set(items).size === fields.length &&
    sameValue(fields.map((f) => f.block))
  ) {
    const on = fields.map((f) => lines(f).includes(line ?? -2))
    return on.every(Boolean) || !on.some(Boolean)
  }
  if (kinds.size === 1 && kinds.has('name') && sameValue(fields.map((f) => f.block))) {
    // The shared words open every name: none of a name's own words comes before them.
    return fields.every((f) => {
      const own = cited.get(f.path) ?? []
      const first = own.findIndex((i) => fields.some((g) => !(cited.get(g.path) ?? []).includes(i)))
      return first < 0 || own.indexOf(at) < first
    })
  }
  return items[0] !== null && sameValue(items) && [...kinds].every((k) => k === 'price' || k === 'name' || k === 'unit')
}

// What a field shows, for the person reading the finding: the dish's name, or the text itself.
function describe(f: Field, runs: readonly Run[], cited: ReadonlyMap<string, number[]>): string {
  const words = (path: string): string => joinRuns((cited.get(path) ?? []).flatMap((i) => runs[i] ?? []))
  const dish = f.item ? words(`${f.item}.name`) : ''
  const what = {
    name: 'the name',
    price: 'a price',
    qualifier: 'a label',
    unit: 'the unit',
    detail: 'the description',
    text: 'the text',
  }[f.kind]
  return f.kind === 'name' || !dish ? `${what} "${words(f.path)}"` : `${what} of "${dish}"`
}

export function doubleWords(citations: readonly Citation[], runs: readonly Run[]): Finding[] {
  const cited = new Map<string, number[]>()
  const by = new Map<number, Set<string>>()
  for (const { run, path } of citations) {
    cited.set(path, [...(cited.get(path) ?? []), run])
    by.set(run, (by.get(run) ?? new Set()).add(path))
  }
  // Two prices of one item citing the same words are validate.ts's own error.
  const groups = new Map<string, { fields: Field[]; runs: number[] }>()
  for (const [at, paths] of by) {
    if (paths.size < 2) continue
    const fields = [...paths].map(fieldOf)
    if (fields.every((f) => f.kind === 'price' && f.item === fields[0]?.item)) continue
    if (shared(fields, at, runs, cited)) continue
    const key = [...paths].sort().join(' | ')
    groups.set(key, { fields, runs: [...(groups.get(key)?.runs ?? []), at] })
  }
  return [...groups.values()].map(({ fields, runs: at }) => {
    const shown = joinRuns(at.flatMap((i) => runs[i] ?? []))
    // A word of a letter or two means nothing alone: its printed line is quoted.
    const line = runs[at[0] ?? -1]?.line
    const quoted = shown.replace(/\W/g, '').length < 3 ? joinRuns(runs.filter((r) => r.line === line)) : shown
    const where = fields.map((f) => describe(f, runs, cited)).join(' and in ')
    const flagged = fields.find((f) => f.kind === 'detail' || f.kind === 'text') ?? fields[0]
    return { path: flagged?.path ?? 'page', problem: `"${quoted}" is printed once and shown twice: in ${where}` }
  })
}
