import { join } from 'node:path'

export const ROOT = join(import.meta.dirname, '..', '..', '..')
export const KEYS_DIR = join(ROOT, 'validation', 'keys')
// Sealed test-half keys stay out of git until phase C; KEYS.md holds their hashes.
export const SEALED_DIR = join(ROOT, 'validation', 'sealed')
// Word snapshots of keyed pages: derived from the publishers' PDFs, so local only (sealed ones under SEALED_DIR).
export const WORDS_DIR = join(ROOT, 'validation', 'words')
export const DOCS_DIR = join(ROOT, 'validation', 'testdocs')
export const OUT_DIR = join(ROOT, 'out')
// Open-licensed fonts vendored for embedding, each with its manifest and licence text.
export const FONTS_DIR = join(ROOT, 'packages', 'pipeline', 'fonts')
// Prospects' pages published as private previews (previews/README.md); the pages themselves stay out of git.
export const PREVIEWS_DIR = join(ROOT, 'previews')
// Where the previews are served from: the portfolio site (andreiprojects.com), deployed with the Vercel CLI.
export const PORTFOLIO_PREVIEW_DIR = join(ROOT, '..', 'portofolio', 'public', 'preview')
