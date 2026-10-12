import { pathToFileURL } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { chromium, type Page } from 'playwright'

export type AxeSummary = { critical: number; serious: number; rules: string[] }

export async function axeSummary(tab: Page): Promise<AxeSummary> {
  const result = await new AxeBuilder({ page: tab }).analyze()
  const severe = result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  const nodes = (impact: string): number =>
    severe.filter((v) => v.impact === impact).reduce((n, v) => n + v.nodes.length, 0)
  return { critical: nodes('critical'), serious: nodes('serious'), rules: severe.map((v) => v.id) }
}

export async function axeReport(htmlPath: string): Promise<AxeSummary> {
  const browser = await chromium.launch()
  try {
    const tab = await (await browser.newContext()).newPage()
    await tab.goto(pathToFileURL(htmlPath).href)
    return await axeSummary(tab)
  } finally {
    await browser.close()
  }
}
