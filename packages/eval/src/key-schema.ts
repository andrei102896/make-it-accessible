import { z } from 'zod'
import { CURRENCIES } from './score/money.ts'

export const Currency = z.enum(CURRENCIES)
// previousUnit: a previous price per unit ("1 kg: 9,99, statt 12,99"); unknown: the page leaves the role open.
const ROLES = ['current', 'previous', 'unit', 'previousUnit', 'discount', 'deposit', 'unknown'] as const
export const Role = z.enum(ROLES)
// Pence may carry a tenth ("16.7p"), so an amount in cents has at most one decimal.
export const Cents = z.number().refine((c) => Math.abs(c * 10 - Math.round(c * 10)) < 1e-6, 'at most one decimal')
export const OrderEntry = z.object({ anchor: z.string().min(1), kind: z.enum(['text', 'imageOnlyText']) }).strict()
export const Heading = z.object({ anchor: z.string().min(1), level: z.number().int().min(1).max(6) }).strict()
export const PageText = z.union([
  z.string().min(1),
  z.object({ text: z.string().min(1), seen: z.literal(true) }).strict(),
])
// One printed amount; `conditions` must all be printed with it ("was", "Lidl Plus", "1 kg").
const KeyPrice = z
  .object({
    printed: z.string().min(1),
    cents: Cents,
    role: Role,
    currency: Currency.nullable(),
    conditions: z.array(z.string().min(1)).default([]),
    // Not provable from the text layer (only in the image, or an unmapped glyph): must be published flagged.
    seen: z.literal(true).optional(),
  })
  .strict()
const Product = z
  .object({
    id: z.string().optional(),
    // A product whose price may be published with its parent or on its own (an add-on, an accessory).
    parent: z.string().optional(),
    anchor: z.string().min(1),
    articleNo: z.string().optional(),
    // null: the product has no picture, so C4 does not score it.
    alt: z.string().nullable().optional(),
    prices: z.array(KeyPrice).optional(),
    // Stage-0 keys list amounts per product; version-3 keys produce `prices`.
    money: z.array(z.number().int()).min(1).optional(),
    old: z.array(z.number().int()).default([]),
    roleFree: z.array(z.number().int()).default([]),
    optional: z.array(z.number().int()).default([]),
    mustContain: z.array(z.string()).default([]),
  })
  .strict()
  .refine((p) => (p.prices === undefined) !== (p.money === undefined), 'a product has either prices or money')
// null: a cell that is not checked (stage-0 keys write it as "").
const Table = z.object({ header: z.array(z.string()), rows: z.array(z.array(z.string().nullable())) }).strict()
const KeyPage = z
  .object({
    pdfPage: z.number().int().positive(),
    keyPage: z.number().int().positive(),
    type: z.enum(['grid', 'pricelist', 'table', 'text']),
    expect: z.enum(['content', 'unsupported']).default('content'),
    readingOrder: z.array(z.array(OrderEntry).min(1)).default([]),
    products: z.array(Product).default([]),
    headings: z.array(Heading).default([]),
    tables: z.array(Table).default([]),
    mustNotAppear: z.array(z.string()).default([]),
    // Zero tolerance: image text with a digit (`seen`) and slug text outside the trim box.
    mustContain: z.array(PageText).default([]),
    outsideTrim: z.array(z.string().min(1)).default([]),
    // Version-3 keys: "" is an empty cell, headers are checked, rows match one output table one to one.
    strict: z.boolean().default(false),
    // Prices that belong to no product ("Everything £1"): published as text or as a price.
    textPrices: z.array(KeyPrice).default([]),
    // Price cells claimed as printed amounts (version-3 keys).
    pricedCells: z.number().int().optional(),
  })
  .strict()
// Printed pages in reading order across the document: spreads and folded panels publish several per PDF page.
export const Section = z
  .object({
    keyPage: z.number().int().positive(),
    label: z.string().nullable(),
    anchors: z.array(z.string()).default([]),
  })
  .strict()
export const Dispute = z.object({ keyPage: z.number().int().positive(), note: z.string().min(1) }).strict()
export const KeyDocSchema = z
  .object({
    doc: z.string(),
    pdf: z.string(),
    lang: z.string(),
    currency: Currency,
    sections: z.array(Section).optional(),
    // Other acceptable orders of the same printed pages (folded panels read in more than one sensible order).
    sectionOrders: z.array(z.array(Section)).default([]),
    pages: z.array(KeyPage).min(1),
    // Questions a key writer could not settle from the page; a key with open disputes cannot be frozen.
    disputes: z.array(Dispute).default([]),
  })
  .strict()

export type KeyPrice = z.infer<typeof KeyPrice>
export type KeyProduct = z.infer<typeof Product>
export type KeyPage = z.infer<typeof KeyPage>
export type KeySection = z.infer<typeof Section>
export type KeyRole = z.infer<typeof Role>
