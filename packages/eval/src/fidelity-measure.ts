import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { SHEET } from '@make-it-accessible/pipeline/html/print'
import { CELL, parseGrid } from '@make-it-accessible/pipeline/pdf/backdrop'
import { scorePage } from '@make-it-accessible/pipeline/pdf/fidelity'
import { scoreOutside } from '@make-it-accessible/pipeline/pdf/fidelity-outside'
import { INK, type LineInput, type PageScore, type ScoreInput } from '@make-it-accessible/pipeline/pdf/fidelity-types'
import { parseExtraction, type Box } from '@make-it-accessible/pipeline/pdf/types'
import { PDFJS_TIMEOUT_MS, withDeadline } from './deadline.ts'
import { CAPTURE_PX, openPdf, type PdfTab } from './pdfshot.ts'
import { pageDir } from './process.ts'

// Each page of a built document measured against its PDF (pipeline/pdf/fidelity.ts): sheet, ground (the sheet
// with its placed text hidden) and the PDF drawn in one Chromium at one scale; pixels stay in the browser.

// The sheet's own scale (2.4 px/pt on A4): the backdrop is drawn at 2.7, a 2× capture would blur it against pdf.js.
const SCALE = 1
const PAD = 0.25
// Two renders of one page at one width differ in height by rounding only.
const SAME_HEIGHT = 2

// Why a page was not measured: a scan has no backdrop; two renders that differ in height do not compare; a stall.
export type Skip = 'scan' | 'height' | 'stall'
export type PageFidelity =
  | ({ keyPage: number; pdfPage: number; sheetPx: number; mutated: number[] } & PageScore)
  | { keyPage: number; skipped: Skip; detail: string }
// Defects injected into our sheet before it is measured (pnpm fidelity --inject): a copy 0.3 em off (Howies' false
// shadows measured 0.28-0.88 em), a dark glow, ink at a fifth of its strength, a price one line height down.
export const MUTATIONS = ['doubled', 'halo', 'faint', 'price-moved'] as const
export type Mutation = (typeof MUTATIONS)[number]
type Sheet = { keyPage: number; sheetPx: number; lines: LineInput[]; mutated: number[] }

export async function measureDocument(
  browser: Browser,
  docDir: string,
  pdf: string,
  mutate: Mutation | null = null,
): Promise<PageFidelity[]> {
  const context = await browser.newContext({ viewport: { width: CAPTURE_PX, height: 900 }, deviceScaleFactor: SCALE })
  let pdfTab: PdfTab | null = null
  try {
    const tab = await context.newPage()
    await tab.goto(`file://${encodeURI(join(docDir, 'index.html'))}`)
    await tab.waitForLoadState('networkidle')
    await tab.addStyleTag({ content: '.view, nav.toc { display: none }' })
    await tab.evaluate(() => document.fonts.ready)
    const sheets = await tab.evaluate(inventory, { sheetSelector: SHEET, mutate })
    const out: PageFidelity[] = []
    for (const [i, sheet] of sheets.entries()) {
      const dir = pageDir(docDir, sheet.keyPage)
      const e = parseExtraction(await readFile(join(dir, 'extraction.json'), 'utf8'))
      const gridJson = await readFile(join(dir, 'backdrop.json'), 'utf8').catch(() => null)
      if (gridJson === null || e.runs.some((r) => r.ocr)) {
        out.push({ keyPage: sheet.keyPage, skipped: 'scan', detail: 'no backdrop' })
        continue
      }
      const k = (sheet.sheetPx / e.width) * SCALE
      const keptIds = new Set(parseGrid(gridJson).kept)
      // Words left printed and the page's pictures are the backdrop's own: two rasterisers differ on a photo or
      // a drawing (Kenny & Ziggy's wood, 2026-10-19), so the outside measure keeps to rules, frames and dots.
      const kept = [
        ...e.runs.filter((r) => keptIds.has(r.id)).map((r) => r.box),
        ...(e.pictures ?? []).filter((q) => q.kind !== 'fill').map((q) => q.box),
      ].map((b) => scaleBox(b, k))
      const locator = tab.locator(SHEET).nth(i)
      const sheetPng = await locator.screenshot({ type: 'png' })
      // Our effects off, the style tag removed after: an inline `--ts` loses only to an important rule.
      const plain = await tab.addStyleTag({ content: '[style*="--x:"] { text-shadow: none !important }' })
      const plainPng = await locator.screenshot({ type: 'png' })
      await plain.evaluate((el) => {
        el.parentNode?.removeChild(el)
      })
      const hide = await tab.addStyleTag({ content: '[style*="--x:"] { visibility: hidden }' })
      const groundPng = await locator.screenshot({ type: 'png' })
      await hide.evaluate((el) => {
        el.parentNode?.removeChild(el)
      })
      pdfTab ??= await openPdf(browser, pdf, CAPTURE_PX * SCALE)
      // Names replaced each page; the query keeps the tab from showing a cached picture of the page before.
      const name = `${String(sheet.keyPage)}-${String(Date.now())}`
      pdfTab.serve('sheet.png', sheetPng)
      pdfTab.serve('ground.png', groundPng)
      pdfTab.serve('plain.png', plainPng)
      try {
        await pdfTab.draw(e.pdfPage, Math.round(sheet.sheetPx) * SCALE)
        const input = await withDeadline(
          pdfTab.tab.evaluateHandle(loadInput, {
            name,
            lines: sheet.lines.map((l) => ({ ...l, box: scaleBox(l.box, SCALE) })),
            kept,
            cellPx: CELL * k,
            ink: INK,
            pad: PAD,
          }),
          PDFJS_TIMEOUT_MS,
          `${docDir} p${String(sheet.keyPage)}: the renders did not load`,
        )
        const lined = await withDeadline(
          pdfTab.tab.evaluate(scorePage, input),
          PDFJS_TIMEOUT_MS,
          `${docDir} p${String(sheet.keyPage)}: the page did not score`,
        )
        const around = await withDeadline(
          pdfTab.tab.evaluate(scoreOutside, input),
          PDFJS_TIMEOUT_MS,
          `${docDir} p${String(sheet.keyPage)}: the page did not score outside its text`,
        )
        const score = { ...lined, ...around }
        await input.dispose()
        const sizes = await pdfTab.tab.evaluate(() => {
          const c = document.querySelector('canvas')
          return c ? [c.width, c.height] : [0, 0]
        })
        const pdfHeight = sizes[1] ?? 0
        if (Math.abs(pdfHeight - score.size.h) > SAME_HEIGHT * SCALE)
          out.push({
            keyPage: sheet.keyPage,
            skipped: 'height',
            detail: `renders differ in height (${String(pdfHeight)} vs ${String(score.size.h)})`,
          })
        else
          out.push({
            keyPage: sheet.keyPage,
            pdfPage: e.pdfPage,
            sheetPx: sheet.sheetPx,
            mutated: sheet.mutated,
            ...score,
          })
      } catch (error) {
        // A page that stalls is skipped and the PDF tab is opened afresh for the next one.
        const detail = error instanceof Error ? error.message : String(error)
        out.push({ keyPage: sheet.keyPage, skipped: 'stall', detail })
        await pdfTab.close()
        pdfTab = null
      }
    }
    return out
  } finally {
    await pdfTab?.close()
    await context.close()
  }
}

const scaleBox = (b: Box, k: number): Box => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k })

// In the sheet's tab: every placed line of each sheet, its printed box in the sheet's CSS pixels (fit.ts' units);
// with `mutate`, up to three lines a sheet get that defect first (eval: what the verdict must catch).
function inventory({ sheetSelector, mutate }: { sheetSelector: string; mutate: Mutation | null }): Sheet[] {
  // Mid-tone inks by relative luminance: Howies' gold 0.34, a #777 grey 0.18; black and white stay out.
  const [MID_LO, MID_HI] = [0.08, 0.6]
  const sheets = [...document.querySelectorAll<HTMLElement>(sheetSelector)]
  const firstPage = sheets[0]?.getAttribute('data-page') ?? ''
  const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')].filter(
    (el) => el.tagName !== 'IMG' && !el.hasAttribute('data-free'),
  )
  return sheets.map((sheet) => {
    const keyPage = Number(sheet.getAttribute('data-page'))
    const rect = sheet.getBoundingClientRect()
    const mine = placed.flatMap((el) => {
      // Words a reader hears but the print draws as icons (sr-only) are in the backdrop, an added sign nowhere.
      const drawn = el.cloneNode(true)
      if (drawn instanceof HTMLElement) for (const s of drawn.querySelectorAll('.sign')) s.remove()
      const shown = [...drawn.childNodes]
        .map((n) =>
          n instanceof HTMLElement ? (n.matches('.sr-only, .icon') ? '' : n.textContent) : (n.textContent ?? ''),
        )
        .join('')
        .trim()
      const container = el.closest<HTMLElement>('section, header')
      const page = container?.getAttribute('data-page') ?? (container?.tagName === 'HEADER' ? firstPage : '')
      return shown && container && page === String(keyPage) ? [{ el, shown, c: container.getBoundingClientRect() }] : []
    })
    const mutated: number[] = []
    if (mutate) {
      // A dark glow misleads round a mid-tone ink (Howies' gold and grey); round black it only reads as bold.
      const midTone = (el: HTMLElement): boolean => {
        const hex = /^#([0-9a-f]{6})$/i.exec(el.style.getPropertyValue('--c').trim())?.[1]
        if (!hex) return false
        const c = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
        const l = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        const lum = 0.2126 * (l[0] ?? 0) + 0.7152 * (l[1] ?? 0) + 0.0722 * (l[2] ?? 0)
        return lum >= MID_LO && lum <= MID_HI
      }
      const eligible = mine.flatMap((m, i) =>
        (mutate === 'price-moved' && !m.el.closest('.price')) || (mutate === 'halo' && !midTone(m.el)) ? [] : [i],
      )
      const picks = [...new Set([1, 2, 3].map((q) => eligible[Math.floor((eligible.length * q) / 4)]))]
      for (const i of picks) {
        const el = i === undefined ? null : mine[i]?.el
        if (!el || i === undefined) continue
        mutated.push(i)
        const colour = el.style.getPropertyValue('--c').trim() || 'currentColor'
        const h = Number(el.style.getPropertyValue('--h'))
        if (mutate === 'doubled') el.style.setProperty('--ts', `0.3em 0.05em 0 ${colour}`)
        else if (mutate === 'halo') el.style.setProperty('--ts', '0 0 0.12em #000, 0 0 0.12em #000')
        else if (mutate === 'faint') el.style.opacity = '0.2'
        else el.style.setProperty('--dy', String(Number(el.style.getPropertyValue('--dy') || 0) + h))
      }
    }
    const lines = mine.map(({ el, shown, c }): LineInput => {
      const u = (name: string): number => (Number(el.style.getPropertyValue(name)) * c.width) / 100
      const ts = el.style.getPropertyValue('--ts').trim()
      const ink = el.style.getPropertyValue('--c').trim()
      return {
        text: shown.slice(0, 40),
        box: { x: c.left - rect.left + u('--x'), y: c.top - rect.top + u('--y'), w: u('--w'), h: u('--h') },
        em: u('--fs') || u('--h'),
        ink: /^#[0-9a-f]{6}$/i.test(ink) ? ink : null,
        wrapped: el.style.getPropertyValue('--ws').trim() === 'normal',
        price: el.closest('.price') !== null,
        // A printed shadow is an offset copy (`calc(...)`); a halo starts at `0 0`.
        shadowed: ts !== '' && ts !== 'none' && !ts.startsWith('0 0'),
        effect: ts !== '' && ts !== 'none',
        fit: { k: Number(el.style.getPropertyValue('--k') || 1), lx: Number(el.style.getPropertyValue('--lx') || 0) },
      }
    })
    return { keyPage, sheetPx: rect.width, lines, mutated }
  })
}

// In the PDF's tab: the PDF's canvas and our three PNGs as pixel arrays, with the page's lines and settings.
async function loadInput({
  name,
  ...args
}: Omit<ScoreInput, 'p' | 's' | 'g' | 'n'> & { name: string }): Promise<ScoreInput> {
  const read = async (src: string | null): Promise<ScoreInput['p']> => {
    const canvas = src === null ? document.querySelector('canvas') : document.createElement('canvas')
    if (!canvas) throw new Error('no canvas')
    if (src !== null) {
      const img = new Image()
      img.src = src
      await img.decode()
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
    }
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height)
    if (!data) throw new Error('no pixels')
    return { width: data.width, height: data.height, data: data.data }
  }
  return {
    ...args,
    p: await read(null),
    s: await read(`/files/sheet.png?${name}`),
    g: await read(`/files/ground.png?${name}`),
    n: await read(`/files/plain.png?${name}`),
  }
}
