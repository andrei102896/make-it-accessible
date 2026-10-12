import { join } from 'node:path'

export const ROOT = join(import.meta.dirname, '..', '..', '..')
export const KEYS_DIR = join(ROOT, 'validation', 'keys')
export const DOCS_DIR = join(ROOT, 'validation', 'testdocs')
export const OUT_DIR = join(ROOT, 'out')
