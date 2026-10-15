import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// A face's x-height as a share of its size, measured on the font itself in a browser (the woff2 tables are
// compressed; the browser reads them).
export async function xHeightOf(woff2: string): Promise<number> {
  const data = (await readFile(woff2)).toString('base64')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(`<style>@font-face { font-family: M; src: url(data:font/woff2;base64,${data}); }</style>`)
    return await page.evaluate(async () => {
      await document.fonts.load('100px M')
      const ctx = document.createElement('canvas').getContext('2d')
      if (!ctx) throw new Error('no canvas')
      ctx.font = '100px M'
      return ctx.measureText('x').actualBoundingBoxAscent / 100
    })
  } finally {
    await browser.close()
  }
}
