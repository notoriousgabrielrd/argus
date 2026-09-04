import { mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ObsidianError } from '../../shared/obsidian-errors'
import { OBSIDIAN_MAX_WRITE_BYTES, type ObsidianNoteWriteResult } from '../../shared/obsidian-types'
import { invalidateVaultIndex } from './vault-index'
import { vaultRelativePath } from './vault-paths'

export function assertWritableSize(content: string): void {
  const bytes = Buffer.byteLength(content, 'utf-8')
  if (bytes > OBSIDIAN_MAX_WRITE_BYTES) {
    throw new ObsidianError(
      'obsidian_write_too_large',
      `Note content is ${bytes} bytes; the write limit is ${OBSIDIAN_MAX_WRITE_BYTES}.`
    )
  }
}

/**
 * Publishes through a sibling temp file so a crash mid-write can never leave a
 * half-written note behind — Obsidian's sync clients would replicate the damage.
 */
export function writeNoteFile(
  vault: { id: string; path: string },
  absolutePath: string,
  content: string,
  options: { created: boolean } = { created: false }
): ObsidianNoteWriteResult {
  assertWritableSize(content)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  const tempPath = `${absolutePath}.argus-tmp`
  try {
    writeFileSync(tempPath, content, 'utf-8')
    renameSync(tempPath, absolutePath)
  } catch (error) {
    throw new ObsidianError(
      'obsidian_error',
      `Could not write "${vaultRelativePath(vault.path, absolutePath)}": ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  invalidateVaultIndex(vault.id)
  const stats = statSync(absolutePath)
  return {
    path: vaultRelativePath(vault.path, absolutePath),
    created: options.created,
    bytes: stats.size,
    modifiedAt: new Date(stats.mtimeMs).toISOString()
  }
}
