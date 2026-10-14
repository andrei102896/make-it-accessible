import { z } from 'zod'

const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
// `color`: the fill colour pdftohtml reports for the word's text; runs extracted before it was read have none.
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
})
const PageImage = z.object({ id: z.string(), box: Box })
const Extraction = z.object({
  pdfPage: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  runs: z.array(Run),
  images: z.array(PageImage),
  duplicates: z.array(z.string()),
  // Words in the text layer that draw nothing visible; runs extracted before this check have none.
  hidden: z.array(z.string()).default([]),
})

export type Box = z.infer<typeof Box>
export type Run = z.infer<typeof Run>
export type PageImage = z.infer<typeof PageImage>
export type Extraction = z.infer<typeof Extraction>
export type PixelSize = { width: number; height: number }

export const parseExtraction = (json: string): Extraction => Extraction.parse(JSON.parse(json))
