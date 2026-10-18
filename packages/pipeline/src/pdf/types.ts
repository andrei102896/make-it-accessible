import { z } from 'zod'

const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
// The printed face: `key` is the family name in lower-case letters and digits, `size` in points as drawn.
const Font = z
  .object({ key: z.string(), size: z.number().positive(), weight: z.number().int(), italic: z.boolean() })
  .strict()
// `color`, `font`: what pdftohtml reports for the word's text line; runs extracted before they were read have none.
const Run = z.object({
  id: z.string(),
  str: z.string(),
  box: Box,
  flow: z.number(),
  line: z.number(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/)
    .optional(),
  font: Font.optional(),
  // Its letters include a dropped ligature's, from the PDF's replacement text (pdf/ligatures.ts).
  restored: z.literal(true).optional(),
})
const PageImage = z.object({ id: z.string(), box: Box })
// A box the PDF draws round text (pdf/vectors.ts): a frame (stroke, or a filled ring) or a panel (a fill).
const Vector = z
  .object({
    kind: z.enum(['frame', 'panel']),
    box: Box,
    color: z.string().regex(/^#[0-9a-f]{6}$/),
    width: z.number().nonnegative(),
    rounded: z.boolean(),
    double: z.boolean(),
  })
  .strict()
// A straight line the PDF draws (pdf/vectors.ts): its box is the centre line (h 0 across, w 0 down); `width` is its
// thickness in points, both lines and the gap between them when double.
const Rule = z
  .object({
    box: Box,
    color: z.string().regex(/^#[0-9a-f]{6}$/),
    width: z.number().nonnegative(),
    dash: z.enum(['solid', 'dotted', 'dashed']),
    double: z.boolean(),
  })
  .strict()
// A picture the page draws (pdf/art.ts): a raster image, a group of vector drawings, or a large fill and its colour.
const Picture = z
  .object({
    box: Box,
    kind: z.enum(['raster', 'vector', 'fill']),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/)
      .nullable(),
  })
  .strict()
const Extraction = z.object({
  pdfPage: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  runs: z.array(Run),
  images: z.array(PageImage),
  duplicates: z.array(z.string()),
  // Words in the text layer that draw nothing visible; runs extracted before this check have none.
  hidden: z.array(z.string()).default([]),
  // Words a glyph the text layer dropped leaves unwhole, its letters named nowhere in the PDF (pdf/ligatures.ts).
  lost: z.array(z.string()).optional(),
  // Frames and panels from the vector layer; runs extracted before they were read have none.
  vectors: z.array(Vector).optional(),
  rules: z.array(Rule).optional(),
  pictures: z.array(Picture).optional(),
})

export type Box = z.infer<typeof Box>
export type Run = z.infer<typeof Run>
export type RunFont = z.infer<typeof Font>
export type PageImage = z.infer<typeof PageImage>
export type Vector = z.infer<typeof Vector>
export type Rule = z.infer<typeof Rule>
export type Picture = z.infer<typeof Picture>
export type Extraction = z.infer<typeof Extraction>
export type PixelSize = { width: number; height: number }

export const parseExtraction = (json: string): Extraction => Extraction.parse(JSON.parse(json))
