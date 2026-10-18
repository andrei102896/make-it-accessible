import { logged, LogFieldSchema } from './outreach.ts'
import { readTargets, writeTargets } from './outreach-files.ts'

// pnpm outreach:log <sent|followup1|followup2|reply> <date or reply text> <business>...: records sends (several
// businesses at once) and a reply word for word (one business) in outreach/targets.csv.
const [field = '', text = '', ...names] = process.argv.slice(2)
const targets = logged(await readTargets(), LogFieldSchema.parse(field), text, names)
await writeTargets(targets)
console.info(`${field} recorded for ${names.join(', ')}`)
