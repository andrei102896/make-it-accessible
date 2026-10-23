import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { AxeBuilder } from '@axe-core/playwright'
import { chromium } from 'playwright'
import { printFloorIn } from '@make-it-accessible/pipeline/html/print'

// pnpm check:page <page.html> [--shots <dir> --tag <name>]: axe, overflow, 1.4.12, the printed view's words and boxes,
// the text view's restyled spans, screenshots when asked (WORKFLOW lists them). One line per page, as a table.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { shots: { type: 'string' }, tag: { type: 'string' } },
})
const [file] = positionals
if (!file) throw new Error('usage: pnpm check:page <page.html> [--shots <dir> --tag <name>]')
const tag = values.tag ?? 'page'
// The page's face is not the printed one (Howies' Montserrat 1.3× Brandon): words a quarter of the box past it are
// cut. Two boxes share a spot past this share of the smaller.
const CUT_WIDTH = 0.25
const OVERLAP = 0.2
const MODES = [
  { name: 'desktop', width: 1280, forced: false },
  { name: 'phone', width: 390, forced: false },
  { name: 'narrow', width: 320, forced: false },
  { name: 'forced', width: 1280, forced: true },
] as const
const SPACING =
  '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }'

const browser = await chromium.launch()
const out: string[] = []
try {
  for (const mode of MODES) {
    const ctx = await browser.newContext({
      viewport: { width: mode.width, height: 900 },
      forcedColors: mode.forced ? 'active' : 'none',
    })
    const page = await ctx.newPage()
    await page.goto(pathToFileURL(file).href)
    if (values.shots && mode.name !== 'narrow') {
      await mkdir(values.shots, { recursive: true })
      await page.screenshot({ path: join(values.shots, `${tag}-${mode.name}.png`), fullPage: !mode.forced })
    }
    // axe's contrast check reads author colours that forced colours replace: judged on the screenshot instead.
    const r = await new AxeBuilder({ page }).disableRules(mode.forced ? ['color-contrast'] : []).analyze()
    const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    let spacing = ''
    if (mode.name === 'narrow') {
      await page.addStyleTag({ content: SPACING })
      spacing = await page.evaluate(() => {
        const clipped = [...document.querySelectorAll('main *')].filter(
          (el) =>
            !el.closest('.sr-only') &&
            el.scrollWidth > el.clientWidth + 1 &&
            getComputedStyle(el).overflowX === 'hidden',
        )
        if (document.documentElement.scrollWidth > window.innerWidth) return 'page overflow'
        return clipped.length ? `${String(clipped.length)} clipped` : 'ok'
      })
    }
    // Spans whose face differs from their element's in Text only: what a line printed in more than one style changed.
    const restyled =
      mode.name === 'desktop'
        ? await page.evaluate(() => {
            const text = document.querySelector<HTMLInputElement>('#view-text')
            if (text) text.click()
            return [...document.querySelectorAll('main .fi, main .fn')].filter((s) => {
              // Text only shows `[data-free]` words (the printed view hides them), never `.sr-only` copies.
              if (s.closest('.sr-only')) return false
              const [a, b] = [getComputedStyle(s), s.parentElement && getComputedStyle(s.parentElement)]
              return !b || a.fontWeight !== b.fontWeight || a.fontStyle !== b.fontStyle
            }).length
          })
        : null
    out.push(
      `${mode.name}: axe ${bad.join(' ') || 'ok'}${overflow ? ' OVERFLOW' : ''}${spacing ? ` | 1.4.12 ${spacing}` : ''}${restyled === null ? '' : ` | spans restyled ${String(restyled)}`}`,
    )
    await ctx.close()
  }
  // The printed view, where the page has one, at its narrowest (smallest text, strictest contrast): axe on it, and
  // the same words as the text view (one document).
  const printed = printFloorIn(await readFile(file, 'utf8'))
  if (printed) {
    const ctx = await browser.newContext({ viewport: { width: printed, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(pathToFileURL(file).href)
    const r = await new AxeBuilder({ page }).analyze()
    const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)
    const words = (): Promise<string> =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('section[data-page], header.masthead')]
          .map((s) => s.innerText)
          .join('')
          .replace(/\s+/g, ''),
      )
    const shown = await words()
    // The layer's boxes (print.ts): a text past its box is cut (find and the cursor lose its end), two boxes over one
    // spot mislead the pointer. Counted per document, never a gate (Text only reads every word).
    const layer = await page.evaluate(
      ({ cutWidth, overlap }) => {
        const leaves = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')].filter(
          (el) => el.tagName !== 'IMG' && getComputedStyle(el).position === 'absolute',
        )
        const boxes = leaves.map((el) => el.getBoundingClientRect())
        // What a leaf lays out: its text nodes but those read only (1 px icon labels, signs, legends), and each icon's
        // own drawn box. Client rects ignore the clip, so they show how far the words run.
        const extent = (el: HTMLElement): DOMRect[] => {
          const rects: DOMRect[] = [...el.querySelectorAll<HTMLElement>('.icon')].map((i) => i.getBoundingClientRect())
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (!n.textContent?.trim() || n.parentElement?.closest('.sr-only, [data-free], .icon, .sign')) continue
            const range = document.createRange()
            range.selectNodeContents(n)
            rects.push(...range.getClientRects())
          }
          return rects.filter((r) => r.width > 0)
        }
        let cut = 0
        let prices = 0
        leaves.forEach((el, i) => {
          const b = boxes[i]
          const rects = extent(el)
          if (!b || !rects.length) return
          const [left, right] = [Math.min(...rects.map((r) => r.left)), Math.max(...rects.map((r) => r.right))]
          const bottom = Math.max(...rects.map((r) => r.bottom))
          const wide = Math.max(0, b.left - left) + Math.max(0, right - b.right) > b.width * cutWidth
          // A line more than printed: its words fall half a line or more below the box.
          const deep = bottom - b.bottom > parseFloat(getComputedStyle(el).lineHeight) / 2
          if (!wide && !deep) return
          cut++
          if (el.closest('.price')) prices++
        })
        let overlapping = 0
        boxes.forEach((a, i) => {
          for (const b of boxes.slice(i + 1)) {
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            if (w > 0 && h > 0 && w * h > overlap * Math.min(a.width * a.height, b.width * b.height)) overlapping++
          }
        })
        return { cut, prices, overlapping }
      },
      { cutWidth: CUT_WIDTH, overlap: OVERLAP },
    )
    // As a reader does: the segment's label (the radio itself is hidden under its icon, print.ts).
    await page.locator('label:has(#view-text)').click()
    if (!(await page.isChecked('#view-text'))) throw new Error(`${tag}: the Text only segment did not switch the view`)
    const same = shown === (await words())
    out.push(
      `printed: axe ${bad.join(' ') || 'ok'} | text ${same ? 'same' : 'DIFFERS from the text view'} | boxes cut ${String(layer.cut)} (prices ${String(layer.prices)}), overlapping ${String(layer.overlapping)}`,
    )
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.info(`${tag}: ${out.join(' ; ')}`)
