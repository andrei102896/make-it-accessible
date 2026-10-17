import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { printWidthIn } from '@make-it-accessible/pipeline/html/print'

// Narrowest fit tried; past it the face is set smaller too (a condensed print: La Segunda's "12.99", 23 pt wide at
// 16 pt), down to MIN_SIZE; a text that still needs less does not fit, and its page fails.
const MIN_FIT = 0.6
const MIN_SIZE = 0.6
const STEP = 0.05
// Slack on a wrapped text's printed height: the lookalike face's line boxes differ a little.
const TALL = 1.15
// Two placed texts overlap when they share this much of the smaller one, and their printed boxes did not.
const OVERLAP = 0.2

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
    await tab.evaluate(() => document.fonts.ready)
    const { fits, failing } = await tab.evaluate(
      ({ min, smallest, step, tall, overlap }) => {
        const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')]
        const firstPage = document.querySelector('section[data-page]')?.getAttribute('data-page') ?? ''
        const pageOf = (el: Element): string =>
          el.closest('section[data-page]')?.getAttribute('data-page') ?? (el.closest('header') ? firstPage : '')
        const bad = new Map<string, string>()
        const say = (el: Element): string => JSON.stringify(el.textContent.trim().slice(0, 40))
        const fits = placed.map((el) => {
          const page = el.closest('section, header')
          if (el.tagName === 'IMG' || !page) return { k: 1, z: 1 }
          const printed = (Number(el.style.getPropertyValue('--h')) * page.clientWidth) / 100
          const nowrap = getComputedStyle(el).whiteSpace === 'nowrap'
          const fits = (slack = 1): boolean =>
            nowrap ? el.scrollWidth <= el.clientWidth * slack + 1 : el.offsetHeight <= printed * tall * slack + 1
          const round = (v: number): number => Math.round(v * 100) / 100
          for (let k = 1; k >= min; k -= step) {
            el.style.setProperty('--k', String(round(k)))
            if (fits()) return { k: round(k), z: 1 }
          }
          for (let z = 1 - step; z >= smallest; z -= step) {
            el.style.setProperty('--z', String(round(z)))
            if (fits()) return { k: round(min), z: round(z) }
          }
          // At the smallest fit, a text a little wider than its box still reads in place; past `tall`, it collides.
          if (!fits(tall) && !bad.has(pageOf(el)))
            bad.set(
              pageOf(el),
              `${say(el)} overflows its printed box (${nowrap ? `${String(el.scrollWidth)} of ${String(el.clientWidth)} px wide` : `${String(el.offsetHeight)} of ${String(Math.round(printed))} px high`})`,
            )
          return { k: round(min), z: round(smallest) }
        })
        // Each text's drawn box against its printed box, both relative to its page's container.
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
        return { fits, failing: [...bad].map(([page, why]) => ({ page: Number(page), why })).filter((m) => m.page > 0) }
      },
      { min: MIN_FIT, smallest: MIN_SIZE, step: STEP, tall: TALL, overlap: OVERLAP },
    )
    const parts = html.split('style="--x:')
    await writeFile(
      htmlPath,
      parts.reduce((out, part, i) => {
        const { k, z } = fits[i - 1] ?? { k: 1, z: 1 }
        return `${out}style="${k < 1 ? `--k:${String(k)};` : ''}${z < 1 ? `--z:${String(z)};` : ''}--x:${part}`
      }),
    )
    return failing
  } finally {
    await browser.close()
  }
}
