import { pathToFileURL } from 'node:url'
import { chromium, type Page } from 'playwright'

// What a keyboard user meets: every link, button and scroll region reachable with Tab, each with a visible focus
// ring, none hidden under the sticky section bar (WCAG 2.1.1, 2.4.7, 2.4.11: not entirely hidden).
export type KeyboardSummary = { stops: number; unreachable: string[]; noRing: string[]; obscured: string[] }

const FOCUSABLE = 'a[href], button, summary, input, select, textarea, [tabindex]:not([tabindex="-1"])'

export async function keyboardCheck(tab: Page): Promise<KeyboardSummary> {
  // Expected stops: focusable, rendered, and not inside a closed <details> (other than its own summary).
  const expected = await tab.$$eval(FOCUSABLE, (els) =>
    els
      .filter((el) => {
        const closed = el.closest('details:not([open])')
        return el.getClientRects().length > 0 && (!closed || el.matches('summary'))
      })
      .map((el, i) => {
        el.setAttribute('data-kb', String(i))
        return String(i)
      }),
  )
  const reached = new Set<string>()
  const noRing: string[] = []
  const obscured: string[] = []
  for (let i = 0; i < expected.length + 2; i++) {
    await tab.keyboard.press('Tab')
    const seen = await tab.evaluate(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLElement) || !el.dataset.kb) return null
      const style = getComputedStyle(el)
      const ring = (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none'
      // Probed inside the viewport: a chip half out of its own scroller is still visible (WCAG 2.4.11, not 2.4.12).
      const r = el.getBoundingClientRect()
      const x = (Math.max(r.left, 0) + Math.min(r.right, window.innerWidth)) / 2
      const top = document.elementFromPoint(x, Math.max(r.top, 0) + Math.min(r.height / 2, 8))
      const visible = top !== null && (el.contains(top) || top.contains(el))
      return {
        id: el.dataset.kb,
        label: (el.innerText || el.getAttribute('aria-label') || el.tagName).slice(0, 40),
        ring,
        visible,
      }
    })
    if (!seen) continue
    reached.add(seen.id)
    if (!seen.ring) noRing.push(seen.label)
    if (!seen.visible) obscured.push(seen.label)
  }
  const unreachable = expected.filter((id) => !reached.has(id))
  return { stops: reached.size, unreachable, noRing: [...new Set(noRing)], obscured: [...new Set(obscured)] }
}

export async function keyboardReport(htmlPath: string): Promise<KeyboardSummary> {
  const browser = await chromium.launch()
  try {
    const tab = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    await tab.goto(pathToFileURL(htmlPath).href)
    return await keyboardCheck(tab)
  } finally {
    await browser.close()
  }
}
