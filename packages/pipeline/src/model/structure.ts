import type { PixelSize, Extraction } from '../pdf/types.ts'
import { callModel, type ModelCall, type ModelOptions } from './client.ts'
import { inventory } from './prompt.ts'
import { parsePage, type PageStructure } from './schema.ts'

export type StructureResult = { page: PageStructure; calls: ModelCall[]; kept?: 'first' | 'retry' }
// Why an answer is asked again (null: accepted), and its weight: counts compared in order, the lower answer kept.
export type Review = { reason: string | null; weight: readonly number[] }

// A retry is kept only when it weighs less on one count and more on none (it cannot trade an error for lost words).
export const better = (retry: readonly number[], first: readonly number[]): boolean =>
  retry.every((n, i) => n <= (first[i] ?? 0)) && retry.some((n, i) => n < (first[i] ?? 0))

// `review` returns why the answer is asked once more (it sees its own answer and the findings), or null to accept.
export async function structurePage(
  e: Extraction,
  size: PixelSize,
  imagePath: string,
  options: ModelOptions,
  review: (page: PageStructure) => Review,
  call: typeof callModel = callModel,
): Promise<StructureResult> {
  const userText = inventory(e, size)
  const first = await call(imagePath, userText, options)
  let page: PageStructure | null = null
  let found: Review
  try {
    page = parsePage(first.raw)
    found = review(page)
    if (found.reason === null) return { page, calls: [first] }
  } catch (error) {
    found = { reason: error instanceof Error ? error.message.slice(0, 2000) : String(error), weight: [] }
  }
  const previous = page ? `\n\nYour previous answer:\n${JSON.stringify(page)}` : ''
  const retry = await call(
    imagePath,
    `${userText}${previous}\n\nChecked against the print: ${found.reason}\nReturn the corrected, complete JSON object only.`,
    options,
  )
  const calls = [first, retry]
  let again: PageStructure
  try {
    again = parsePage(retry.raw)
  } catch (error) {
    // A retry that does not parse keeps a first that did; neither parsing throws.
    if (page) return { page, calls, kept: 'first' }
    throw error
  }
  if (!page) return { page: again, calls, kept: 'retry' }
  return better(review(again).weight, found.weight)
    ? { page: again, calls, kept: 'retry' }
    : { page, calls, kept: 'first' }
}
