// A result that fell back (a deadline, an error caught, a smaller render) is marked on stderr: `pnpm measure` runs
// its document again alone and never reads a marked result as a measure (eval/measure.ts).
export const DEGRADED = 'DEGRADED'

export function degraded(why: string): void {
  console.error(`${DEGRADED} ${why}`)
}
