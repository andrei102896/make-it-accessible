import type { Page } from 'playwright'
import type { DomPage } from './types.ts'

export type DomSection = DomPage & { label: string }

export async function readSections(tab: Page): Promise<DomSection[]> {
  return tab.evaluate((): DomSection[] => {
    // A doubt about grouping marks the whole product, product list or table; other findings mark one element.
    const GROUPING = '.products > li[data-review], ul.products[data-review], div.table[data-review]'
    return [...document.querySelectorAll<HTMLElement>('section[data-page]')].map((section) => {
      const leaves = [...section.querySelectorAll<HTMLElement>('p, h3, h4, h5, h6, li, td, th, caption')]
        .filter((el) => !el.querySelector('p, ul, ol, table, li'))
        .map((el) => ({ text: el.innerText, review: el.closest('[data-review]') !== null }))
      const containers = [...section.querySelectorAll<HTMLElement>('li, tr')].map((el) => {
        const product = el.closest<HTMLElement>('.products > li') ?? el
        return {
          text: el.innerText,
          alts: [...product.querySelectorAll('img')].map((img) => img.getAttribute('alt') ?? ''),
          // A product's own prices: a nested product (an add-on) owns its prices, a table inside the product does not.
          prices: [...el.querySelectorAll<HTMLElement>('.price')]
            .filter((p) => (el.matches('.products > li') ? p.closest('.products > li') : p.closest('li, tr')) === el)
            .map((p) => {
              const qualifier = p.querySelector<HTMLElement>('.qualifier')?.innerText ?? ''
              return {
                role: p.dataset.role ?? '',
                text: p.innerText.slice(qualifier.length).trim(),
                qualifier: qualifier.trim(),
                review: p.matches('[data-review]'),
              }
            }),
          review:
            el.querySelector('.price[data-review]') !== null ||
            el.matches('tr[data-review]') ||
            el.closest(GROUPING) !== null,
          altReview: product.querySelector('img[data-review]') !== null,
          grouping: el.matches('tr[data-review]') || el.closest(GROUPING) !== null,
          row: el.tagName === 'TR',
          anyPrice: el.querySelector('.price') !== null,
        }
      })
      const headings = [...section.querySelectorAll<HTMLElement>('h3, h4, h5, h6')].map((h) => ({
        level: Number(h.tagName[1]),
        text: h.innerText,
      }))
      // Merged cells are repeated on every row and column they span, as a screen reader announces them.
      const rows = [...section.querySelectorAll('table')].flatMap((table, tableIndex) => {
        const grid: ({ text: string; prices: string[] } | undefined)[][] = []
        ;[...table.rows].forEach((tr, ri) => {
          let ci = 0
          for (const cell of tr.cells) {
            while (grid[ri]?.[ci]) ci++
            const data = {
              text: cell.innerText,
              prices: [...cell.querySelectorAll<HTMLElement>('.price')].map((p) =>
                p.innerText.slice(p.querySelector<HTMLElement>('.qualifier')?.innerText.length ?? 0).trim(),
              ),
            }
            for (let r = 0; r < Math.max(1, cell.rowSpan); r++)
              for (let c = 0; c < cell.colSpan; c++) (grid[ri + r] ??= [])[ci + c] = data
            ci += cell.colSpan
          }
        })
        return [...table.rows].map((tr, ri) => ({
          table: tableIndex,
          text: tr.innerText,
          header: tr.querySelector('td') === null,
          review: tr.matches('[data-review]') || tr.closest(GROUPING) !== null,
          cells: Array.from(grid[ri] ?? [], (c) => c ?? { text: '', prices: [] }),
        }))
      })
      return {
        page: Number(section.dataset.page),
        label: section.querySelector('h2')?.innerText ?? '',
        leaves,
        containers,
        headings,
        rows,
        text: section.innerText,
        alts: [...section.querySelectorAll('img')].map((img) => img.getAttribute('alt') ?? ''),
        unsupported: section.hasAttribute('data-unsupported'),
      }
    })
  })
}

// Table ids stay distinct across the sections of one key page.
const TABLES_PER_SECTION = 1000

// A spread or panel layout publishes one key page as several sections; they are scored together, in DOM order.
export function pageDom(sections: readonly DomSection[], keyPage: number): DomPage {
  const own = sections.filter((s) => s.page === keyPage)
  return {
    page: keyPage,
    leaves: own.flatMap((s) => s.leaves),
    containers: own.flatMap((s) => s.containers),
    headings: own.flatMap((s) => s.headings),
    rows: own.flatMap((s, i) => s.rows.map((r) => ({ ...r, table: i * TABLES_PER_SECTION + r.table }))),
    text: own.map((s) => s.text).join('\n'),
    alts: own.flatMap((s) => s.alts),
    unsupported: own.length > 0 && own.every((s) => s.unsupported),
  }
}
