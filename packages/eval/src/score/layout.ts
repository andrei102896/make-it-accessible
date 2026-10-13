import { norm } from '@make-it-accessible/pipeline/text/normalize'
import type { KeyDoc, KeySection } from '../keys.ts'
import type { DomSection } from './dom.ts'
import { loose } from './text.ts'

const labelled = (heading: string, label: string): boolean =>
  new RegExp(`(^|\\W)${norm(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(norm(heading))

function checkOrder(
  order: readonly KeySection[],
  sections: readonly DomSection[],
  keyPages: readonly number[],
): Map<number, string[]> {
  const problems = new Map<number, string[]>()
  const expected = order.filter((s) => keyPages.includes(s.keyPage))
  const found = sections.filter((s) => keyPages.includes(s.page))
  const add = (page: number, problem: string): void => {
    problems.set(page, [...(problems.get(page) ?? []), problem])
  }
  keyPages.forEach((p) => problems.set(p, []))
  if (expected.map((s) => s.keyPage).join() !== found.map((s) => s.page).join())
    expected.forEach((s) => {
      add(s.keyPage, `sections ${found.map((f) => f.page).join(',')} vs ${expected.map((e) => e.keyPage).join(',')}`)
    })
  expected.forEach((s, i) => {
    const section = found[i]
    if (!section || section.page !== s.keyPage) return
    if (s.label !== null && !labelled(section.label, s.label))
      add(s.keyPage, `label "${section.label}" vs "${s.label}"`)
    s.anchors
      .filter((a) => !loose(section.text).includes(loose(a)))
      .forEach((a) => {
        add(s.keyPage, `"${a}" not on printed page ${s.label ?? String(i + 1)}`)
      })
  })
  return problems
}

// Printed pages in an accepted order, each with its label and the anchors that must land on it; problems per key page.
export function printedPages(
  key: KeyDoc,
  sections: readonly DomSection[],
  keyPages: readonly number[],
): Map<number, string[]> {
  if (!key.sections) return new Map()
  const count = (m: Map<number, string[]>): number => [...m.values()].reduce((n, p) => n + p.length, 0)
  return [key.sections, ...key.sectionOrders]
    .map((order) => checkOrder(order, sections, keyPages))
    .reduce((best, m) => (count(m) < count(best) ? m : best))
}
