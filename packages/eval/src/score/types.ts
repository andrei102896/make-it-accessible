export type Leaf = { text: string; review: boolean }
export type Container = {
  text: string
  alts: string[]
  prices: { role: string; text: string; qualifier: string; review: boolean }[]
  review: boolean
  // A flagged picture: a price read from image text is confirmed by a person there.
  altReview: boolean
  // A doubt about the whole product or its row: every price in it counts as flagged.
  grouping: boolean
  row: boolean
  // Price elements anywhere inside, a nested product's included: then the text is never read as prices.
  anyPrice: boolean
}
export type Heading = { level: number; text: string }
export type Cell = { text: string; prices: string[] }
// table: which output table of the key page the row belongs to.
export type Row = { table: number; text: string; header: boolean; review: boolean; cells: Cell[] }
export type DomPage = {
  page: number
  leaves: Leaf[]
  // Blocks a page price's offer is looked for in: leaves, a product's own leaves joined as one.
  offers: Leaf[]
  containers: Container[]
  headings: Heading[]
  rows: Row[]
  text: string
  alts: string[]
  // Alt texts a person is asked to confirm (the picture or its block is flagged).
  flaggedAlts: string[]
  unsupported: boolean
}

export type PageScore = {
  keyPage: number
  c1: { textOnly: number; strict: number; outOfOrder: number; flaggedOutOfOrder: number }
  c2: {
    products: number
    errorProducts: number
    silent: number
    // Prices whose role the output does not show or the key leaves open; reported next to the headline.
    unverified: number
    textErrors: number
    upperBound: number | null
    errors: string[]
  }
  c3: {
    missing: string[]
    altered: string[]
    invented: string[]
    required: string[]
    outsideTrim: string[]
    // Whole-text coverage of the page's words, reported, not gating (null without a word list).
    coverage: Coverage | null
  }
  c4: { ok: number; total: number; failures: string[] }
  c5: {
    headingsOk: number
    headings: number
    rowsOk: number
    rows: number
    silentRows: number
    rowErrors: string[]
    headerErrors: string[]
    unchecked: number
  }
  layout: string[] | null
  decisions: number | null
  // null: the criterion does not apply to this key page (unsupported pages, no printed-page key).
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
export type Coverage = { tokens: number; missing: number; coverage: number; sample: string[] }
export type DocScore = { pages: PageScore[]; axe: { critical: number; serious: number; rules: string[] } }
