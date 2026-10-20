import type { Page } from 'playwright'
import { covers, ownFaceIn } from '@make-it-accessible/pipeline/html/printface'

// A line in the PDF's own face keeps it only where the face loaded and draws every letter the line shows (model-filled
// letters and codes included; text read only by screen readers aside); else the whole line takes its stand-in, never
// a face change mid-word. Then every face the page now uses must load: one that fails would measure a fallback.
export async function ownFacesKept(tab: Page): Promise<{ index: number; why: string }[]> {
  const seen = await tab.evaluate(async () => {
    await document.fonts.ready
    const faces = [...document.fonts].map((f) => ({
      family: f.family.replace(/^"|"$/g, ''),
      range: f.unicodeRange,
      ok: f.status !== 'error',
    }))
    const lines = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')].map((el) => {
      const shown = el.cloneNode(true)
      if (shown instanceof HTMLElement)
        for (const hidden of shown.querySelectorAll('.sr-only, [data-free], .icon')) hidden.remove()
      const text = shown.textContent ?? ''
      return {
        ff: el.style.getPropertyValue('--ff'),
        text: getComputedStyle(el).textTransform === 'uppercase' ? text.toUpperCase() : text,
      }
    })
    return { faces, lines }
  })
  const faces = new Map(seen.faces.map((f) => [f.family, f]))
  const drops = seen.lines.flatMap(({ ff, text }, index) => {
    const own = ownFaceIn(ff)
    const face = own ? faces.get(own) : undefined
    if (!own) return []
    if (!face?.ok) return [{ index, why: `${own} did not load; ${JSON.stringify(text.slice(0, 30))} in its stand-in` }]
    return covers(face.range, text)
      ? []
      : [{ index, why: `${own} lacks a letter of ${JSON.stringify(text.slice(0, 30))}` }]
  })
  const broken = await tab.evaluate(
    async (indexes) => {
      const placed = [...document.querySelectorAll<HTMLElement>('[style*="--x:"]')]
      for (const i of indexes) {
        const el = placed[i]
        const rest =
          el?.style
            .getPropertyValue('--ff')
            .trim()
            .replace(/^'pdf-[0-9a-f]+',?\s*/, '') ?? ''
        if (rest) el?.style.setProperty('--ff', rest)
        else el?.style.removeProperty('--ff')
      }
      await document.fonts.ready
      return [...document.fonts].filter((f) => f.status === 'error' && !f.family.includes('pdf-')).map((f) => f.family)
    },
    drops.map((d) => d.index),
  )
  if (broken.length) throw new Error(`${tab.url()}: fonts did not load: ${broken.join(', ')}`)
  return drops
}
