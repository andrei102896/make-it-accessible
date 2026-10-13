import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { ROOT } from './paths.ts'

const SETS = ['tuning', 'dev', 'test'] as const
// cover: an outer cover spread (back cover left, front cover right), read front first.
const LAYOUTS = ['single', 'spread', 'cover', 'panels', 'unsupported'] as const
const Split = z.record(z.string(), z.enum(SETS))
const LayoutLabels = z.record(z.string(), z.array(z.enum(LAYOUTS)))

export type KeySet = (typeof SETS)[number]

// Which documents are tuning, dev or the sealed test half; one document never sits in two halves.
export async function loadSplit(): Promise<Record<string, KeySet>> {
  return Split.parse(JSON.parse(await readFile(join(ROOT, 'validation', 'split.json'), 'utf8')))
}

// Hand labels for every page of every corpus PDF, to measure the layout detector on its own.
export async function loadLayoutLabels(): Promise<Record<string, (typeof LAYOUTS)[number][]>> {
  return LayoutLabels.parse(JSON.parse(await readFile(join(ROOT, 'validation', 'layout-labels.json'), 'utf8')))
}
