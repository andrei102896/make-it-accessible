import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FontManifestSchema, type FontManifest } from '@make-it-accessible/pipeline/html/webfonts'
import { xHeightOf } from './font-metrics.ts'
import { FONTS_DIR } from './paths.ts'

// Vendors one Google Fonts family for embedding: only OFL or Apache, the latin woff2 files unmodified, the licence
// text beside them. Dev time only; a published page never fetches a font.
const family = process.argv[2]
if (!family) throw new Error('usage: pnpm fonts:add "<Family Name>"')
const key = family.toLowerCase().replace(/[^a-z0-9]/g, '')
// Google serves woff2 only to a browser that says it reads woff2.
const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
const REPO = 'https://raw.githubusercontent.com/google/fonts/main'

async function text(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'user-agent': BROWSER } })
  return res.ok ? res.text() : null
}

let licenseDir = ''
let metadata: string | null = null
for (const dir of ['ofl', 'apache']) {
  metadata = await text(`${REPO}/${dir}/${key}/METADATA.pb`)
  if (metadata) {
    licenseDir = dir
    break
  }
}
if (!metadata) throw new Error(`${family}: not in google/fonts under ofl/ or apache/ (no other licence is accepted)`)
const meta = metadata
const field = (name: string): string | undefined => new RegExp(`^${name}: "([^"]*)"`, 'm').exec(meta)?.[1]
const license = field('license')
if (license !== 'OFL' && license !== 'APACHE2') throw new Error(`${family}: licence ${String(license)} is not accepted`)
const copyright = /copyright: "((?:[^"\\]|\\.)*)"/.exec(metadata)?.[1]?.replace(/\\(.)/g, '$1') ?? ''
const name = field('name') ?? family
const category = ['DISPLAY', 'HANDWRITING'].includes(field('category') ?? '') ? 'display' : 'text'

// The weights to ask for: the variable wght range when there is one, else every static weight listed.
const axis = /axes \{\s*tag: "wght"\s*min_value: ([\d.]+)\s*max_value: ([\d.]+)/.exec(metadata)
const italic = /style: "italic"/.test(metadata)
const statics = [...new Set([...metadata.matchAll(/weight: (\d+)/g)].map(([, w]) => w ?? '400'))]
const weights = axis ? [`${String(Number(axis[1]))}..${String(Number(axis[2]))}`] : statics
const spec = `ital,wght@${[0, ...(italic ? [1] : [])].flatMap((i) => weights.map((w) => `${String(i)},${w}`)).join(';')}`
const css = await text(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:${spec}`)
if (!css) throw new Error(`${family}: the Google Fonts CSS API refused ${spec}`)

const dir = join(FONTS_DIR, key)
await mkdir(dir, { recursive: true })
const files: FontManifest['files'] = []
// Only the latin subset: it covers English, German and French text with £ and €.
for (const [, block] of css.matchAll(/\/\* latin \*\/\s*@font-face \{([^}]*)\}/g)) {
  const url = /url\((https:[^)]+\.woff2)\)/.exec(block ?? '')?.[1]
  const style = /font-style: (normal|italic)/.exec(block ?? '')?.[1] === 'italic' ? 'italic' : 'normal'
  // A variable range may reach 1000 (Nunito Sans 200 1000).
  const weight = /font-weight: (\d{3,4}(?: \d{3,4})?)/.exec(block ?? '')?.[1] ?? '400'
  const unicodeRange = /unicode-range: ([^;]+);/.exec(block ?? '')?.[1] ?? ''
  if (!url) continue
  const file = `${key}-${style}-${weight.replace(' ', '-')}.woff2`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${family}: download failed ${url}`)
  await writeFile(join(dir, file), new Uint8Array(await res.arrayBuffer()))
  files.push({ file, style, weight, unicodeRange })
}
const licenceText =
  (await text(`${REPO}/${licenseDir}/${key}/OFL.txt`)) ?? (await text(`${REPO}/${licenseDir}/${key}/LICENSE.txt`))
if (!licenceText) throw new Error(`${family}: licence text not found`)
await writeFile(join(dir, licenseDir === 'ofl' ? 'OFL.txt' : 'LICENSE.txt'), licenceText)
const upright = files.find((f) => f.style === 'normal') ?? files[0]
const xHeight = upright ? Math.round((await xHeightOf(join(dir, upright.file))) * 1000) / 1000 : undefined
const manifest = FontManifestSchema.parse({ family: name, key, license, copyright, category, xHeight, files })
await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.info(`${name}: ${license}, ${category}, x-height ${String(xHeight)}, ${String(files.length)} file(s) in ${dir}`)
