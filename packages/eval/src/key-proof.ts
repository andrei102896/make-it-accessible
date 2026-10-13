import { readMoney } from './score/money.ts'
import { CENTS, EUROS, SMALLER } from './ledger.ts'
import type { Word } from './words.ts'

// Leaflets print cents right of and top-aligned with the euros; the text stream may put them anywhere.
function chainedAmounts(words: readonly Word[]): number[] {
  return words.flatMap((a) => {
    if (!EUROS.test(a.str)) return []
    const right = a.x + a.w
    return words.flatMap((b) => {
      if (b === a || !CENTS.test(b.str) || b.h > a.h * SMALLER) return []
      const near = b.x >= right - 0.2 * a.h && b.x <= right + 0.5 * a.h
      const top = b.y >= a.y - 0.2 * a.h && b.y <= a.y + 0.5 * a.h
      if (!near || !top) return []
      const sign = /^[-−]/.test(a.str) ? -1 : 1
      return [sign * (Number(a.str.replace(/\D/g, '')) * 100 + (/\d/.test(b.str) ? Number(b.str) : 0))]
    })
  })
}

// Every amount the text layer proves: single words that read as money, plus euros chained to their cents.
export function provenAmounts(words: readonly Word[]): Set<number> {
  const single = words.flatMap((w) =>
    /\d/.test(w.str) && /[.,€£$]|\dp$/.test(w.str) ? (readMoney(w.str)?.cents ?? []) : [],
  )
  return new Set([...single, ...chainedAmounts(words)])
}
