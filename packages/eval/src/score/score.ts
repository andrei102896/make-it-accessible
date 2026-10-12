import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import type { KeyDoc } from '../keys.ts'
import { axeSummary } from './axe.ts'
import {
  altText,
  productPrices,
  readingOrder,
  structureScore,
  textFidelity,
  type DocScore,
  type DomPage,
  type PageScore,
} from './metrics.ts'

export async function scoreDocument(htmlPath: string, key: KeyDoc, keyPages: readonly number[]): Promise<DocScore> {
  const browser = await chromium.launch()
  try {
    const tab = await (await browser.newContext()).newPage()
    await tab.goto(pathToFileURL(htmlPath).href)
    const doms = await tab.evaluate((): DomPage[] =>
      [...document.querySelectorAll<HTMLElement>('section[data-page]')].map((section) => {
        const leaves = [...section.querySelectorAll<HTMLElement>('p, h3, h4, h5, h6, li, td, th, caption')]
          .filter((el) => !el.querySelector('p, ul, ol, table, li'))
          .map((el) => ({ text: el.innerText }))
        const containers = [...section.querySelectorAll<HTMLElement>('li, tr')].map((el) => {
          const product = el.closest<HTMLElement>('.products > li') ?? el
          return {
            text: el.innerText,
            alts: [...product.querySelectorAll('img')].map((img) => img.getAttribute('alt') ?? ''),
            prices: [...el.querySelectorAll<HTMLElement>('.price')].map((p) => ({
              role: p.dataset.role ?? '',
              amount: p.dataset.amount === undefined ? null : Number(p.dataset.amount),
            })),
            review: el.closest('[data-review]') !== null,
          }
        })
        const headings = [...section.querySelectorAll<HTMLElement>('h3, h4, h5, h6')].map((h) => ({
          level: Number(h.tagName[1]),
          text: h.innerText,
        }))
        // Merged cells are repeated on every row and column they span, as a screen reader announces them.
        const rows = [...section.querySelectorAll('table')].flatMap((table) => {
          const grid: ({ text: string; amounts: number[] } | undefined)[][] = []
          ;[...table.rows].forEach((tr, ri) => {
            let ci = 0
            for (const cell of tr.cells) {
              while (grid[ri]?.[ci]) ci++
              const data = {
                text: cell.innerText,
                amounts: [...cell.querySelectorAll<HTMLElement>('.price')].flatMap((p) =>
                  p.dataset.amount === undefined ? [] : [Number(p.dataset.amount)],
                ),
              }
              for (let r = 0; r < Math.max(1, cell.rowSpan); r++)
                for (let c = 0; c < cell.colSpan; c++) (grid[ri + r] ??= [])[ci + c] = data
              ci += cell.colSpan
            }
          })
          return [...table.rows].map((tr, ri) => ({
            text: tr.innerText,
            header: tr.querySelector('td') === null,
            review: tr.closest('[data-review]') !== null,
            cells: Array.from(grid[ri] ?? [], (c) => c ?? { text: '', amounts: [] }),
          }))
        })
        return { page: Number(section.dataset.page), leaves, containers, headings, rows, text: section.innerText }
      }),
    )
    const axe = await axeSummary(tab)
    const pages = key.pages
      .filter((p) => keyPages.includes(p.keyPage))
      .map((p): PageScore => {
        const dom = doms.find((d) => d.page === p.keyPage) ?? {
          page: p.keyPage,
          leaves: [],
          containers: [],
          headings: [],
          rows: [],
          text: '',
        }
        const c1 = readingOrder(p, dom)
        const c2 = productPrices(p, dom)
        const c3 = textFidelity(p, dom)
        const c4 = altText(p, dom)
        const c5 = structureScore(p, dom)
        return {
          keyPage: p.keyPage,
          heldOut: Boolean(p.heldOut),
          c1,
          c2,
          c3,
          c4,
          c5,
          pass: {
            c1: c1.textOnly >= 0.95,
            c2: c2.errorProducts === 0,
            c3: c3.missing.length + c3.altered.length + c3.invented.length <= 1,
            c4: c4.total === 0 || c4.ok / c4.total >= 0.8,
            c5: c5.rowsOk === c5.rows,
          },
        }
      })
    return { pages, axe }
  } finally {
    await browser.close()
  }
}
