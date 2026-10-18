import { byAddress, DAILY_MAX, Day, due, followUp } from './outreach.ts'
import { localDay, readBatches, readTargets } from './outreach-files.ts'

// pnpm outreach:due [--date YYYY-MM-DD]: today's follow-ups, oldest first, ready to paste as replies in their
// threads, and the command that records them once Andrei has sent them. Never sends anything.
const at = process.argv.indexOf('--date')
const today = Day.parse(at >= 0 ? process.argv[at + 1] : localDay(new Date()))
const all = due(await readTargets(), today)
const shown = all.slice(0, DAILY_MAX)
const firsts = byAddress(await readBatches())

console.info(
  `${String(all.length)} follow-ups due on ${today}${all.length > shown.length ? `, the first ${String(shown.length)} below` : ''}.`,
  `Reply in each one's thread (search Proton by address) and delete Proton's "Sent with Proton Mail" line.\n`,
)
shown.forEach(({ target: t, n }, i) => {
  const first = firsts.get(t.email.toLowerCase())
  const { text, guessed } = followUp(t, first, n)
  console.info(
    `── ${String(i + 1)}/${String(shown.length)} · follow-up ${String(n)} · ${t.business} · ${t.country} · sent ${t.sent}`,
  )
  console.info(
    `To ${t.email}${first ? ` · thread "${first.subject}"` : ''}${first?.tz ? ` · send in their morning (${first.tz})` : ''}`,
  )
  if (guessed)
    console.info('CHECK: the first email is not in the batches or names no document; greeting or "menu" guessed')
  console.info(`\n${text}\n`)
})
for (const n of [1, 2] as const) {
  const names = shown.filter((d) => d.n === n).map((d) => JSON.stringify(d.target.business))
  if (names.length) console.info(`Once sent: pnpm outreach:log followup${String(n)} ${today} ${names.join(' ')}`)
}
