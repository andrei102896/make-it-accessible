import type { Grid } from '../pdf/backdrop.ts'
import type { Extraction } from '../pdf/types.ts'
import type { DocumentType, HeadingClass } from '../model/brief.ts'
import type { PageStructure } from '../model/schema.ts'
import type { Brand } from './brand.ts'
import type { Legend } from './inline.ts'
import type { Layout } from './layout.ts'
import type { Role } from './profile.ts'
import type { TocEntry } from './nav.ts'
import type { Strings } from './strings.ts'
import type { Theme } from './theme.ts'

export type HtmlPage = {
  keyPage: number
  structure: PageStructure
  extraction: Extraction
  flagged: readonly string[]
  imageSrc: (path: string) => string | undefined
  // The page as printed, its words included (eval/backdrop.ts): the printed view shows it under our transparent text.
  backdrop?: { src: string; src2x: string; grid: Grid } | null
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
  // The name printed as artwork the model gave no figure for (pdf/art.ts pictureIn): its crop and share of the width.
  logo?: { src: string; share: number } | null
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
  // The page's header, tail, column bands and list shapes (layout.ts); empty without a brand.
  layout: Layout
  kind: DocumentType | null
  // The brand's inline colours (profile.ts inks) and whether its prices follow the dish names; none without a brand.
  inks: ReadonlySet<string>
  inlinePrices: boolean
  // Roles set in a small-caps face: their text takes the model's case (source.ts visibleText).
  smallCaps: ReadonlySet<Role>
  // The document title's words (nav.ts titleWordsOf): a page heading that names the document is no section chip.
  titleWords: readonly string[]
  // The printed view's narrowest page width in CSS px (print.ts printWidth), null without one.
  printPx: number | null
}
