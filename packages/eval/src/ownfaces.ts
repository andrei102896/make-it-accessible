import type { Page } from 'playwright'
import { covers, ownFaceIn } from '@make-it-accessible/pipeline/html/printface'

// A line keeps the PDF's own faces only where each loaded and draws every letter its part shows (screen-reader text
// aside), else it takes its stand-ins whole; then every face the page uses must load, or a fallback is measured.
export async function ownFacesKept(tab: Page): Promise<{ index: number; why: string }[]> {
  const seen = await tab.evaluate(async () => {
    await document.fonts.ready
    const faces = [...document.fonts].map((f) => ({
      family: f.family.replace(/^"|"$/g, ''),
      range: f.unicodeRange,
      ok: f.status !== 'error',
    }))
    // Each placed text and each of its words in another program (`.face`), with the letters it shows.
    const shownIn = (el: HTMLElement, also: string): string => {
      const shown = el.cloneNode(true)
      if (shown instanceof HTMLElement)
        for (const hidden of shown.querySelectorAll(`.sr-only, [data-free], .icon${also}`)) hidden.remove()
      const text = shown.textContent ?? ''
      return getComputedStyle(el).textTransform === 'uppercase' ? text.toUpperCase() : text
    }
    const lines = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')].map((el) => [
      { ff: el.style.getPropertyValue('--ff'), text: shownIn(el, ', .face[style*="--ff:"]') },
      ...[...el.querySelectorAll<HTMLElement>('.face[style*="--ff:"]')].map((w) => ({
        ff: w.style.getPropertyValue('--ff'),
        text: shownIn(w, ''),
      })),
    ])
    return { faces, lines }
  })
  const faces = new Map(seen.faces.map((f) => [f.family, f]))
  // One part its own face cannot draw drops every own face of the line: never a face change mid-line.
  const drops = seen.lines.flatMap((parts, index) =>
    parts
      .flatMap(({ ff, text }) => {
        const own = ownFaceIn(ff)
        const face = own ? faces.get(own) : undefined
        if (!own) return []
        if (!face?.ok)
          return [{ index, why: `${own} did not load; ${JSON.stringify(text.slice(0, 30))} in its stand-in` }]
        return covers(face.range, text)
          ? []
          : [{ index, why: `${own} lacks a letter of ${JSON.stringify(text.slice(0, 30))}` }]
      })
      .slice(0, 1),
  )
  const broken = await tab.evaluate(
    async (indexes) => {
      const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')]
      for (const i of indexes) {
        const el = placed[i]
        if (!el) continue
        for (const part of [el, ...el.querySelectorAll<HTMLElement>('.face[style*="--ff:"]')]) {
          const rest = part.style
            .getPropertyValue('--ff')
            .trim()
            .replace(/^'pdf-[0-9a-f]+',?\s*/, '')
          if (rest) part.style.setProperty('--ff', rest)
          else part.style.removeProperty('--ff')
        }
      }
      await document.fonts.ready
      return [...document.fonts].filter((f) => f.status === 'error' && !f.family.includes('pdf-')).map((f) => f.family)
    },
    drops.map((d) => d.index),
  )
  if (broken.length) throw new Error(`${tab.url()}: fonts did not load: ${broken.join(', ')}`)
  return drops
}
