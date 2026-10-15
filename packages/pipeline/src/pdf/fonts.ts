import type { HeadingClass } from '../model/brief.ts'
import { classOf } from './face.ts'
import { MAX_BUFFER, poppler } from './poppler.ts'

// The class most of the document's fonts belong to (pdffonts lists each font once per encoding and style).
export async function fontClass(pdf: string, pages: number): Promise<HeadingClass | null> {
  const { stdout } = await poppler('pdffonts', ['-l', String(pages), pdf], { maxBuffer: MAX_BUFFER })
  const counts = new Map<HeadingClass, number>()
  for (const line of stdout.split('\n').slice(2)) {
    const c = classOf(line.split(/\s+/)[0] ?? '')
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
