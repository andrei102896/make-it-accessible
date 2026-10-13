import { z } from 'zod'
import { CURRENCIES } from './score/money.ts'

const Currency = z.enum(CURRENCIES)
const OrderEntry = z.object({ anchor: z.string().min(1), kind: z.enum(['text', 'imageOnlyText']) }).strict()
// One printed amount: `printed` as on the page, `currency` null when the document prints none.
const KeyPrice = z
  .object({
    printed: z.string().min(1),
    cents: z.number().int(),
    role: z.enum(['current', 'previous', 'unit', 'discount', 'any']),
    currency: Currency.nullable(),
    qualifier: z.string().min(1).optional(),
    optional: z.boolean().default(false),
  })
  .strict()
const Product = z
  .object({
    anchor: z.string().min(1),
    articleNo: z.string().optional(),
    // null: the product has no picture, so C4 does not score it.
    alt: z.string().nullable().optional(),
    prices: z.array(KeyPrice).min(1).optional(),
    // Stage-0 keys list amounts per product; new keys use `prices`.
    money: z.array(z.number().int()).min(1).optional(),
    old: z.array(z.number().int()).default([]),
    roleFree: z.array(z.number().int()).default([]),
    optional: z.array(z.number().int()).default([]),
    mustContain: z.array(z.string()).default([]),
  })
  .strict()
  .refine((p) => (p.prices === undefined) !== (p.money === undefined), 'a product has either prices or money')
const PageText = z.union([z.string().min(1), z.object({ text: z.string().min(1), seen: z.literal(true) }).strict()])
const KeyPage = z
  .object({
    pdfPage: z.number().int().positive(),
    keyPage: z.number().int().positive(),
    type: z.enum(['grid', 'pricelist', 'table', 'text']),
    scope: z.enum(['full', 'prices']).default('full'),
    expect: z.enum(['content', 'unsupported']).default('content'),
    readingOrder: z.array(z.array(OrderEntry).min(1)).default([]),
    products: z.array(Product).default([]),
    headings: z
      .array(z.object({ anchor: z.string().min(1), level: z.number().int().min(1).max(6) }).strict())
      .default([]),
    tables: z.array(z.object({ header: z.array(z.string()), rows: z.array(z.array(z.string())) }).strict()).default([]),
    mustNotAppear: z.array(z.string()).default([]),
    // Zero tolerance: image text with a digit (`seen`) and slug text outside the trim box.
    mustContain: z.array(PageText).default([]),
    outsideTrim: z.array(z.string().min(1)).default([]),
  })
  .strict()
// Printed pages in reading order across the document: spreads and folded panels publish several per PDF page.
const Section = z
  .object({
    keyPage: z.number().int().positive(),
    label: z.string().nullable(),
    anchors: z.array(z.string()).default([]),
  })
  .strict()
export const KeyDocSchema = z
  .object({
    doc: z.string(),
    pdf: z.string(),
    lang: z.string(),
    currency: Currency,
    sections: z.array(Section).optional(),
    pages: z.array(KeyPage).min(1),
  })
  .strict()

export type KeyPrice = z.infer<typeof KeyPrice>
export type KeyProduct = z.infer<typeof Product>
export type KeyPage = z.infer<typeof KeyPage>
export type KeySection = z.infer<typeof Section>
