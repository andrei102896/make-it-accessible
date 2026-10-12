import { z } from 'zod'

const Range = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
const Text = z.union([
  z.object({ src: z.array(Range).min(1), text: z.string().optional() }).strict(),
  z.object({ seen: z.string().min(1) }).strict(),
])
const SourcedText = z.object({ src: z.array(Range).min(1), text: z.string().optional() }).strict()
const Box = z.tuple([z.number(), z.number(), z.number(), z.number()])
const Image = z.object({ ref: z.string().optional(), box: Box, alt: z.string().nullable() }).strict()
const Price = z
  .object({
    value: z.string().min(1),
    src: z.array(Range).min(1),
    role: z.enum(['current', 'previous', 'unit', 'discount']),
    qualifier: Text.optional(),
  })
  .strict()
const Cell = z
  .object({
    text: Text.optional(),
    prices: z.array(Price).optional(),
    header: z.enum(['col', 'row']).optional(),
    colSpan: z.number().int().min(2).optional(),
    rowSpan: z.number().int().min(2).optional(),
  })
  .strict()

const uncertain = z.string().optional()

const Item = z
  .object({
    name: SourcedText,
    prices: z.array(Price).default([]),
    unit: SourcedText.optional(),
    get details() {
      return z.array(Block).default([])
    },
    image: Image.optional(),
    uncertain,
  })
  .strict()

const Block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), level: z.number().int().min(1).max(5), text: Text, uncertain }).strict(),
  z.object({ kind: z.literal('paragraph'), text: Text, uncertain }).strict(),
  z.object({ kind: z.literal('list'), items: z.array(Text).min(1), uncertain }).strict(),
  z
    .object({ kind: z.literal('table'), caption: Text.optional(), rows: z.array(z.array(Cell)).min(1), uncertain })
    .strict(),
  z
    .object({
      kind: z.literal('products'),
      get items() {
        return z.array(Item).min(1)
      },
      uncertain,
    })
    .strict(),
  z.object({ kind: z.literal('figure'), image: Image, uncertain }).strict(),
])

const PageStructure = z
  .object({ lang: z.string().min(2), blocks: z.array(Block).min(1), dropped: z.array(Range) })
  .strict()

export type Range = z.infer<typeof Range>
export type TextValue = z.infer<typeof Text>
export type PriceValue = z.infer<typeof Price>
export type ImageValue = z.infer<typeof Image>
export type Block = z.infer<typeof Block>
export type Item = z.infer<typeof Item>
export type PageStructure = z.infer<typeof PageStructure>

// The model sometimes nests a sub-group of products inside a products list; its items belong to the parent list.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function flattenProductGroups(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v: unknown) => flattenProductGroups(v))
  if (!isRecord(value)) return value
  const node = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, flattenProductGroups(v)]))
  const items: unknown = node.items
  if (node.kind === 'products' && Array.isArray(items)) {
    node.items = items.flatMap((item: unknown): unknown[] => {
      if (!isRecord(item) || item.kind !== 'products') return [item]
      const nested: unknown = item.items
      return Array.isArray(nested) ? nested : [item]
    })
  }
  return node
}

export function parsePage(raw: string): PageStructure {
  const json = raw
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
  return PageStructure.parse(flattenProductGroups(JSON.parse(json)))
}
