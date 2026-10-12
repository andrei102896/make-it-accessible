import type { PixelSize, Extraction } from '../pdf/types.ts'
import { callModel, type ModelCall, type ModelOptions } from './client.ts'
import { inventory } from './prompt.ts'
import { parsePage, type PageStructure } from './schema.ts'

export type StructureResult = { page: PageStructure; calls: ModelCall[] }

// `review` returns a reason to retry once (e.g. a large part of the page left out), or null to accept.
export async function structurePage(
  e: Extraction,
  size: PixelSize,
  imagePath: string,
  options: ModelOptions,
  review: (page: PageStructure) => string | null,
): Promise<StructureResult> {
  const userText = inventory(e, size)
  const first = await callModel(imagePath, userText, options)
  let reason: string
  try {
    const page = parsePage(first.raw)
    const problem = review(page)
    if (problem === null) return { page, calls: [first] }
    reason = problem
  } catch (error) {
    reason = error instanceof Error ? error.message.slice(0, 2000) : String(error)
  }
  const retry = await callModel(
    imagePath,
    `${userText}\n\nYour previous answer was rejected: ${reason}\nReturn the corrected, complete JSON object only.`,
    options,
  )
  return { page: parsePage(retry.raw), calls: [first, retry] }
}
