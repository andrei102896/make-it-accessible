import { z } from 'zod'
import { Cents, Currency, Dispute, Heading, OrderEntry, PageText, Role, Section } from './key-schema.ts'

// What the page prints when the text layer cannot be read, or reads wrong, for this occurrence.
const Value = z.object({ printed: z.string().min(1), cents: Cents, currency: Currency.nullable() }).strict()
const PriceClaim = z
  .object({
    kind: z.literal('price'),
    product: z.string().min(1),
    role: Role,
    conditions: z.array(z.string().min(1)).default([]),
    // The currency when the price prints none but the page states it; defaults to what the occurrence prints.
    currency: Currency.nullable().optional(),
    value: Value.optional(),
    // The eval reader got a readable occurrence wrong: open until Andrei confirms the value.
    misread: z.enum(['open', 'confirmed']).optional(),
    // Required with role `unknown`: why the page leaves the role open.
    reason: z.string().min(1).optional(),
  })
  .strict()
// Every money occurrence of the page is claimed exactly once by one of these.
const Claim = z.discriminatedUnion('kind', [
  PriceClaim,
  z
    .object({
      kind: z.literal('cell'),
      table: z.number().int().nonnegative(),
      row: z.number().int().nonnegative(),
      col: z.number().int().nonnegative(),
    })
    .strict(),
  // A price that belongs to no product ("Everything £1").
  z
    .object({
      kind: z.literal('text'),
      role: Role.default('current'),
      currency: Currency.nullable().optional(),
      value: Value.optional(),
      misread: z.enum(['open', 'confirmed']).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('notPrice'), reason: z.string().min(1) }).strict(),
])
// "" must stay empty; `unchecked` is not scored (a picture-only cell); `same` repeats a merged neighbour.
const Cell = z.union([
  z.string(),
  z.object({ unchecked: z.string().min(1) }).strict(),
  z.object({ same: z.enum(['above', 'left']) }).strict(),
])
// A price visible only in the image; it has no occurrence in the text layer.
const SeenPrice = z
  .object({
    printed: z.string().min(1),
    cents: Cents,
    currency: Currency.nullable(),
    role: Role,
    conditions: z.array(z.string().min(1)).default([]),
  })
  .strict()
const Product = z
  .object({
    id: z.string().min(1),
    anchor: z.string().min(1),
    parent: z.string().optional(),
    articleNo: z.string().optional(),
    alt: z.string().nullable(),
    seen: z.array(SeenPrice).default([]),
    mustContain: z.array(z.string()).default([]),
  })
  .strict()
const Page = z
  .object({
    pdfPage: z.number().int().positive(),
    keyPage: z.number().int().positive(),
    type: z.enum(['grid', 'pricelist', 'table', 'text']),
    expect: z.enum(['content', 'unsupported']).default('content'),
    // SHA-256 of the frozen word snapshot the occurrence ids refer to.
    wordsSha256: z.string().regex(/^[0-9a-f]{64}$/),
    readingOrder: z.array(z.array(OrderEntry).min(1)).default([]),
    headings: z.array(Heading).default([]),
    products: z.array(Product).default([]),
    occurrences: z.record(z.string().regex(/^o\d+$/), Claim).default({}),
    tables: z.array(z.object({ header: z.array(z.string()), rows: z.array(z.array(Cell)) }).strict()).default([]),
    mustContain: z.array(PageText).default([]),
    mustNotAppear: z.array(z.string()).default([]),
    outsideTrim: z.array(z.string().min(1)).default([]),
  })
  .strict()
export const KeyDocV3Schema = z
  .object({
    version: z.literal(3),
    doc: z.string(),
    pdf: z.string(),
    lang: z.string(),
    currency: Currency,
    sections: z.array(Section).optional(),
    sectionOrders: z.array(z.array(Section)).default([]),
    disputes: z.array(Dispute).default([]),
    pages: z.array(Page).min(1),
  })
  .strict()

export type KeyDocV3 = z.infer<typeof KeyDocV3Schema>
export type KeyPageV3 = KeyDocV3['pages'][number]
export type CellV3 = z.infer<typeof Cell>
