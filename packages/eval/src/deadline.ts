// pdf.js and a browser tab get one deadline per call. pdf.js yields only between its work slices, so a font parse
// that never yields still runs on; the caller's fallback stands in, and a stuck tab is closed by its owner.
export const PDFJS_TIMEOUT_MS = 60_000

export async function withDeadline<T>(work: Promise<T>, ms: number, why: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(why))
    }, ms)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}
