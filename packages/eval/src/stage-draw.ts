import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { around, tiles, type Rect } from './stage-geometry.ts'

// Images a key writer reads: tiles and crops stay under ~1.15 MP, where a vision model starts to downscale.
const MAX_EDGE = 1092
const OVERLAP = 110
const OVERVIEW_PIXELS = 1_150_000
// Rulers mark PDF points every 50 pt, so a writer can give an image amount's box without guessing pixels.
const RULER_STEP = 50
// A crop shows the amount with the room where its words may sit (NEAR in key-v3-printed.ts), between half an inch
// and an inch: a headline price 40 pt tall would otherwise crop half the page.
const NEAR = 3
const MIN_MARGIN = 36
const MAX_MARGIN = 72

export type Mark = { id: string; box: Rect; unreadable: boolean }
export type Drawn = {
  tiles: { file: string; overlay: string; box: Rect }[]
  crops: { id: string; file: string; box: Rect; dpi: number }[]
  overview: { dpi: number }
}

const px = (r: Rect, s: number): Rect => ({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s })
const rect = (r: Rect, color: string, extra = ''): string =>
  `<rect x="${String(r.x)}" y="${String(r.y)}" width="${String(r.w)}" height="${String(r.h)}" fill="none" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke" ${extra}/>`
const label = (text: string, x: number, y: number, size: number, color: string): string =>
  `<text x="${String(x)}" y="${String(y)}" font-size="${String(size)}" font-family="Helvetica" font-weight="bold" fill="${color}" stroke="#fff" stroke-width="${String(size / 6)}" paint-order="stroke">${text}</text>`

// Every occurrence outlined with its id (unreadable ones blue), and the trim box dashed.
function marksSvg(marks: readonly Mark[], trim: Rect, s: number, size: number): string {
  return [
    rect(px(trim, s), '#090', 'stroke-dasharray="12 6"'),
    ...marks.map((m) => {
      const b = px(m.box, s)
      const color = m.unreadable ? '#06f' : '#e00'
      return rect(b, color) + label(m.id, b.x, b.y - size * 0.2, size, color)
    }),
  ].join('')
}

// Point rulers along a tile's top and left edges.
function rulerSvg(tile: Rect, s: number): string {
  const out: string[] = []
  for (let pt = Math.ceil(tile.x / s / RULER_STEP) * RULER_STEP; pt * s < tile.x + tile.w; pt += RULER_STEP)
    out.push(
      `<line x1="${String(pt * s)}" y1="${String(tile.y)}" x2="${String(pt * s)}" y2="${String(tile.y + 14)}" stroke="#000" stroke-width="2"/>`,
      label(String(pt), pt * s + 3, tile.y + 26, 16, '#000'),
    )
  for (let pt = Math.ceil(tile.y / s / RULER_STEP) * RULER_STEP; pt * s < tile.y + tile.h; pt += RULER_STEP)
    out.push(
      `<line x1="${String(tile.x)}" y1="${String(pt * s)}" x2="${String(tile.x + 14)}" y2="${String(pt * s)}" stroke="#000" stroke-width="2"/>`,
      label(String(pt), tile.x + 18, pt * s + 6, 16, '#000'),
    )
  return out.join('')
}

async function show(tab: Page, svg: string, scale: number): Promise<void> {
  await tab.evaluate(
    ([inner, f]) => {
      const svgEl = document.querySelector('svg')
      const box = document.querySelector<HTMLElement>('#c')
      if (!svgEl || !box) throw new Error('stage page lost its layers')
      svgEl.innerHTML = inner
      box.style.transform = `scale(${String(f)})`
    },
    [svg, scale] as const,
  )
}

async function shot(tab: Page, path: string, clip: Rect, f: number): Promise<void> {
  const c = px(clip, f)
  await tab.screenshot({
    path,
    clip: { x: Math.floor(c.x), y: Math.floor(c.y), width: Math.floor(c.w), height: Math.floor(c.h) },
  })
}

// Draws the staged images from one 300 DPI render; boxes are in PDF points (top left, the snapshot's frame).
export async function drawPage(
  render: string,
  size: { w: number; h: number },
  marks: readonly Mark[],
  trim: Rect,
  dir: string,
): Promise<Drawn> {
  const s = 300 / 72
  const W = Math.round(size.w * s)
  const H = Math.round(size.h * s)
  const browser = await chromium.launch()
  try {
    const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    const data = (await readFile(render)).toString('base64')
    await tab.setContent(
      `<body style="margin:0"><div id="c" style="position:relative;transform-origin:0 0;width:${String(W)}px;height:${String(H)}px"><img src="data:image/png;base64,${data}" style="display:block;width:${String(W)}px;height:${String(H)}px"><svg width="${String(W)}" height="${String(H)}" style="position:absolute;left:0;top:0;overflow:visible"></svg></div></body>`,
    )
    await tab.waitForFunction(() => document.querySelector('img')?.complete === true)
    const drawn: Drawn = { tiles: [], crops: [], overview: { dpi: 0 } }
    for (const t of tiles(W, H, MAX_EDGE, OVERLAP)) {
      const name = `r${String(t.row)}c${String(t.col)}.png`
      await show(tab, rulerSvg(t, s), 1)
      await shot(tab, join(dir, 'tiles', name), t, 1)
      await show(tab, rulerSvg(t, s) + marksSvg(marks, trim, s, 22), 1)
      await shot(tab, join(dir, 'overlays', name), t, 1)
      drawn.tiles.push({ file: `tiles/${name}`, overlay: `overlays/${name}`, box: px(t, 1 / s) })
    }
    for (const m of marks) {
      const box = around(m.box, size, NEAR, MIN_MARGIN, MAX_MARGIN)
      const f = Math.min(1, MAX_EDGE / (Math.max(box.w, box.h) * s))
      await show(tab, rect(px(m.box, s), m.unreadable ? '#06f' : '#e00'), f)
      await shot(tab, join(dir, 'crops', `${m.id}.png`), px(box, s), f)
      drawn.crops.push({ id: m.id, file: `crops/${m.id}.png`, box, dpi: Math.round(300 * f) })
    }
    const f = Math.min(1, Math.sqrt(OVERVIEW_PIXELS / (W * H)))
    await show(tab, rect(px(trim, s), '#090', 'stroke-dasharray="12 6"'), f)
    await shot(tab, join(dir, 'page.png'), { x: 0, y: 0, w: W, h: H }, f)
    await show(tab, marksSvg(marks, trim, s, 14 / f), f)
    await shot(tab, join(dir, 'overlay.png'), { x: 0, y: 0, w: W, h: H }, f)
    drawn.overview.dpi = Math.round(300 * f)
    return drawn
  } finally {
    await browser.close()
  }
}
