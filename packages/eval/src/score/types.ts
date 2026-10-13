export type Leaf = { text: string; review: boolean }
export type Container = {
  text: string
  alts: string[]
  prices: { role: string; text: string; qualifier: string; review: boolean }[]
  review: boolean
}
export type Heading = { level: number; text: string }
export type Cell = { text: string; prices: string[] }
export type Row = { text: string; header: boolean; review: boolean; cells: Cell[] }
export type DomPage = {
  page: number
  leaves: Leaf[]
  containers: Container[]
  headings: Heading[]
  rows: Row[]
  text: string
  alts: string[]
  unsupported: boolean
}

export type PageScore = {
  keyPage: number
  c1: { textOnly: number; strict: number; outOfOrder: number; flaggedOutOfOrder: number }
  c2: {
    products: number
    errorProducts: number
    silent: number
    textErrors: number
    upperBound: number | null
    errors: string[]
  }
  c3: { missing: string[]; altered: string[]; invented: string[]; required: string[]; outsideTrim: string[] }
  c4: { ok: number; total: number; failures: string[] }
  c5: { headingsOk: number; headings: number; rowsOk: number; rows: number; silentRows: number; rowErrors: string[] }
  layout: string[] | null
  decisions: number | null
  // null: the criterion does not apply to this key page (price-only or unsupported pages, no printed-page key).
  pass: {
    c1: boolean | null
    c2: boolean | null
    c3: boolean | null
    c4: boolean | null
    c5: boolean | null
    layout: boolean | null
    unsupported: boolean | null
  }
}
export type DocScore = { pages: PageScore[]; axe: { critical: number; serious: number; rules: string[] } }
