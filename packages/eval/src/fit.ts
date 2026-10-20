import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { printWidthIn } from '@make-it-accessible/pipeline/html/print'
import { withoutOwnFace } from '@make-it-accessible/pipeline/html/printface'
import { rowStarts, type RowText } from '@make-it-accessible/pipeline/html/rows'
import { withDeadline } from './deadline.ts'
import { ownFacesKept } from './ownfaces.ts'

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
// One document's fit, every text and step: Kenny & Ziggy's 8 pages and 1,490 texts take 42 s. Past it the tab is
// stuck: the build fails by name, never waits on (it waited 3 hours, 2026-10-20).
const FIT_TIMEOUT_MS = 300_000

// Measures each placed text of a printed view in a browser and writes its fit (--k) into the page: the share of
// its natural width that brings it within its printed box (every scale keeps it, all in cqw). Returns the pages
// where placed text still overflows or collides (Carmine's 4.49 beside the wrong dish): they must show the text
// view, since text in the wrong place misinforms.
export type Misfit = { page: number; why: string }
// An image or a text outside any page: nothing to set on a row.
const NOTHING: RowText = {
  page: -1,
  printed: { x: 0, y: 0, w: 0, h: 0 },
  drawn: { x: 0, w: 0 },
  em: 0,
  nowrap: false,
  icon: null,
  price: false,
}
export async function fitPlaced(htmlPath: string): Promise<Misfit[]> {
  const html = await readFile(htmlPath, 'utf8')
  const width = printWidthIn(html)
  if (!width) return []
  const browser = await chromium.launch()
  try {
    const tab = await browser.newPage({ viewport: { width, height: 900 } })
    await tab.goto(`file://${encodeURI(htmlPath)}`)
    const started = Date.now()
    const drops = await ownFacesKept(tab)
    for (const d of drops) console.info(`${htmlPath}: ${d.why}`)
    const { fits, rows, bad } = await withDeadline(
      tab.evaluate(
        ({ min, minOwn, smallest, step, tall, narrow, maxFill }) => {
          const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')]
          const firstPage = document.querySelector('section[data-page]')?.getAttribute('data-page') ?? ''
          const pageOf = (el: Element): string =>
            el.closest('section[data-page]')?.getAttribute('data-page') ?? (el.closest('header') ? firstPage : '')
          const bad = new Map<string, string>()
          const say = (el: Element): string => JSON.stringify(el.textContent.trim().slice(0, 40))
          const round = (v: number): number => Math.round(v * 100) / 100
          // Every text is read first, then each step is tried on all texts still too wide at once: one layout a step,
          // not one a text a step (Kenny & Ziggy's 1,490 texts at 63 ms a layout took most of an hour).
          const items = placed.map((el) => {
            const page = el.closest('section, header')
            if (el.tagName === 'IMG' || !page) return null
            const style = getComputedStyle(el)
            const own = el.style.getPropertyValue('--ff').trim().startsWith("'pdf-")
            // A lookalike narrower than the printed box takes letter spacing up to the box (cqw per letter). The
            // content's own width: a block's scrollWidth never reads below its box (Scotts' STARTERS, never spread).
            const hidden = [...el.querySelectorAll('.sr-only, .icon')].reduce((n, h) => n + h.textContent.length, 0)
            const range = document.createRange()
            range.selectNodeContents(el)
            return {
              el,
              own,
              floor: own ? minOwn : min,
              printed: (Number(el.style.getPropertyValue('--h')) * page.clientWidth) / 100,
              nowrap: style.whiteSpace === 'nowrap',
              letters: el.textContent.replace(/\s/g, '').length - hidden,
              content: range.getBoundingClientRect().width,
              client: el.clientWidth,
              em: parseFloat(style.fontSize),
              pageWidth: page.clientWidth,
            }
          })
          type Item = NonNullable<(typeof items)[number]>
          const fitsIn = (it: Item, slack = 1): boolean =>
            it.nowrap
              ? it.el.scrollWidth <= it.el.clientWidth * slack + 1
              : it.el.offsetHeight <= it.printed * tall * slack + 1
          const fits: { k: number; z: number; lx: number }[] = items.map(() => ({ k: 1, z: 1, lx: 0 }))
          let pending: number[] = []
          items.forEach((it, i) => {
            if (!it) return
            if (it.nowrap && !it.own && it.letters > 1 && it.content < it.client * (1 - narrow)) {
              const gap = Math.min(maxFill * it.em, (it.client - it.content) / it.letters)
              const lx = round((gap / it.pageWidth) * 100 * 100) / 100
              fits[i] = { k: 1, z: 1, lx }
              it.el.style.setProperty('--lx', String(lx))
            } else pending.push(i)
          })
          const at = (i: number): Item => {
            const it = items[i]
            if (!it) throw new Error(`no text ${String(i)}`)
            return it
          }
          // Narrower first, down to the floor of each text's face; then smaller, down to the smallest size.
          let shrink: number[] = []
          for (let r = 0; pending.length; r++) {
            const k = (i: number): number => Math.max(at(i).floor, 1 - r * step)
            for (const i of pending) at(i).el.style.setProperty('--k', String(round(k(i))))
            const next: number[] = []
            for (const i of pending)
              if (fitsIn(at(i))) fits[i] = { k: round(k(i)), z: 1, lx: 0 }
              else (k(i) > at(i).floor ? next : shrink).push(i)
            pending = next
          }
          for (let r = 1; shrink.length && 1 - r * step >= smallest - 1e-9; r++) {
            const z = round(1 - r * step)
            for (const i of shrink) at(i).el.style.setProperty('--z', String(z))
            shrink = shrink.filter((i) => {
              if (!fitsIn(at(i))) return true
              fits[i] = { k: round(at(i).floor), z, lx: 0 }
              return false
            })
          }
          // At the smallest fit, a text a little wider than its box still reads in place; past `tall`, it collides.
          for (const i of shrink) {
            const it = at(i)
            fits[i] = { k: round(it.floor), z: round(smallest), lx: 0 }
            if (!fitsIn(it, tall) && !bad.has(pageOf(it.el)))
              bad.set(
                pageOf(it.el),
                `${say(it.el)} overflows its printed box (${it.nowrap ? `${String(it.el.scrollWidth)} of ${String(it.el.clientWidth)} px wide` : `${String(it.el.offsetHeight)} of ${String(Math.round(it.printed))} px high`})`,
              )
          }
          // Where each text's letters are drawn now, against its printed box (rows.ts sets one-line rows on their edge).
          const containers = [...new Set(placed.map((el) => el.closest('section, header')))]
          const rows = placed.map((el, i) => {
            const page = el.closest('section, header')
            if (el.tagName === 'IMG' || !page) return null
            const c = page.getBoundingClientRect()
            const u = (name: string): number => (Number(el.style.getPropertyValue(name)) * c.width) / 100
            // What is drawn: shown text and icon tags; screen-reader-only words have glyph boxes but no ink.
            const rects = [...el.querySelectorAll('.icon')].map((i) => i.getBoundingClientRect())
            const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
            for (let n = walk.nextNode(); n; n = walk.nextNode()) {
              if (n.parentElement?.closest('.sr-only, .icon, [data-free]')) continue
              const range = document.createRange()
              range.selectNodeContents(n)
              rects.push(...[...range.getClientRects()].filter((r) => r.width > 0))
            }
            const left = Math.min(...rects.map((r) => r.left))
            const icons = [...el.querySelectorAll<HTMLElement>('.icon[style*="--ix:"]')]
            const cqw = (icon: HTMLElement, name: string): number =>
              (Number(icon.style.getPropertyValue(name)) * c.width) / 100
            return {
              page: containers.indexOf(page),
              printed: { x: u('--x'), y: u('--y'), w: u('--w'), h: u('--h') },
              drawn: rects.length
                ? { x: left - c.left, w: Math.max(...rects.map((r) => r.right)) - left }
                : { x: u('--x'), w: 0 },
              em: items[i]?.em ?? 0,
              nowrap: items[i]?.nowrap === true && rects.length > 0,
              icon: (() => {
                const [first, last] = [icons[0], icons.at(-1)]
                if (!first || !last) return null
                return {
                  printed: cqw(first, '--ix'),
                  drawn: first.getBoundingClientRect().left - c.left,
                  end: {
                    printed: cqw(last, '--ix') + cqw(last, '--iw'),
                    drawn: last.getBoundingClientRect().right - c.left,
                  },
                }
              })(),
              price: el.matches('.price, .amount'),
              box: el.getBoundingClientRect().left - c.left,
              pageWidth: c.width,
            }
          })
          return { fits, rows, bad: [...bad] }
        },
        {
          min: MIN_FIT,
          minOwn: MIN_FIT_OWN,
          smallest: MIN_SIZE,
          step: STEP,
          tall: TALL,
          narrow: NARROW,
          maxFill: MAX_FILL,
        },
      ),
      FIT_TIMEOUT_MS,
      `${htmlPath}: the placed text did not fit in ${String(FIT_TIMEOUT_MS / 1000)} s`,
    )
    // Each one-line row on its printed edge (rows.ts): our letters start there, the element's box never moves (the
    // collision check reads boxes). An indent is in the element's own units, which --k scales.
    const starts = rowStarts(rows.map((r): RowText => r ?? NOTHING))
    const indents = rows.map((r, i) => {
      const start = starts[i]
      if (!r || start === null || start === undefined) return null
      const indent = (start - r.box) / (fits[i]?.k ?? 1)
      return Math.round((indent / r.pageWidth) * 100 * 1000) / 1000
    })
    const { shifts, failing } = await withDeadline(
      tab.evaluate(
        ({ indents, known, overlap, maxShift }) => {
          const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')]
          placed.forEach((el, i) => {
            const ti = indents[i]
            if (ti !== null && ti !== undefined) el.style.setProperty('--ti', String(ti))
          })
          const firstPage = document.querySelector('section[data-page]')?.getAttribute('data-page') ?? ''
          const pageOf = (el: Element): string =>
            el.closest('section[data-page]')?.getAttribute('data-page') ?? (el.closest('header') ? firstPage : '')
          const bad = new Map<string, string>(known)
          const say = (el: Element): string => JSON.stringify(el.textContent.trim().slice(0, 40))
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
            shifts,
            failing: [...bad].map(([page, why]) => ({ page: Number(page), why })).filter((m) => m.page > 0),
          }
        },
        { indents, known: bad, overlap: OVERLAP, maxShift: MAX_SHIFT },
      ),
      // One budget for both passes: the second has what the first left.
      Math.max(0, FIT_TIMEOUT_MS - (Date.now() - started)),
      `${htmlPath}: the placed text did not settle in ${String(FIT_TIMEOUT_MS / 1000)} s`,
    )
    const parts = html.split('style="--x:')
    await writeFile(
      htmlPath,
      parts.reduce((out, part, i) => {
        const { k, z, lx } = fits[i - 1] ?? { k: 1, z: 1, lx: 0 }
        // The element's own style comes first in its part.
        const kept = drops.some((d) => d.index === i - 1) ? withoutOwnFace(part) : part
        const dy = shifts[i - 1] ?? 0
        // A row set on its edge is set from its left, even where it starts at its box's left: `--ti:0`.
        const ti = indents[i - 1] ?? null
        return `${out}style="${k < 1 ? `--k:${String(k)};` : ''}${z < 1 ? `--z:${String(z)};` : ''}${lx ? `--lx:${String(lx)};` : ''}${dy ? `--dy:${String(dy)};` : ''}${ti === null ? '' : `--ti:${String(ti)};`}--x:${kept}`
      }),
    )
    return failing
  } finally {
    await browser.close()
  }
}
