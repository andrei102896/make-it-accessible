// What VoiceOver says, item by item, on a page opened in Safari; the transcript is written next to the page.
// Driven through VoiceOver's own AppleScript: needs "Allow VoiceOver to be controlled with AppleScript" and Automation.
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const STARTER = '/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter'
const MAX_STEPS = Number(process.env['LISTEN_MAX_STEPS'] ?? 600)
const LOAD_MS = 3000
const START_TIMEOUT_MS = 15_000
// VoiceOver updates its last phrase a moment after the cursor moves.
const SPEAK_S = 0.4
// Time to finish speaking before the next move cuts it off; about VoiceOver's default rate, with a floor
// because short text such as "£12.00" is spoken long.
const MIN_SPEAK_MS = 1500
const MS_PER_CHAR = 70
// Moves allowed to find the page among the window's parts (toolbar, tab bar, page).
const MAX_SEEK = 30
const WEB_AREA = /web content|HTML content/i
// At the end of the page VoiceOver keeps repeating the last item.
const END_REPEATS = 3

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const osa = async (script: string): Promise<string> => (await run('osascript', ['-e', script])).stdout.trim()
const voRunning = async (): Promise<boolean> =>
  (await osa('tell application "System Events" to (exists process "VoiceOver")')) === 'true'
const step = async (move: string): Promise<string> => {
  const phrase = await osa(`tell application "VoiceOver"
  tell vo cursor to move ${move}
  delay ${SPEAK_S}
  return content of last phrase
end tell`)
  console.log(`[${move}] ${phrase}`)
  return phrase
}

const page = process.argv[2]
if (!page) throw new Error('Usage: pnpm listen <page.html>')
const path = resolve(page)
if (await voRunning()) throw new Error('VoiceOver is already on; turn it off (Cmd+F5) first')

await run('open', ['-a', 'Safari', path])
await sleep(LOAD_MS)
const heard: string[] = []
// Ctrl+C ends the reading; VoiceOver is still turned off and what was heard is kept.
const stop = new AbortController()
process.once('SIGINT', () => {
  stop.abort()
})
try {
  await run(STARTER)
  const t0 = Date.now()
  while (!(await voRunning())) {
    if (Date.now() - t0 > START_TIMEOUT_MS) throw new Error('VoiceOver did not start')
    await sleep(250)
  }
  await osa('tell application "Safari" to activate')
  await sleep(LOAD_MS)
  // Safari may leave focus in its address bar: climb out of the toolbar and step to the page.
  let at = await osa('tell application "VoiceOver" to return content of last phrase')
  console.log(`[start] ${at}`)
  for (let i = 0; !WEB_AREA.test(at); i++) {
    if (i === MAX_SEEK) throw new Error(`Page not found in the Safari window; last item: ${at}`)
    at = await step(i % 10 === 0 ? 'out of item' : 'right')
  }
  heard.push(await step('into item'))
  heard.push(await step('to first item'))
  for (let i = 0, same = 0; i < MAX_STEPS && same < END_REPEATS && !stop.signal.aborted; i++) {
    const phrase = await step('right')
    await sleep(MIN_SPEAK_MS + phrase.length * MS_PER_CHAR)
    same = phrase === heard.at(-1) ? same + 1 : 0
    if (same === 0) heard.push(phrase)
  }
} finally {
  await osa('tell application "VoiceOver" to quit').catch(() => undefined)
  const out = `${path.replace(/\.html?$/, '')}.voiceover.txt`
  await writeFile(out, heard.join('\n') + '\n')
  console.log(`${heard.length} items heard, written to ${out}`)
}
