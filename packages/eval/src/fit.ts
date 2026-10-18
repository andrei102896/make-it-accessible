import { readFile, writeFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import { printWidthIn } from '@make-it-accessible/pipeline/html/print'
import { covers, ownFaceIn, withoutOwnFace } from '@make-it-accessible/pipeline/html/printface'

// Narrowest fit tried; past it the face is set smaller too (a condensed print: La Segunda's "12.99", 23 pt wide at
// 16 pt), down to MIN_SIZE; a text that still needs less does not fit, and its page fails.
const MIN_FIT = 0.6
const MIN_SIZE = 0.6
const STEP = 0.05
// A line in the PDF's own face only needs rounding slack: narrower than this it is no longer the printed face.
const MIN_FIT_OWN = 0.97
// Slack on a wrapped text's printed height: the lookalike face's line boxes differ a little.
const TALL = 1.15
// Two placed texts overlap when they share this much of the smaller one, and their printed boxes did not.
const OVERLAP = 0.2
// A printed baseline further than this share of a line from ours is no baseline of that line: it stays where it was.
const MAX_SHIFT = 0.5
// A one-line text in a lookalike narrower than its printed box by more than this share is spread to the box with
// letter spacing, up to MAX_FILL em per letter (Almond's Beton names, 20 % narrow once sized to the printed face).
const NARROW = 0.05
const MAX_FILL = 0.25

// Measures each placed text of a printed view in a browser and writes its fit (--k) into the page: the share of
// its natural width that brings it within its printed box (every scale keeps it, all in cqw). Returns the pages
// where placed text still overflows or collides (Carmine's 4.49 beside the wrong dish): they must show the text
// view, since text in the wrong place misinforms.
export type Misfit = { page: number; why: string }
export async function fitPlaced(htmlPath: string): Promise<Misfit[]> {
  const html = await readFile(htmlPath, 'utf8')
  const width = printWidthIn(html)
  if (!width) return []
  const browser = await chromium.launch()
  try {
    const tab = await browser.newPage({ viewport: { width, height: 900 } })
    await tab.goto(`file://${encodeURI(htmlPath)}`)
    const drops = await ownFacesKept(tab)
    for (const d of drops) console.info(`${htmlPath}: ${d.why}`)
    const { fits, shifts, failing } = await tab.evaluate(
      ({ min, minOwn, smallest, step, tall, overlap, maxShift, narrow, maxFill }) => {
        const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')]
        const firstPage = document.querySelector('section[data-page]')?.getAttribute('data-page') ?? ''
        const pageOf = (el: Element): string =>
          el.closest('section[data-page]')?.getAttribute('data-page') ?? (el.closest('header') ? firstPage : '')
        const bad = new Map<string, string>()
        const say = (el: Element): string => JSON.stringify(el.textContent.trim().slice(0, 40))
        const fits = placed.map((el) => {
          const page = el.closest('section, header')
          if (el.tagName === 'IMG' || !page) return { k: 1, z: 1, lx: 0 }
          const style = getComputedStyle(el)
          const own = el.style.getPropertyValue('--ff').trim().startsWith("'pdf-")
          const floor = own ? minOwn : min
          const printed = (Number(el.style.getPropertyValue('--h')) * page.clientWidth) / 100
          const nowrap = style.whiteSpace === 'nowrap'
          const fits = (slack = 1): boolean =>
            nowrap ? el.scrollWidth <= el.clientWidth * slack + 1 : el.offsetHeight <= printed * tall * slack + 1
          const round = (v: number): number => Math.round(v * 100) / 100
          // A lookalike narrower than the printed box takes letter spacing up to the box (cqw per letter).
          const hidden = [...el.querySelectorAll('.sr-only, .icon')].reduce((n, h) => n + h.textContent.length, 0)
          const letters = el.textContent.replace(/\s/g, '').length - hidden
          if (nowrap && !own && letters > 1 && el.scrollWidth < el.clientWidth * (1 - narrow)) {
            const em = parseFloat(style.fontSize)
            const gap = Math.min(maxFill * em, (el.clientWidth - el.scrollWidth) / letters)
            return { k: 1, z: 1, lx: round((gap / page.clientWidth) * 100 * 100) / 100 }
          }
          for (let k = 1; k >= floor; k = Math.max(floor, k - step)) {
            el.style.setProperty('--k', String(round(k)))
            if (fits()) return { k: round(k), z: 1, lx: 0 }
            if (k === floor) break
          }
          for (let z = 1 - step; z >= smallest; z -= step) {
            el.style.setProperty('--z', String(round(z)))
            if (fits()) return { k: round(floor), z: round(z), lx: 0 }
          }
          // At the smallest fit, a text a little wider than its box still reads in place; past `tall`, it collides.
          if (!fits(tall) && !bad.has(pageOf(el)))
            bad.set(
              pageOf(el),
              `${say(el)} overflows its printed box (${nowrap ? `${String(el.scrollWidth)} of ${String(el.clientWidth)} px wide` : `${String(el.offsetHeight)} of ${String(Math.round(printed))} px high`})`,
            )
          return { k: round(floor), z: round(smallest), lx: 0 }
        })
        // Each text's drawn box against its printed box, both relative to its page's container; measured before its
        // baseline shift, which sets it where the print does.
        const boxes = placed.flatMap((el) => {
          const page = el.closest('section, header')
          if (el.tagName === 'IMG' || !page) return []
          const c = page.getBoundingClientRect()
          const r = el.getBoundingClientRect()
          const u = (name: string): number => (Number(el.style.getPropertyValue(name)) * c.width) / 100
          return [
            {
              el,
              page: pageOf(el),
              drawn: { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height },
              printed: { x: u('--x'), y: u('--y'), w: u('--w'), h: u('--h') },
            },
          ]
        })
        // Our first baseline set on the printed one (--bl): the face's ascent and the line box no longer decide
        // where a line sits (Moosewood's script "entrees", its tall box, sat on the dish below).
        const shifts = placed.map((el) => {
          const page = el.closest('section, header')
          const bl = el.style.getPropertyValue('--bl')
          if (el.tagName === 'IMG' || !page || !bl) return 0
          const probe = document.createElement('span')
          probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
          el.prepend(probe)
          const c = page.getBoundingClientRect()
          const dy = ((Number(bl) * c.width) / 100 - (probe.getBoundingClientRect().top - c.top)) / (c.width / 100)
          probe.remove()
          const line = Number(el.style.getPropertyValue('--lh') || el.style.getPropertyValue('--h'))
          if (Math.abs(dy) > line * maxShift) return 0
          const shift = Math.round(dy * 1000) / 1000
          el.style.setProperty('--dy', String(shift))
          return shift
        })
        type Box = { x: number; y: number; w: number; h: number }
        const shared = (a: Box, b: Box): number => {
          const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          return w > 0 && h > 0 ? (w * h) / Math.max(1, Math.min(a.w * a.h, b.w * b.h)) : 0
        }
        for (const [i, a] of boxes.entries())
          for (const b of boxes.slice(i + 1))
            if (
              a.page === b.page &&
              !bad.has(a.page) &&
              shared(a.drawn, b.drawn) > overlap &&
              shared(a.printed, b.printed) <= overlap
            )
              bad.set(a.page, `${say(a.el)} collides with ${say(b.el)}`)
        return {
          fits,
          shifts,
          failing: [...bad].map(([page, why]) => ({ page: Number(page), why })).filter((m) => m.page > 0),
        }
      },
      {
        min: MIN_FIT,
        minOwn: MIN_FIT_OWN,
        smallest: MIN_SIZE,
        step: STEP,
        tall: TALL,
        overlap: OVERLAP,
        maxShift: MAX_SHIFT,
        narrow: NARROW,
        maxFill: MAX_FILL,
      },
    )
    const parts = html.split('style="--x:')
    await writeFile(
      htmlPath,
      parts.reduce((out, part, i) => {
        const { k, z, lx } = fits[i - 1] ?? { k: 1, z: 1, lx: 0 }
        // The element's own style comes first in its part.
        const kept = drops.some((d) => d.index === i - 1) ? withoutOwnFace(part) : part
        const dy = shifts[i - 1] ?? 0
        return `${out}style="${k < 1 ? `--k:${String(k)};` : ''}${z < 1 ? `--z:${String(z)};` : ''}${lx ? `--lx:${String(lx)};` : ''}${dy ? `--dy:${String(dy)};` : ''}--x:${kept}`
      }),
    )
    return failing
  } finally {
    await browser.close()
  }
}

// A line in the PDF's own face keeps it only where the face loaded and draws every letter the line shows (model-filled
// letters and codes included; text read only by screen readers aside); else the whole line takes its stand-in, never
// a face change mid-word. Then every face the page now uses must load: one that fails would measure a fallback.
async function ownFacesKept(tab: Page): Promise<{ index: number; why: string }[]> {
  const seen = await tab.evaluate(async () => {
    await document.fonts.ready
    const faces = [...document.fonts].map((f) => ({
      family: f.family.replace(/^"|"$/g, ''),
      range: f.unicodeRange,
      ok: f.status !== 'error',
    }))
    const lines = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')].map((el) => {
      const shown = el.cloneNode(true)
      if (shown instanceof HTMLElement)
        for (const hidden of shown.querySelectorAll('.sr-only, [data-free], .icon')) hidden.remove()
      const text = shown.textContent ?? ''
      return {
        ff: el.style.getPropertyValue('--ff'),
        text: getComputedStyle(el).textTransform === 'uppercase' ? text.toUpperCase() : text,
      }
    })
    return { faces, lines }
  })
  const faces = new Map(seen.faces.map((f) => [f.family, f]))
  const drops = seen.lines.flatMap(({ ff, text }, index) => {
    const own = ownFaceIn(ff)
    const face = own ? faces.get(own) : undefined
    if (!own) return []
    if (!face?.ok) return [{ index, why: `${own} did not load; ${JSON.stringify(text.slice(0, 30))} in its stand-in` }]
    return covers(face.range, text)
      ? []
      : [{ index, why: `${own} lacks a letter of ${JSON.stringify(text.slice(0, 30))}` }]
  })
  const broken = await tab.evaluate(
    async (indexes) => {
      const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')]
      for (const i of indexes) {
        const el = placed[i]
        const rest =
          el?.style
            .getPropertyValue('--ff')
            .trim()
            .replace(/^'pdf-[0-9a-f]+',?\s*/, '') ?? ''
        if (rest) el?.style.setProperty('--ff', rest)
        else el?.style.removeProperty('--ff')
      }
      await document.fonts.ready
      return [...document.fonts].filter((f) => f.status === 'error' && !f.family.includes('pdf-')).map((f) => f.family)
    },
    drops.map((d) => d.index),
  )
  if (broken.length) throw new Error(`${tab.url()}: fonts did not load: ${broken.join(', ')}`)
  return drops
}
