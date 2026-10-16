import type { Extraction } from '../pdf/types.ts'
import type { DocumentType, HeadingClass } from '../model/brief.ts'
import type { PageStructure } from '../model/schema.ts'
import type { Brand } from './brand.ts'
import type { Legend } from './inline.ts'
import type { Layout } from './layout.ts'
import type { TocEntry } from './nav.ts'
import type { Strings } from './strings.ts'
import type { Theme } from './theme.ts'

export type HtmlPage = {
  keyPage: number
  structure: PageStructure
  extraction: Extraction
  flagged: readonly string[]
  imageSrc: (path: string) => string | undefined
}
// `kind`, `headings` and `validity` come from the document brief; without one the page is laid out from its blocks.
export type HtmlDocument = {
  lang: string
  title: string
  pages: HtmlPage[]
  theme?: Theme | null
  kind?: DocumentType | null
  headings?: HeadingClass | null
  validity?: string | null
  brand?: Brand | null
}
// `masthead`: the first page's header, placed before the navigation.
export type Rendered = { html: string; toc: TocEntry[]; masthead: string }
export type Context = {
  ui: Strings
  lang: string
  index: number
  long: boolean
  legend: Legend
  running: Set<string>
  // Per heading (profile key), the classes of its printed style (brand.ts headingClasses).
  classes: ReadonlyMap<string, string>
  // The page's header, tail and column bands (layout.ts); empty without a brand.
  layout: Layout
}
