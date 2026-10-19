import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { ROOT } from './paths.ts'

// The documents we measure and rebuild: each saved run with its PDF, listed locally (prospects' files stay out of
// git) in validation/private/wiki-sources.json.
const SourceSchema = z.array(
  z.object({ slug: z.string(), title: z.string(), group: z.string(), run: z.string(), pdf: z.string() }).strict(),
)
export type Source = z.infer<typeof SourceSchema>[number]

const SOURCES_FILE = join(ROOT, 'validation', 'private', 'wiki-sources.json')
// Rebuilt pages (pnpm rerender) live here, one folder per slug; local only.
export const REBUILT_DIR = join(ROOT, 'out', 'rebuilt')

// The verification set (Andrei, 2026-10-19): menus never looked at while a rule is built; rules are judged on it.
export const VERIFY_FILE = join(ROOT, 'validation', 'private', 'verify-sources.json')

export const loadSources = async (file = SOURCES_FILE): Promise<Source[]> =>
  SourceSchema.parse(JSON.parse(await readFile(file, 'utf8')))

export const sourcePdf = (s: Source): string => join(ROOT, s.pdf)
