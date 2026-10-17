import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { AxeBuilder } from '@axe-core/playwright'
import { chromium } from 'playwright'
import { printWidthIn } from '@make-it-accessible/pipeline/html/print'

// pnpm check:page <page.html> [--shots <dir> --tag <name>]: axe (critical and serious) at 1280, 390 and 320 px, in
// forced colours and in the printed view, a horizontal-overflow check, WCAG 1.4.12 text spacing at 320 px, the
// printed view's words against the text view's, and screenshots when asked. One line per page, as a table.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { shots: { type: 'string' }, tag: { type: 'string' } },
})
const [file] = positionals
if (!file) throw new Error('usage: pnpm check:page <page.html> [--shots <dir> --tag <name>]')
const tag = values.tag ?? 'page'
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
    out.push(
      `${mode.name}: axe ${bad.join(' ') || 'ok'}${overflow ? ' OVERFLOW' : ''}${spacing ? ` | 1.4.12 ${spacing}` : ''}`,
    )
    await ctx.close()
  }
  // The printed view, where the page has one: axe on it, and the same words as the text view (one document).
  const printed = printWidthIn(await readFile(file, 'utf8'))
  if (printed) {
    const ctx = await browser.newContext({ viewport: { width: Math.max(printed, MODES[0].width), height: 900 } })
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
    await page.check('#view-text')
    const same = shown === (await words())
    out.push(`printed: axe ${bad.join(' ') || 'ok'} | text ${same ? 'same' : 'DIFFERS from the text view'}`)
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.info(`${tag}: ${out.join(' ; ')}`)
