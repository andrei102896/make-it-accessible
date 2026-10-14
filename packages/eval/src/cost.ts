import type { Usage } from '@make-it-accessible/pipeline/model/client'

// USD per million tokens, API list prices; cache writes and reads count as plain input (see docs/STAGE0.md).
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}
export function costUsd(model: string, usage: Usage): number {
  const price = PRICES[model]
  if (!price) throw new Error(`no price for ${model}`)
  return ((usage.input + usage.cacheWrite + usage.cacheRead) * price.input + usage.output * price.output) / 1e6
}
