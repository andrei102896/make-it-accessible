import { z } from 'zod'
import { Cents, Currency, Dispute, Heading, OrderEntry, PageText, Role, Section } from './key-schema.ts'

// What the page prints for a price, read from the render: for an unreadable, misread or manual amount.
const Value = z.object({ printed: z.string().min(1), cents: Cents, currency: Currency.nullable() }).strict()
// A value overriding a readable occurrence stays open until Andrei confirms it.
const Misread = z.enum(['open', 'confirmed'])
// Where a claimed amount goes; every destination takes the same value and misread fields.
const Corrected = { value: Value.optional(), misread: Misread.optional() }
const Claim = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('price'),
      product: z.string().min(1),
      role: Role,
      conditions: z.array(z.string().min(1)).default([]),
      // The currency when the price prints none but the page states it; defaults to what the amount prints.
      currency: Currency.nullable().optional(),
      // Required with role `unknown`: why the page leaves the role open (an accepted, documented uncertainty).
      reason: z.string().min(1).optional(),
      ...Corrected,
    })
    .strict(),
  z
    .object({
      kind: z.literal('cell'),
      table: z.number().int().nonnegative(),
      row: z.number().int().nonnegative(),
      col: z.number().int().nonnegative(),
      ...Corrected,
    })
    .strict(),
  // A price that belongs to no product ("Everything £1"); its conditions are the words of the offer printed with it.
  z
    .object({
      kind: z.literal('text'),
      role: Role.default('current'),
      conditions: z.array(z.string().min(1)).default([]),
      currency: Currency.nullable().optional(),
      reason: z.string().min(1).optional(),
      ...Corrected,
    })
    .strict(),
  z.object({ kind: z.literal('notPrice'), reason: z.string().min(1) }).strict(),
  // The reader joined several prices into this occurrence; the manual entries named here are the prices.
  z.object({ kind: z.literal('split'), into: z.array(z.string().regex(/^m\d+$/)).min(2) }).strict(),
  // The reader cut one price in two; this occurrence is part of the one named, whose claim carries the whole value.
  z.object({ kind: z.literal('merged'), into: z.string().regex(/^o\d+$/) }).strict(),
])
// An amount the ledger does not give: missed by the reader (its words cited), part of a split, or only in the image.
const Manual = z
  .object({
    source: z.enum(['missed', 'split', 'image']),
    words: z.array(z.number().int().nonnegative()).default([]),
    ...Value.shape,
    // Andrei confirms every manual amount before the freeze.
    confirmed: z.boolean().default(false),
  })
  .strict()
// "" must stay empty; `unchecked` is not scored (a picture-only cell); `same` repeats a merged neighbour.
const Cell = z.union([
  z.string(),
  z.object({ unchecked: z.string().min(1) }).strict(),
  z.object({ same: z.enum(['above', 'left']) }).strict(),
])
const Product = z
  .object({
    id: z.string().min(1),
    anchor: z.string().min(1),
    parent: z.string().optional(),
    articleNo: z.string().optional(),
    alt: z.string().nullable(),
    mustContain: z.array(z.string()).default([]),
  })
  .strict()
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const Page = z
  .object({
    pdfPage: z.number().int().positive(),
    keyPage: z.number().int().positive(),
    type: z.enum(['grid', 'pricelist', 'table', 'text']),
    expect: z.enum(['content', 'unsupported']).default('content'),
    // The frozen word snapshot and the ledger built from it: occurrence ids mean what they meant when written.
    wordsSha256: Sha256,
    ledgerSha256: Sha256,
    readingOrder: z.array(z.array(OrderEntry).min(1)).default([]),
    headings: z.array(Heading).default([]),
    products: z.array(Product).default([]),
    manual: z.record(z.string().regex(/^m\d+$/), Manual).default({}),
    occurrences: z.record(z.string().regex(/^[om]\d+$/), Claim).default({}),
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
    // The PDF the snapshots were taken from.
    pdfSha256: Sha256,
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
export type ClaimV3 = KeyPageV3['occurrences'][string]
export type ManualV3 = z.infer<typeof Manual>
