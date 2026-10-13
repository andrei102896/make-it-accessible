import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileSha256 } from './keys.ts'

// SHA-256 of every file under a folder, by path relative to it.
export async function hashes(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }))
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name)
      files[relative(dir, path)] = await fileSha256(path)
    }
  return files
}
