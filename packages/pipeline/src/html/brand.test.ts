import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brandCss, type Brand } from './brand.ts'
import { contrast, fromHex } from './color.ts'
import type { Profile, RoleStyle } from './profile.ts'
import { familyFor, fileFor, fontFaces, withinBudget, type FontManifest } from './webfonts.ts'

const manifest = (family: string, category: 'text' | 'display', weights: string[]): FontManifest => ({
  family,
  key: family.toLowerCase().replace(/[^a-z0-9]/g, ''),
  license: 'OFL',
  copyright: `Copyright The ${family} Authors`,
  category,
  files: weights.map((w) => ({
    file: `f-${w.replace(' ', '-')}.woff2`,
    style: 'normal',
    weight: w,
    unicodeRange: 'U+0000-00FF',
  })),
})
const library = [
  manifest('Oswald', 'text', ['200 700']),
  manifest('Stardos Stencil', 'display', ['400', '700']),
  manifest('EB Garamond', 'text', ['400 800']),
  manifest('Arimo', 'text', ['400 700']),
  manifest('Barlow', 'text', ['400', '700']),
  manifest('Bodoni Moda', 'text', ['400 900']),
  manifest('Lato', 'text', ['400', '700']),
  manifest('Caveat', 'display', ['400 700']),
]

test('a printed family finds its vendored face, a longer name by prefix, a commercial one its stand-in', () => {
  assert.equal(familyFor('oswald', library)?.family, 'Oswald')
  assert.equal(familyFor('oswaldlight', library)?.family, 'Oswald')
  assert.equal(familyFor('adobegaramondpro', library)?.family, 'EB Garamond')
  assert.equal(familyFor('garamondclassicfs', library)?.family, 'EB Garamond')
  assert.equal(familyFor('helveticaneue', library)?.family, 'Arimo')
  assert.equal(familyFor('arialmt', library)?.family, 'Arimo')
  assert.equal(familyFor('dinot', library)?.family, 'Barlow')
  assert.equal(familyFor('dinnextltpro', library)?.family, 'Barlow')
  assert.equal(familyFor('bodoniflf', library)?.family, 'Bodoni Moda')
  assert.equal(familyFor('bodoniegyptianpro', library)?.family, 'Bodoni Moda')
  assert.equal(familyFor('inkwellsans', library)?.family, 'Lato')
  assert.equal(familyFor('axiforma', library), undefined)
  // A longer name is the same family only when the rest is a weight or style word.
  assert.equal(familyFor('oswaldsemibolditalic', library)?.family, 'Oswald')
  assert.equal(familyFor('oswaldstencil', library), undefined)
  assert.equal(familyFor('dinosaur', library), undefined)
})

test('fonts to embed: most-used first, within the file count and the byte budget', () => {
  const wanted = [
    { id: 'a', words: 5, bytes: 90 },
    { id: 'b', words: 50, bytes: 60 },
    { id: 'c', words: 20, bytes: 50 },
    { id: 'd', words: 10, bytes: 30 },
  ]
  assert.deepEqual(
    withinBudget(wanted, 3, 150).map((w) => w.id),
    ['b', 'c', 'd'],
  )
  assert.deepEqual(
    withinBudget(wanted, 1, 150).map((w) => w.id),
    ['b'],
  )
})

test('a weight is drawn by the variable file containing it, else the nearest static weight', () => {
  const [oswald, stencil] = library
  assert.ok(oswald && stencil)
  assert.equal(fileFor(oswald, 600, false)?.weight, '200 700')
  assert.equal(fileFor(stencil, 800, false)?.weight, '700')
  assert.equal(fileFor(stencil, 300, false)?.weight, '400')
})

test('each embedded face carries its copyright and licence, and nothing is fetched', () => {
  const [oswald] = library
  assert.ok(oswald)
  const css = fontFaces([
    {
      manifest: oswald,
      file: oswald.files[0] ?? { file: '', style: 'normal', weight: '400', unicodeRange: '' },
      data: new Uint8Array([1, 2, 3]),
    },
  ])
  assert.match(css, /Copyright The Oswald Authors SIL Open Font License 1\.1/)
  assert.match(css, /src: url\(data:font\/woff2;base64,AQID\)/)
  assert.doesNotMatch(css, /https?:/)
})

const style = (key: string, size: number, color: string, words = 2): RoleStyle => ({
  face: { key, weight: 400, italic: false },
  size,
  color,
  caps: true,
  words,
})
const profile = (signatures: RoleStyle[], roles: Profile['roles'] = {}): Profile => ({
  body: 14,
  roles,
  signatures,
  headings: new Map([['0:blocks[0]', 0]]),
  accent: '#dd2931',
  headingBoxes: [],
  itemBoxes: [],
  pricesInline: false,
  inks: [],
})
const brand = (p: Profile, background = '#ffffff'): Brand => ({
  profile: p,
  library,
  faces: library.map((m) => ({
    manifest: m,
    file: m.files[0] ?? { file: '', style: 'normal', weight: '400', unicodeRange: '' },
    data: new Uint8Array(),
  })),
  background,
  rules: [],
  dividers: null,
  alternate: null,
  ornaments: [],
})

test('a small-caps role synthesises small caps; a hand-print display face dresses names, never prices', () => {
  const names = {
    name: { ...style('bodonibt', 16, '#000000'), smallCaps: true },
    price: style('bimbo', 16, '#000000'),
  }
  const css = brandCss(brand(profile([], names)))
  assert.match(
    css,
    /\.products\.menu \.name, \.products\.cards \.name \{[^}]*font-variant-caps: small-caps; font-synthesis: small-caps/,
  )
  assert.match(css, /\.products\.menu \.name, \.products\.cards \.name \{ font-family: "Bodoni Moda"/)
  assert.doesNotMatch(
    css,
    /\.products\.menu \.prices, \.products\.menu \.price\[data-role="current"\], td\.num \{ font-family: "Caveat"/,
  )
  assert.match(brandCss(brand(profile([], { name: style('bimbo', 16, '#000000') }))), /\.name \{ font-family: "Caveat"/)
  // The measured price weight reaches the price itself, past the base rule's bold.
  assert.match(
    css,
    /\.products\.menu \.prices, \.products\.menu \.price\[data-role="current"\], td\.num \{[^}]*font-weight: 400/,
  )
})

test('a page that prints a role in another weight than the document keeps its own weight', () => {
  const p = profile([], { name: style('gotham', 11, '#000000') })
  const bold: RoleStyle = { ...style('gotham', 11, '#000000'), face: { key: 'gotham', weight: 900, italic: false } }
  const css = brandCss({ ...brand({ ...p, pageRoles: [{ name: bold }, {}] }), pages: [1, 2] })
  assert.match(
    css,
    /section\[data-page="1"\] :is\(\.products\.menu \.name, \.products\.cards \.name\) \{[^}]*font-weight: 900/,
  )
  assert.doesNotMatch(css, /section\[data-page="2"\]/)
})

test('a name read from the image (a wordmark) takes a wordmark size; the masthead keeps room above it', () => {
  const css = brandCss({ ...brand(profile([])), masthead: { key: '0:blocks[9]', logoShare: null } })
  assert.match(css, /\.masthead-title \{ font-size: clamp\(1\.5rem, min\(3\.188rem, 11vw\), 4\.5rem\)/)
  assert.match(css, /\.masthead \{ margin: 2\.5rem 0; text-align: center; \}/)
})

test('a heading in a display face never shrinks below the size it was admitted at', () => {
  const css = brandCss(brand({ ...profile([style('bimbo', 20, '#000000', 1)]), body: 13 }))
  assert.match(css, /\.hs-1 \{ font-family: "Caveat"[^}]*font-size: clamp\(1\.5rem,/)
})

test('every text role reaches 4.5:1 on the page: a pale printed colour is darkened, not replaced', () => {
  const css = brandCss(brand(profile([], { desc: style('oswald', 14, '#9a9a9a') })))
  const colour = /:not\(\.name, \.prices\), \.products\.cards \.more > p \{[^}]*color: (#[0-9a-f]{6})/.exec(css)?.[1]
  assert.ok(colour)
  assert.ok(contrast(fromHex(colour), [255, 255, 255]) >= 4.5)
})

test('a display face only for short, large headings; condensed capitals tracked, never transformed', () => {
  const short = brandCss(brand(profile([style('stardosstencil', 23, '#dd2931', 2)])))
  assert.match(short, /\.hs-1 \{ font-family: "Stardos Stencil"/)
  assert.doesNotMatch(short, /letter-spacing/)
  assert.match(brandCss(brand(profile([style('oswald', 17, '#000000')]))), /letter-spacing: \.08em/)
  const long = brandCss(brand(profile([style('stardosstencil', 23, '#dd2931', 9)])))
  assert.doesNotMatch(long, /\.hs-1 \{ font-family: "Stardos Stencil"/)
  assert.doesNotMatch(short + long, /text-transform|content:\s*"[^"]|hyphens: auto/)
  assert.match(short, /overflow-wrap: break-word; hyphens: manual/)
})

test('measured sizes are kept within limits: a 48 pt leaflet price over 8 pt text is not 6rem', () => {
  const css = brandCss(
    brand({
      ...profile([style('oswald', 60, '#000000')], {
        price: style('oswald', 48, '#000000'),
        name: style('oswald', 12, '#000000'),
      }),
      body: 8,
    }),
  )
  assert.match(
    css,
    /\.products\.menu \.prices, \.products\.menu \.price\[data-role="current"\], td\.num \{[^}]*font-size: 1\.594rem/,
  )
  assert.match(css, /\.hs-1 \{[^}]*font-size: clamp\(1\.8rem, 1\.32rem \+ 2vw, 2\.4rem\)/)
})

test('on a dark page the accent is checked against that page, not against white', () => {
  const css = brandCss(brand({ ...profile([]), accent: '#282848' }, '#282848'))
  const accent = /--accent: (#[0-9a-f]{6})/.exec(css)?.[1]
  assert.ok(accent)
  assert.ok(contrast(fromHex(accent), fromHex('#282848')) >= 4.5)
})

test('the page follows the document: white stays light, a dark document gets the dark palette', () => {
  assert.doesNotMatch(brandCss(brand(profile([]))), /color-scheme: dark/)
  assert.match(brandCss(brand(profile([]), '#1a1a1a')), /--fg: #f2f2f2;.*color-scheme: dark/)
})

test("a brand colour that reads only after a large move gives way to the document's other brand colour", () => {
  const yellow = brand({ ...profile([style('oswald', 23, '#f8e808')]), accent: '#f8e808' })
  const css = brandCss({ ...yellow, alternate: '#085858' })
  assert.match(css, /\.hs-1 \{[^}]*color: #085858/)
  assert.match(css, /--accent: #085858/)
  assert.doesNotMatch(brandCss(yellow), /color: #f8e808/)
})

test('sizes keep the hierarchy: headings above names even on a phone, levels compressed not merged, details under names', () => {
  const names = { name: style('oswald', 15, '#000000'), desc: style('ebgaramond', 20, '#000000') }
  const css = brandCss(
    brand({
      ...profile(
        [style('oswald', 40, '#000000'), style('oswald', 30, '#000000'), style('oswald', 13, '#000000')],
        names,
      ),
      body: 10,
    }),
  )
  const minimums = [...css.matchAll(/\.hs-\d \{[^}]*font-size: clamp\(([\d.]+)rem, [^,]+, ([\d.]+)rem\)/g)]
  assert.equal(minimums.length, 3)
  const nameSize = Number(
    /\.products\.menu \.name, \.products\.cards \.name \{[^}]*font-size: ([\d.]+)rem/.exec(css)?.[1],
  )
  for (const [, min] of minimums) assert.ok(Number(min) >= nameSize * 1.1 - 0.001)
  const tops = minimums.map(([, , max]) => Number(max))
  assert.ok((tops[0] ?? 0) > (tops[1] ?? 0) && (tops[1] ?? 0) > (tops[2] ?? 0))
  const descSize = Number(
    /:not\(\.name, \.prices\), \.products\.cards \.more > p \{[^}]*font-size: ([\d.]+)rem/.exec(css)?.[1],
  )
  assert.ok(descSize <= nameSize)
})

test('only a small-eyed face is scaled up in running text; names and card prices reset the scaling', () => {
  const small = { ...manifest('Josefin Sans', 'text', ['100 700']), xHeight: 0.414 }
  const tall = { ...manifest('Roboto', 'text', ['100 900']), xHeight: 0.528 }
  const withLibrary = (p: Profile): Brand => ({
    ...brand(p),
    library: [small, tall],
    faces: [small, tall].map((m) => ({
      manifest: m,
      file: m.files[0] ?? { file: '', style: 'normal', weight: '400', unicodeRange: '' },
      data: new Uint8Array(),
    })),
  })
  const roles = (key: string): Profile['roles'] => ({
    desc: style(key, 14, '#000000'),
    name: style(key, 14, '#000000'),
    price: style(key, 14, '#000000'),
  })
  const josefin = brandCss(withLibrary(profile([], roles('josefinsans'))))
  assert.match(
    josefin,
    /:not\(\.name, \.prices\), \.products\.cards \.more > p \{[^}]*font-size-adjust: ex-height 0\.46/,
  )
  assert.match(josefin, /\.products\.cards \.name \{[^}]*font-size-adjust: none/)
  assert.match(josefin, /\.products\.cards \.price\[data-role="current"\] \{[^}]*font-size-adjust: none/)
  assert.doesNotMatch(brandCss(withLibrary(profile([], roles('roboto')))), /ex-height/)
})
