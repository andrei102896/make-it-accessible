import { norm } from '@make-it-accessible/pipeline/text/normalize'

const NEGATION = /\b(?:ohne|without|not|excl|excluding|kein|keine|keinen|zonder|sans|hors|non)\s*$/
const words = (s: string): string =>
  ` ${norm(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

// A condition holds when it is a whole phrase of the text and no negation stands right before it ("ohne Lidl Plus").
export function holds(condition: string, text: string): boolean {
  const c = words(condition)
  const t = words(text)
  let at = t.indexOf(c)
  while (at >= 0) {
    if (!NEGATION.test(t.slice(0, at)) || NEGATION.test(c.trim().split(' ')[0] ?? '')) return true
    at = t.indexOf(c, at + 1)
  }
  return false
}
